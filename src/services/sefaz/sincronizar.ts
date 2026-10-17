import type { OrigemExecucaoSefaz, Prisma, StatusExecucaoSefaz } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { registrarAtividade } from "@/lib/atividade";
import { formatarDocumento } from "@/services/nfe-xml";
import { ErroSefaz, clienteSefaz, type ClienteSefaz } from "./cliente";
import { carregarFonte, montarConfig } from "./config";
import {
  DURACAO_TRAVA_MS,
  ESPERA_APOS_FALHA_MS,
  MAX_CIENCIAS_POR_EXECUCAO,
  MAX_LOTES_POR_EXECUCAO,
  avaliarResposta,
  cienciaAceita,
  podeConsultar,
} from "./regras";
import { classificarDocumento, dadosDaChaveNfe, normalizarCnpj, raizCnpj, type DocumentoDistribuido } from "./xml";

export type ResultadoCnpj = {
  cnpj: string;
  status: StatusExecucaoSefaz;
  mensagem: string;
  docsNovos: number;
  ciencias: number;
};

type Contexto = {
  cliente: ClienteSefaz;
  origem: OrigemExecucaoSefaz;
  usuarioId: string | null;
  agora: () => Date;
};

// O storage devolve /api/fotos/<nome>; .xml fica fora da lista de arquivos servidos ao navegador
// (services/arquivos), então o nome é conferido aqui.
const XML_GUARDADO = /^\/api\/fotos\/(\d{10,16}-[0-9a-f]{8,32}\.xml)$/;

export function nomeDoXmlGuardado(url: string | null): string | null {
  return (url && XML_GUARDADO.exec(url)?.[1]) || null;
}

