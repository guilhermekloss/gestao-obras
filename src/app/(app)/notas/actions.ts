"use server";

import { Prisma, type TipoDocumento } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notaSchema, type NotaInput } from "@/schemas/nota";
import {
  avisoParcelasPagas,
  reconciliarParcelas,
  validarParcelas,
  type ParcelaExistente,
} from "@/services/parcelas";
import { exigeNumero, gerarNumeroDocumento, PREFIXO_DOCUMENTO } from "@/services/financeiro";
import { validarRateio, calcularTotalItem, somaItens } from "@/services/rateio";
import { fornecedorSchema, criarFornecedorValidado } from "@/services/fornecedores";
import { chaveAcessoValida } from "@/services/leitura-documento";
import { dataParaInput, formatarMoeda, formatarPercentBp } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { erroEtapasDoRateio } from "@/services/obras";

type SalvarNotaResult = ActionResult & { id?: string };

export const salvarNota = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    revalidar: ["/notas", "/contas"],
    atividade: (input: NotaInput) => (input.id ? "nota.editar" : "nota.criar"),
  },
  async (user, input: NotaInput): Promise<SalvarNotaResult> => {
    const parsed = notaSchema.safeParse(input);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;
    const tipoDocumento = d.tipoDocumento ?? "NF";

    if (exigeNumero(tipoDocumento) && !d.numero) {
      return { ok: false, erro: "Número da NF é obrigatório" };
    }
    const erroEtapa = await erroEtapasDoRateio(d.rateios);
    if (erroEtapa) return { ok: false, erro: erroEtapa };
    const rateio = validarRateio(d.rateios);
    if (!rateio.ok) {
      return {
        ok: false,
        erro: `Rateio deve somar 100% (atual: ${formatarPercentBp(rateio.somaBp)})`,
      };
    }
    const parcelas = validarParcelas(d.parcelas, d.totalCents);
    if (!parcelas.ok) {
      return {
        ok: false,
        erro: `Soma das parcelas difere do total da nota em ${formatarMoeda(parcelas.diferencaCents)}`,
      };
    }

    // bloqueio, não aviso: o @@unique(fornecedorId, numero) faria "salvar mesmo assim" falhar
    if (d.numero) {
      const repetida = await prisma.notaFiscal.findFirst({
        where: {
          fornecedorId: d.fornecedorId,
          numero: d.numero,
          ...(d.id ? { NOT: { id: d.id } } : {}),
        },
        select: { tipoDocumento: true },
      });
      if (repetida) return { ok: false, erro: mensagemNumeroRepetido(tipoDocumento, d.numero) };
    }

    const chaveNfe = d.id ? undefined : d.chaveNfe;
    if (chaveNfe) {
      if (!chaveAcessoValida(chaveNfe)) return { ok: false, erro: "Chave de acesso inválida" };
      const mesma = await prisma.notaFiscal.findUnique({ where: { chaveNfe }, select: { numero: true } });
      if (mesma) return { ok: false, erro: `Esta NF-e já foi lançada (NF ${mesma.numero}).` };
    }

    const reconciliacao = reconciliarParcelas(
      d.id ? await parcelasExistentes(d.id) : [],
      d.parcelas,
    );

    // avisos todos numa só pergunta: confirmar um não pode pular os demais em silêncio
    if (!d.forcar) {
      const avisos: string[] = [];
      const somaItensCents = somaItens(d.itens);
      if (somaItensCents !== d.totalCents) {
        avisos.push(
          `Soma dos itens (${formatarMoeda(somaItensCents)}) difere do valor total (${formatarMoeda(d.totalCents)}).`,
        );
      }
      const avisoPagas = avisoParcelasPagas(reconciliacao.pagasAfetadas);
      if (avisoPagas) avisos.push(avisoPagas);
      if (avisos.length > 0) {
        return { ok: false, aviso: true, erro: [...avisos, "Salvar mesmo assim?"].join("\n\n") };
      }
    }

    const dadosNota = {
      fornecedorId: d.fornecedorId,
      tipoDocumento,
      dataCompra: new Date(d.dataCompra),
      totalCents: d.totalCents,
      formaPagto: d.formaPagto,
      obs: d.obs || null,
      anexoUrl: d.anexoUrl || null,
      anexoNome: d.anexoNome || null,
    };

    const id = await prisma.$transaction(async (tx) => {
      let numero = d.numero;
      if (!numero && !exigeNumero(tipoDocumento)) {
        const existentes = await tx.notaFiscal.findMany({
          where: {
            fornecedorId: d.fornecedorId,
            numero: { startsWith: `${PREFIXO_DOCUMENTO[tipoDocumento]}-` },
          },
          select: { numero: true },
        });
        numero = gerarNumeroDocumento(tipoDocumento, existentes.map((n) => n.numero));
      }

      let notaId = d.id;
      if (notaId) {
        await tx.itemNota.deleteMany({ where: { notaId } });
        await tx.rateioNota.deleteMany({ where: { notaId } });
        await tx.notaFiscal.update({ where: { id: notaId }, data: { ...dadosNota, numero } });
      } else {
        const nota = await tx.notaFiscal.create({
          data: { ...dadosNota, numero, chaveNfe, createdBy: user.id },
        });
        notaId = nota.id;
      }

      await tx.rateioNota.createMany({
        data: d.rateios.map((r) => ({
          notaId: notaId!,
          obraId: r.obraId,
          etapaId: r.etapaId || null,
          fracaoBp: r.fracaoBp,
        })),
      });

      await tx.itemNota.createMany({
        data: d.itens.map((item) => ({
          notaId: notaId!,
          descricao: item.descricao,
          tipo: item.tipo,
          qtde: item.qtde,
          unidade: item.unidade,
          unitCents: item.unitCents,
          descontoCents: item.descontoCents,
          totalCents: calcularTotalItem(item.qtde, item.unitCents, item.descontoCents),
        })),
      });

      // `manter` não é tocada (preserva status/pagaEm); alteradas voltam a ABERTA
      if (reconciliacao.removidas.length > 0) {
        await tx.parcela.deleteMany({
          where: { notaId, numero: { in: reconciliacao.removidas } },
        });
      }
      for (const p of reconciliacao.parcelas.filter((p) => p.acao === "atualizar")) {
        await tx.parcela.update({
          where: { notaId_numero: { notaId, numero: p.numero } },
          data: {
            valorCents: p.valorCents,
            vencimento: new Date(p.vencimento),
            status: p.status,
            pagaEm: p.pagaEm,
          },
        });
      }
      const criar = reconciliacao.parcelas.filter((p) => p.acao === "criar");
      if (criar.length > 0) {
        await tx.parcela.createMany({
          data: criar.map((p) => ({
            notaId: notaId!,
            numero: p.numero,
            valorCents: p.valorCents,
            vencimento: new Date(p.vencimento),
          })),
        });
      }

      return { notaId, numero };
    }).catch((erro: unknown) => {
      // corrida: outro lançamento pegou o mesmo número entre a checagem e a gravação
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return null;
      }
      throw erro;
    });

    if (!id) return { ok: false, erro: mensagemNumeroRepetido(tipoDocumento, d.numero) };

    const fornecedor = await prisma.fornecedor.findUnique({ where: { id: d.fornecedorId }, select: { nome: true } });
    anotarAtividade({
      descricao: `${d.id ? "Editou" : "Lançou"} ${ROTULO_DOCUMENTO[tipoDocumento]} ${id.numero} — ${fornecedor?.nome ?? "fornecedor"} (${formatarMoeda(d.totalCents)})`,
      entidade: "nota",
      entidadeId: id.notaId,
      obraIds: d.rateios.map((r) => r.obraId),
      valorCents: d.totalCents,
    });
    return { ok: true, id: id.notaId };
  },
);

