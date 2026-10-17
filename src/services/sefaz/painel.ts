import type { ManifestacaoSefaz, Prisma, SituacaoDocumentoSefaz, StatusDocumentoSefaz, StatusExecucaoSefaz } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { situacaoDaConfig, type SituacaoConfig } from "./config";
import { podeConsultar } from "./regras";
import { nomeDoXmlGuardado } from "./sincronizar";

export const POR_PAGINA = 30;
const DIA = 24 * 60 * 60 * 1000;
export const DIAS_AVISO_CERTIFICADO = 30;
export const DIAS_RECEBIDA_PARADA = 7;
export const ERROS_SEGUIDOS_ALERTA = 3;

export const SITUACAO_LABELS: Record<SituacaoDocumentoSefaz, string> = {
  RESUMO: "Só resumo",
  COMPLETO: "XML completo",
  CANCELADA: "Cancelada",
};

export const MANIFESTACAO_LABELS: Record<ManifestacaoSefaz, string> = {
  PENDENTE: "Ciência pendente",
  CIENCIA_ENVIADA: "Ciência enviada",
  ERRO: "Ciência com erro",
  DISPENSADA: "Sem Ciência",
};

export const STATUS_DOC_LABELS: Record<StatusDocumentoSefaz, string> = {
  NOVA: "A lançar",
  LANCADA: "Lançada",
  DESCARTADA: "Descartada",
};

export const STATUS_EXECUCAO_LABELS: Record<StatusExecucaoSefaz, string> = {
  SUCESSO: "Com novidades",
  SEM_NOVIDADES: "Sem novidades",
  PULADA: "Pulada",
  ERRO: "Erro",
  BLOQUEADA: "Bloqueada (656)",
};

export type EstadoCursor = "ATIVO" | "AGUARDANDO" | "BLOQUEADO" | "ERRO" | "NUNCA";

export function estadoDoCursor(
  c: { proximaConsultaEm: Date | null; bloqueadoAte: Date | null; ultimaConsultaEm: Date | null } | null,
  ultimaExecucao: { status: StatusExecucaoSefaz } | null,
  agora: Date,
): EstadoCursor {
  if (!c?.ultimaConsultaEm) return "NUNCA";
  const p = podeConsultar(c, agora);
  if (!p.pode && p.motivo === "BLOQUEADO") return "BLOQUEADO";
  if (ultimaExecucao?.status === "ERRO") return "ERRO";
  return p.pode ? "ATIVO" : "AGUARDANDO";
}

/** Execuções com erro seguidas, da mais recente para trás (puladas não contam nem quebram a sequência). */
export function errosSeguidos(execucoes: { status: StatusExecucaoSefaz }[]): number {
  let n = 0;
  for (const e of execucoes) {
    if (e.status === "PULADA") continue;
    if (e.status !== "ERRO") break;
    n++;
  }
  return n;
}

export type AlertaCaptura = {
  id: string;
  tipo: "SEFAZ_CERTIFICADO" | "SEFAZ_FALHA" | "NFE_RECEBIDA";
  severidade: "CRITICA" | "ATENCAO";
  mensagem: string;
  link: string;
};

export function alertasDaCaptura(
  e: {
    habilitado: boolean;
    validadeCertificado: Date | null;
    erroCertificado: string | null;
    cursores: { cnpj: string; bloqueadoAte: Date | null; errosSeguidos: number }[];
    recebidasParadas: number;
    paraAdmin: boolean;
  },
  agora: Date,
): AlertaCaptura[] {
  const alertas: AlertaCaptura[] = [];
  if (e.recebidasParadas > 0) {
    alertas.push({
      id: "nfe-recebida-parada",
      tipo: "NFE_RECEBIDA",
      severidade: "ATENCAO",
      mensagem: `${e.recebidasParadas} NF-e recebida${e.recebidasParadas === 1 ? "" : "s"} da Sefaz há mais de ${DIAS_RECEBIDA_PARADA} dias sem lançar`,
      link: "/notas/recebidas",
    });
  }
  if (!e.habilitado || !e.paraAdmin) return alertas;

  if (e.erroCertificado) {
    alertas.push({ id: "sefaz-cert", tipo: "SEFAZ_CERTIFICADO", severidade: "CRITICA", mensagem: `Captura de NF-e parada: ${e.erroCertificado}`, link: "/sefaz" });
  } else if (e.validadeCertificado) {
    const dias = Math.ceil((e.validadeCertificado.getTime() - agora.getTime()) / DIA);
    if (dias <= 0) {
      alertas.push({ id: "sefaz-cert", tipo: "SEFAZ_CERTIFICADO", severidade: "CRITICA", mensagem: "Certificado A1 vencido: a captura de NF-e na Sefaz parou", link: "/sefaz" });
    } else if (dias <= DIAS_AVISO_CERTIFICADO) {
      alertas.push({
        id: "sefaz-cert",
        tipo: "SEFAZ_CERTIFICADO",
        severidade: "ATENCAO",
        mensagem: `Certificado A1 vence em ${dias} dia${dias === 1 ? "" : "s"}: renove para a captura de NF-e não parar`,
        link: "/sefaz",
      });
    }
  }
  for (const c of e.cursores) {
    if (c.bloqueadoAte && c.bloqueadoAte > agora) {
      alertas.push({ id: `sefaz-bloqueio-${c.cnpj}`, tipo: "SEFAZ_FALHA", severidade: "CRITICA", mensagem: `Sefaz bloqueou a consulta do CNPJ ${c.cnpj} por consumo indevido`, link: "/sefaz" });
    } else if (c.errosSeguidos >= ERROS_SEGUIDOS_ALERTA) {
      alertas.push({
        id: `sefaz-erros-${c.cnpj}`,
        tipo: "SEFAZ_FALHA",
        severidade: "CRITICA",
        mensagem: `Captura de NF-e do CNPJ ${c.cnpj} falhou ${c.errosSeguidos} vezes seguidas`,
        link: "/sefaz?aba=execucoes",
      });
    }
  }
  return alertas;
}

