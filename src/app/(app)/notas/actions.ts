"use server";

import { prisma } from "@/lib/prisma";
import { notaSchema, type NotaInput } from "@/schemas/nota";
import { validarParcelas } from "@/services/parcelas";
import { validarRateio, calcularTotalItem, somaItens } from "@/services/rateio";
import { fornecedorSchema, criarFornecedorValidado } from "@/services/fornecedores";
import { formatarMoeda, formatarPercentBp } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";

export type SalvarNotaResult = ActionResult & { id?: string };

export const salvarNota = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/notas", "/contas"] },
  async (user, input: NotaInput): Promise<SalvarNotaResult> => {
    const parsed = notaSchema.safeParse(input);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    // Regras de bloqueio
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

    // Avisos (contornáveis com confirmação)
    if (!d.forcar) {
      const duplicada = await prisma.notaFiscal.findFirst({
        where: {
          fornecedorId: d.fornecedorId,
          numero: d.numero,
          ...(d.id ? { NOT: { id: d.id } } : {}),
        },
      });
      if (duplicada) {
        return { ok: false, aviso: true, erro: "Já existe uma NF com este número para este fornecedor. Salvar mesmo assim?" };
      }
      const somaItensCents = somaItens(d.itens);
      if (somaItensCents !== d.totalCents) {
        return {
          ok: false,
          aviso: true,
          erro: `Soma dos itens (${formatarMoeda(somaItensCents)}) difere do total da nota (${formatarMoeda(d.totalCents)}). Salvar mesmo assim?`,
        };
      }
    }

    if (d.id) {
      const temParcelaPaga = await prisma.parcela.count({
        where: { notaId: d.id, status: "PAGA" },
      });
      if (temParcelaPaga > 0 && !d.forcar) {
        return {
          ok: false,
          aviso: true,
          erro: "Esta nota tem parcelas pagas. Salvar vai recriá-las como abertas — os pagamentos registrados serão perdidos. Salvar mesmo assim?",
        };
      }
    }

    const dadosNota = {
      fornecedorId: d.fornecedorId,
      numero: d.numero,
      dataCompra: new Date(d.dataCompra),
      totalCents: d.totalCents,
      formaPagto: d.formaPagto,
      obs: d.obs || null,
      anexoUrl: d.anexoUrl || null,
      anexoNome: d.anexoNome || null,
    };

    const id = await prisma.$transaction(async (tx) => {
      let notaId = d.id;
      if (notaId) {
        // Edição: recria itens/rateios/parcelas para manter consistência.
        // Parcelas pagas já foram bloqueadas acima (a menos que `forcar`).
        await tx.itemNota.deleteMany({ where: { notaId } });
        await tx.rateioNota.deleteMany({ where: { notaId } });
        await tx.parcela.deleteMany({ where: { notaId } });
        await tx.notaFiscal.update({ where: { id: notaId }, data: dadosNota });
      } else {
        const nota = await tx.notaFiscal.create({
          data: { ...dadosNota, createdBy: user.id },
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

      await tx.parcela.createMany({
        data: d.parcelas.map((p) => ({
          notaId: notaId!,
          numero: p.numero,
          valorCents: p.valorCents,
          vencimento: new Date(p.vencimento),
        })),
      });

      return notaId;
    });

    return { ok: true, id };
  },
);

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