async function parcelasExistentes(notaId: string): Promise<ParcelaExistente[]> {
  const parcelas = await prisma.parcela.findMany({
    where: { notaId },
    select: { numero: true, valorCents: true, vencimento: true, status: true, pagaEm: true },
  });
  // mesma conversão da tela de edição: parcela não mexida volta idêntica e é mantida
  return parcelas.map((p) => ({ ...p, vencimento: dataParaInput(p.vencimento) }));
}

const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  NF: "a NF",
  RECIBO: "o recibo",
  FOLHA: "a folha",
  GUIA: "a guia",
  OUTRO: "o documento",
};

function mensagemNumeroRepetido(tipo: TipoDocumento, numero: string): string {
  if (tipo === "NF") {
    return `Já existe a NF ${numero} deste fornecedor. Confira se a nota não foi lançada antes.`;
  }
  return numero
    ? `Já existe um lançamento nº ${numero} deste fornecedor. Use outro número ou deixe em branco para gerar automaticamente.`
    : "Não foi possível gerar o número do lançamento. Tente salvar de novo.";
}

export const excluirNota = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/notas", "/contas"], atividade: "nota.excluir" },
  async (_user, id: string): Promise<ActionResult> => {
    const pagas = await prisma.parcela.count({ where: { notaId: id, status: "PAGA" } });
    if (pagas > 0) {
      return { ok: false, erro: "Nota possui parcelas pagas — não pode ser excluída." };
    }
    const nota = await prisma.notaFiscal.delete({
      where: { id },
      select: {
        numero: true,
        tipoDocumento: true,
        totalCents: true,
        fornecedor: { select: { nome: true } },
        rateios: { select: { obraId: true } },
      },
    });
    anotarAtividade({
      descricao: `Excluiu ${ROTULO_DOCUMENTO[nota.tipoDocumento]} ${nota.numero} — ${nota.fornecedor.nome} (${formatarMoeda(nota.totalCents)})`,
      entidade: "nota",
      entidadeId: id,
      obraIds: nota.rateios.map((r) => r.obraId),
      valorCents: nota.totalCents,
    });
    return { ok: true };
  },
);

type CriarFornecedorInlineResult = ActionResult & {
  fornecedor?: { id: string; nome: string; cnpj: string | null };
};

export const criarFornecedorInline = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/fornecedores"], atividade: "fornecedor.criar" },
  async (_user, nome: string, cnpj?: string): Promise<CriarFornecedorInlineResult> => {
    const parsed = fornecedorSchema.safeParse({ nome, cnpj: cnpj?.trim() || undefined });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const resultado = await criarFornecedorValidado(parsed.data);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    anotarAtividade({
      descricao: `Cadastrou o fornecedor ${resultado.fornecedor.nome}`,
      entidade: "fornecedor",
      entidadeId: resultado.fornecedor.id,
    });
    return {
      ok: true,
      fornecedor: {
        id: resultado.fornecedor.id,
        nome: resultado.fornecedor.nome,
        cnpj: resultado.fornecedor.cnpj,
      },
    };
  },
);
