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
import { dataParaInput, formatarMoeda, formatarPercentBp } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";

export type SalvarNotaResult = ActionResult & { id?: string };

export const salvarNota = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/notas", "/contas"] },
  async (user, input: NotaInput): Promise<SalvarNotaResult> => {
    const parsed = notaSchema.safeParse(input);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;
    const tipoDocumento = d.tipoDocumento ?? "NF";

    // Regras de bloqueio
    if (exigeNumero(tipoDocumento) && !d.numero) {
      return { ok: false, erro: "Número da NF é obrigatório" };
    }
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

    // Número repetido no mesmo fornecedor é bloqueio, não aviso: o banco tem
    // unicidade (fornecedorId, numero), então "salvar mesmo assim" falharia.
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

    // Edição: casa as parcelas pelo número para preservar os pagamentos.
    const reconciliacao = reconciliarParcelas(
      d.id ? await parcelasExistentes(d.id) : [],
      d.parcelas,
    );

    // Avisos (contornáveis com confirmação) — todos juntos numa só pergunta,
    // para a confirmação de um não pular os demais em silêncio.
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
      // Documento sem número próprio (recibo, folha...): gera o próximo da
      // sequência do fornecedor, dentro da transação.
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
        // Edição: recria itens e rateios; parcelas seguem a reconciliação.
        await tx.itemNota.deleteMany({ where: { notaId } });
        await tx.rateioNota.deleteMany({ where: { notaId } });
        await tx.notaFiscal.update({ where: { id: notaId }, data: { ...dadosNota, numero } });
      } else {
        const nota = await tx.notaFiscal.create({
          data: { ...dadosNota, numero, createdBy: user.id },
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

      // Parcelas: `manter` não é tocada (status/pagaEm preservados); as
      // alteradas voltam a ABERTA; as removidas somem; as novas são criadas.
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

      return notaId;
    }).catch((erro: unknown) => {
      // Corrida rara: outro lançamento pegou o mesmo número entre a checagem e a gravação.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return null;
      }
      throw erro;
    });

    if (!id) return { ok: false, erro: mensagemNumeroRepetido(tipoDocumento, d.numero) };
    return { ok: true, id };
  },
);

/** Parcelas gravadas de uma nota, no formato que `reconciliarParcelas` compara. */
async function parcelasExistentes(notaId: string): Promise<ParcelaExistente[]> {
  const parcelas = await prisma.parcela.findMany({
    where: { notaId },
    select: { numero: true, valorCents: true, vencimento: true, status: true, pagaEm: true },
  });
  // Mesma conversão da tela de edição (`dataParaInput`): uma parcela que o
  // usuário não mexeu volta idêntica e é mantida.
  return parcelas.map((p) => ({ ...p, vencimento: dataParaInput(p.vencimento) }));
}

function mensagemNumeroRepetido(tipo: TipoDocumento, numero: string): string {
  if (tipo === "NF") {
    return `Já existe a NF ${numero} deste fornecedor. Confira se a nota não foi lançada antes.`;
  }
  return numero
    ? `Já existe um lançamento nº ${numero} deste fornecedor. Use outro número ou deixe em branco para gerar automaticamente.`
    : "Não foi possível gerar o número do lançamento. Tente salvar de novo.";
}

export const excluirNota = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/notas", "/contas"] },
  async (_user, id: string): Promise<ActionResult> => {
    const pagas = await prisma.parcela.count({ where: { notaId: id, status: "PAGA" } });
    if (pagas > 0) {
      return { ok: false, erro: "Nota possui parcelas pagas — não pode ser excluída." };
    }
    await prisma.notaFiscal.delete({ where: { id } });
    return { ok: true };
  },
);

export type CriarFornecedorInlineResult = ActionResult & {
  fornecedor?: { id: string; nome: string; cnpj: string | null };
};

/** Criação rápida de fornecedor sem sair do formulário de NF. */
export const criarFornecedorInline = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/fornecedores"] },
  async (_user, nome: string, cnpj?: string): Promise<CriarFornecedorInlineResult> => {
    const parsed = fornecedorSchema.safeParse({ nome, cnpj: cnpj?.trim() || undefined });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const resultado = await criarFornecedorValidado(parsed.data);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
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