export async function carregarAlertasDaCaptura(paraAdmin: boolean, agora: Date = new Date()): Promise<AlertaCaptura[]> {
  const config = situacaoDaConfig();
  const [recebidasParadas, cursores] = await Promise.all([
    prisma.documentoSefaz.count({
      where: { status: "NOVA", situacao: "COMPLETO", recebidoEm: { lt: new Date(agora.getTime() - DIAS_RECEBIDA_PARADA * DIA) } },
    }),
    paraAdmin && config.habilitado ? carregarCursores(config.cnpjs) : Promise.resolve([]),
  ]);
  return alertasDaCaptura(
    {
      habilitado: config.habilitado,
      validadeCertificado: config.certificado?.validoAte ?? null,
      erroCertificado: config.erroCertificado,
      cursores: cursores.map((c) => ({ cnpj: c.cnpj, bloqueadoAte: c.cursor?.bloqueadoAte ?? null, errosSeguidos: c.errosSeguidos })),
      recebidasParadas,
      paraAdmin,
    },
    agora,
  );
}

async function carregarCursores(cnpjs: string[]) {
  return Promise.all(
    cnpjs.map(async (cnpj) => {
      const [cursor, recentes] = await Promise.all([
        prisma.cursorSefaz.findUnique({ where: { cnpj } }),
        prisma.execucaoSefaz.findMany({ where: { cnpj }, orderBy: { iniciadaEm: "desc" }, take: 10, select: { status: true, iniciadaEm: true, mensagem: true } }),
      ]);
      return { cnpj, cursor, ultimaExecucao: recentes.find((e) => e.status !== "PULADA") ?? null, errosSeguidos: errosSeguidos(recentes) };
    }),
  );
}

export type Painel = {
  config: SituacaoConfig;
  cnpjs: (Awaited<ReturnType<typeof carregarCursores>>[number] & { estado: EstadoCursor })[];
  docs24h: number;
  docs7d: number;
  aLancar: number;
  aguardandoXml: number;
  cienciasComErro: number;
};

export async function carregarPainel(agora: Date = new Date()): Promise<Painel> {
  const config = situacaoDaConfig();
  const [cursores, docs24h, docs7d, aLancar, aguardandoXml, cienciasComErro] = await Promise.all([
    carregarCursores(config.cnpjs),
    prisma.documentoSefaz.count({ where: { recebidoEm: { gte: new Date(agora.getTime() - DIA) } } }),
    prisma.documentoSefaz.count({ where: { recebidoEm: { gte: new Date(agora.getTime() - 7 * DIA) } } }),
    prisma.documentoSefaz.count({ where: { status: "NOVA", situacao: "COMPLETO" } }),
    prisma.documentoSefaz.count({ where: { status: "NOVA", situacao: "RESUMO" } }),
    prisma.documentoSefaz.count({ where: { manifestacao: "ERRO", situacao: "RESUMO" } }),
  ]);
  return {
    config,
    cnpjs: cursores.map((c) => ({ ...c, estado: estadoDoCursor(c.cursor, c.ultimaExecucao, agora) })),
    docs24h,
    docs7d,
    aLancar,
    aguardandoXml,
    cienciasComErro,
  };
}

export async function listarExecucoes(pagina: number) {
  const [execucoes, total] = await Promise.all([
    prisma.execucaoSefaz.findMany({ orderBy: { iniciadaEm: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.execucaoSefaz.count(),
  ]);
  return { execucoes, total };
}

export type FiltroDocumentos = {
  situacao?: SituacaoDocumentoSefaz;
  manifestacao?: ManifestacaoSefaz;
  status?: StatusDocumentoSefaz;
};

export async function listarDocumentos(filtro: FiltroDocumentos, pagina: number) {
  const where: Prisma.DocumentoSefazWhereInput = { ...filtro };
  const [documentos, total] = await Promise.all([
    prisma.documentoSefaz.findMany({ where, orderBy: { dataEmissao: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.documentoSefaz.count({ where }),
  ]);
  return { documentos, total };
}

/** Caixa de entrada: notas a lançar (completas) e as que ainda esperam o XML depois da Ciência. */
export async function listarRecebidas() {
  return prisma.documentoSefaz.findMany({
    where: { status: "NOVA", situacao: { in: ["COMPLETO", "RESUMO"] } },
    orderBy: [{ situacao: "asc" }, { dataEmissao: "desc" }],
    take: 200,
  });
}

export async function contarRecebidas(): Promise<number> {
  return prisma.documentoSefaz.count({ where: { status: "NOVA", situacao: "COMPLETO" } });
}

/** XML de uma NF-e recebida, para abrir no fluxo de importação. */
export async function xmlDaRecebida(id: string): Promise<{ nome: string; xml: string } | null> {
  const doc = await prisma.documentoSefaz.findUnique({ where: { id }, select: { chave: true, xmlUrl: true, status: true } });
  const nome = nomeDoXmlGuardado(doc?.xmlUrl ?? null);
  if (!doc || !nome || doc.status !== "NOVA") return null;
  const conteudo = await storage.ler(nome).catch(() => null);
  return conteudo ? { nome: `NFe${doc.chave}.xml`, xml: conteudo.toString("utf8") } : null;
}