/** Data de emissão (aaaa-mm-dd) ao meio-dia UTC, como as demais datas de nota: não muda de dia com o fuso. */
function dataDoDia(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

async function notaJaLancada(chave: string) {
  return prisma.notaFiscal.findUnique({ where: { chaveNfe: chave }, select: { id: true } });
}

/** Grava um documento da fila de forma idempotente (a mesma chave chega como resumo, completo e evento). */
export async function gravarDocumento(doc: DocumentoDistribuido, cnpj: string): Promise<"NOVO" | "ATUALIZADO" | "IGNORADO"> {
  if (doc.tipo === "IGNORADO") return "IGNORADO";

  if (doc.tipo === "CANCELAMENTO") {
    const r = await prisma.documentoSefaz.updateMany({
      where: { chave: doc.chave },
      data: { situacao: "CANCELADA" },
    });
    await prisma.documentoSefaz.updateMany({
      where: { chave: doc.chave, manifestacao: "PENDENTE" },
      data: { manifestacao: "DISPENSADA" },
    });
    return r.count > 0 ? "ATUALIZADO" : "IGNORADO";
  }

  const emitenteDoc = doc.tipo === "RESUMO" ? doc.emitenteDoc : normalizarCnpj(doc.nfe.emitente.documento);
  // nota que a própria empresa emitiu (devolução, remessa) não é compra
  if (emitenteDoc.length === 14 && raizCnpj(emitenteDoc) === raizCnpj(cnpj)) return "IGNORADO";
  if (doc.tipo === "COMPLETO" && doc.nfe.destinatario && raizCnpj(doc.nfe.destinatario) !== raizCnpj(cnpj)) {
    // a empresa aparece só como transportadora ou autorizada a baixar o XML
    return "IGNORADO";
  }

  const chave = doc.tipo === "RESUMO" ? doc.chave : doc.nfe.chave;
  const existente = await prisma.documentoSefaz.findUnique({
    where: { chave },
    select: { id: true, situacao: true, xmlUrl: true, manifestacao: true },
  });

  if (doc.tipo === "RESUMO") {
    if (existente) {
      // resumo repetido não rebaixa nota já completa; só registra cancelamento/denegação
      if (!doc.autorizada && existente.situacao !== "CANCELADA") {
        await prisma.documentoSefaz.update({
          where: { id: existente.id },
          data: {
            situacao: "CANCELADA",
            manifestacao: existente.manifestacao === "PENDENTE" ? "DISPENSADA" : undefined,
          },
        });
        return "ATUALIZADO";
      }
      return "IGNORADO";
    }
    const { numero, serie } = dadosDaChaveNfe(chave);
    const lancada = await notaJaLancada(chave);
    await prisma.documentoSefaz.create({
      data: {
        chave,
        nsu: doc.nsu,
        cnpjDestinatario: cnpj,
        emitenteDoc,
        emitenteNome: doc.emitenteNome,
        numero,
        serie,
        dataEmissao: dataDoDia(doc.dataEmissao),
        valorCents: doc.valorCents,
        situacao: doc.autorizada ? "RESUMO" : "CANCELADA",
        manifestacao: doc.autorizada ? "PENDENTE" : "DISPENSADA",
        status: lancada ? "LANCADA" : "NOVA",
        notaFiscalId: lancada?.id,
      },
    });
    return "NOVO";
  }

  // COMPLETO: guarda o XML uma vez; a Ciência deixa de ser necessária
  if (existente?.xmlUrl) return "IGNORADO";
  const xmlUrl = await storage.salvar(Buffer.from(doc.xml, "utf8"), "xml");
  const dados = {
    nsu: doc.nsu,
    emitenteDoc,
    emitenteNome: doc.nfe.emitente.razaoSocial,
    numero: doc.nfe.numero,
    serie: doc.nfe.serie,
    dataEmissao: dataDoDia(doc.nfe.dataEmissao),
    valorCents: doc.nfe.totalCents,
    xmlUrl,
  } satisfies Prisma.DocumentoSefazUpdateInput;
  try {
    if (existente) {
      await prisma.documentoSefaz.update({
        where: { id: existente.id },
        data: {
          ...dados,
          situacao: existente.situacao === "CANCELADA" ? "CANCELADA" : "COMPLETO",
          manifestacao: existente.manifestacao === "CIENCIA_ENVIADA" ? undefined : "DISPENSADA",
          manifestacaoErro: null,
        },
      });
      return "ATUALIZADO";
    }
    const lancada = await notaJaLancada(chave);
    await prisma.documentoSefaz.create({
      data: {
        ...dados,
        chave,
        cnpjDestinatario: cnpj,
        situacao: "COMPLETO",
        manifestacao: "DISPENSADA",
        status: lancada ? "LANCADA" : "NOVA",
        notaFiscalId: lancada?.id,
      },
    });
    return "NOVO";
  } catch (erro) {
    const nome = nomeDoXmlGuardado(xmlUrl);
    if (nome) await storage.excluir(nome).catch(() => undefined);
    throw erro;
  }
}

/** Ciência das notas que só têm resumo: libera o XML completo numa consulta seguinte. */
export async function manifestarPendentes(
  cnpj: string,
  cliente: ClienteSefaz,
  agora: Date,
  ids?: string[],
): Promise<{ enviadas: number; erros: number; mensagem?: string }> {
  const pendentes = await prisma.documentoSefaz.findMany({
    where: {
      cnpjDestinatario: cnpj,
      situacao: "RESUMO",
      ...(ids ? { id: { in: ids }, manifestacao: { in: ["PENDENTE", "ERRO"] } } : { manifestacao: "PENDENTE" }),
    },
    orderBy: { recebidoEm: "asc" },
    take: MAX_CIENCIAS_POR_EXECUCAO,
    select: { id: true, chave: true },
  });
  if (pendentes.length === 0) return { enviadas: 0, erros: 0 };

  let resultados;
  try {
    resultados = await cliente.enviarCiencia(cnpj, pendentes.map((p) => p.chave), agora);
  } catch (erro) {
    // falha de transporte: ficam pendentes para a próxima execução
    return { enviadas: 0, erros: 0, mensagem: erro instanceof Error ? erro.message : "Falha ao enviar a Ciência" };
  }
  const porChave = new Map(resultados.map((r) => [r.chave, r]));
  let enviadas = 0;
  let erros = 0;
  for (const p of pendentes) {
    const r = porChave.get(p.chave);
    const aceita = r ? cienciaAceita(r.cStat) : false;
    if (aceita) enviadas++;
    else erros++;
    await prisma.documentoSefaz.update({
      where: { id: p.id },
      data: aceita
        ? { manifestacao: "CIENCIA_ENVIADA", manifestadoEm: agora, manifestacaoErro: null }
        : { manifestacao: "ERRO", manifestacaoErro: r ? `${r.cStat} – ${r.xMotivo}`.slice(0, 500) : "Sem retorno da Sefaz para esta nota" },
    });
  }
  return { enviadas, erros };
}

async function registrarExecucao(dados: Prisma.ExecucaoSefazUncheckedCreateInput) {
  await prisma.execucaoSefaz.create({ data: dados });
}

export async function sincronizarCnpj(cnpj: string, ctx: Contexto): Promise<ResultadoCnpj> {
  const inicio = ctx.agora();
  await prisma.cursorSefaz.upsert({ where: { cnpj }, create: { cnpj }, update: {} });

  const pular = async (mensagem: string): Promise<ResultadoCnpj> => {
    // agendada pulada é o normal (o agendador passa a cada 20 min): só a manual fica no histórico
    if (ctx.origem === "MANUAL") {
      await registrarExecucao({
        cnpj,
        origem: ctx.origem,
        status: "PULADA",
        iniciadaEm: inicio,
        finalizadaEm: inicio,
        mensagem,
        duracaoMs: 0,
        disparadaPorId: ctx.usuarioId,
      });
    }
    return { cnpj, status: "PULADA", mensagem, docsNovos: 0, ciencias: 0 };
  };

  // a trava vem antes da leitura do cursor: quem lê o NSU é quem consulta
  const travou = await prisma.cursorSefaz.updateMany({
    where: { cnpj, OR: [{ travadoAte: null }, { travadoAte: { lt: inicio } }] },
    data: { travadoAte: new Date(inicio.getTime() + DURACAO_TRAVA_MS) },
  });
  if (travou.count === 0) return pular("Outra consulta deste CNPJ está em andamento.");
  const destravar = () => prisma.cursorSefaz.update({ where: { cnpj }, data: { travadoAte: null } });

  const cursor = await prisma.cursorSefaz.findUniqueOrThrow({ where: { cnpj } });
  const permissao = podeConsultar(cursor, inicio);
  if (!permissao.pode) {
    await destravar();
    const hora = permissao.ate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    return pular(
      permissao.motivo === "BLOQUEADO"
        ? `CNPJ bloqueado pela Sefaz por consumo indevido até ${hora}.`
        : `Aguardando a janela da Sefaz: a próxima consulta é às ${hora}.`,
    );
  }

  const nsuInicial = cursor.ultNsu;
  let ultNsu = cursor.ultNsu;
  let lotes = 0;
  let docsNovos = 0;
  let status: StatusExecucaoSefaz = "SEM_NOVIDADES";
  let cStat: string | null = null;
  let mensagem = "";
  let ciencias = 0;

  try {
    for (; lotes < MAX_LOTES_POR_EXECUCAO; ) {
      const ret = await ctx.cliente.distribuicaoPorNsu(cnpj, ultNsu);
      lotes++;
      const agora = ctx.agora();
      const aval = avaliarResposta(ret, agora);
      cStat = ret.cStat;
      mensagem = ret.xMotivo;

      for (const bruto of ret.docs) {
        if ((await gravarDocumento(classificarDocumento(bruto), cnpj)) === "NOVO") docsNovos++;
      }
      if (aval.avancar) ultNsu = ret.ultNsu;
      await prisma.cursorSefaz.update({
        where: { cnpj },
        data: {
          ultNsu,
          maxNsu: aval.avancar ? ret.maxNsu : undefined,
          proximaConsultaEm: aval.proximaConsultaEm,
          bloqueadoAte: aval.bloqueadoAte,
          ultimoCStat: ret.cStat,
          ultimoMotivo: ret.xMotivo.slice(0, 500),
          ultimaConsultaEm: agora,
        },
      });

      if (aval.desfecho === "BLOQUEADA") status = "BLOQUEADA";
      else if (aval.desfecho === "REJEITADA") status = "ERRO";
      if (!aval.continuar) break;
    }

    const manifestacao = await manifestarPendentes(cnpj, ctx.cliente, ctx.agora());
    ciencias = manifestacao.enviadas;
    if (manifestacao.mensagem) mensagem = `${mensagem} · Ciência não enviada: ${manifestacao.mensagem}`;
    else if (manifestacao.erros > 0) mensagem = `${mensagem} · ${manifestacao.erros} Ciência(s) recusada(s)`;
    if (status === "SEM_NOVIDADES" && (docsNovos > 0 || ciencias > 0)) status = "SUCESSO";
  } catch (erro) {
    status = "ERRO";
    mensagem = erro instanceof Error ? erro.message : "Erro inesperado na consulta à Sefaz";
    if (!(erro instanceof ErroSefaz)) console.error(`Captura Sefaz: erro inesperado (${cnpj})`, erro);
    await prisma.cursorSefaz.update({
      where: { cnpj },
      data: { proximaConsultaEm: new Date(ctx.agora().getTime() + ESPERA_APOS_FALHA_MS) },
    });
  } finally {
    await destravar();
  }

  const fim = ctx.agora();
  await registrarExecucao({
    cnpj,
    origem: ctx.origem,
    status,
    iniciadaEm: inicio,
    finalizadaEm: fim,
    nsuInicial,
    nsuFinal: ultNsu,
    lotes,
    docsRecebidos: docsNovos,
    ciencias,
    cStat,
    mensagem: mensagem.slice(0, 1000),
    duracaoMs: fim.getTime() - inicio.getTime(),
    disparadaPorId: ctx.usuarioId,
  });
  if (status === "ERRO" || status === "BLOQUEADA") {
    // alerta do Terraform (monitoring.tf) filtra por jsonPayload.evento; sem documento nem certificado no log
    console.error(JSON.stringify({ severity: "ERROR", categoria: "sefaz", evento: status === "ERRO" ? "sefaz_captura_falhou" : "sefaz_bloqueada", cnpj, cStat }));
  }
  if (docsNovos > 0) {
    await registrarAtividade(ctx.usuarioId, "sefaz.captura", {
      descricao: `Sefaz: ${docsNovos} NF-e nova${docsNovos === 1 ? "" : "s"} para o CNPJ ${formatarDocumento(cnpj)}`,
    });
  }
  return { cnpj, status, mensagem, docsNovos, ciencias };
}

export async function sincronizar(opcoes: {
  origem: OrigemExecucaoSefaz;
  usuarioId?: string | null;
  cliente?: ClienteSefaz;
  agora?: () => Date;
}): Promise<{ ok: true; resultados: ResultadoCnpj[] } | { ok: false; erro: string }> {
  const montada = montarConfig(await carregarFonte());
  if (!montada.ok) return montada;
  const ctx: Contexto = {
    cliente: opcoes.cliente ?? clienteSefaz(montada.config),
    origem: opcoes.origem,
    usuarioId: opcoes.usuarioId ?? null,
    agora: opcoes.agora ?? (() => new Date()),
  };
  const resultados: ResultadoCnpj[] = [];
  // em sequência: CNPJs da mesma raiz dividem o mesmo certificado e o mesmo limite de consumo
  for (const cnpj of montada.cnpjs) resultados.push(await sincronizarCnpj(cnpj, ctx));
  return { ok: true, resultados };
}

/** Reenvio manual da Ciência (painel do ADMIN) para notas que ficaram com erro. */
export async function reenviarCiencia(ids: string[]): Promise<{ ok: true; enviadas: number; erros: number } | { ok: false; erro: string }> {
  const montada = montarConfig(await carregarFonte());
  if (!montada.ok) return montada;
  const cliente = clienteSefaz(montada.config);
  const docs = await prisma.documentoSefaz.findMany({ where: { id: { in: ids } }, select: { cnpjDestinatario: true } });
  let enviadas = 0;
  let erros = 0;
  for (const cnpj of new Set(docs.map((d) => d.cnpjDestinatario))) {
    const r = await manifestarPendentes(cnpj, cliente, new Date(), ids);
    if (r.mensagem) return { ok: false, erro: r.mensagem };
    enviadas += r.enviadas;
    erros += r.erros;
  }
  return { ok: true, enviadas, erros };
}
