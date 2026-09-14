"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { notaSchema, type NotaInput } from "@/schemas/nota";
import { validarParcelas } from "@/services/parcelas";
import { validarRateio } from "@/services/rateio";
import { calcularTotalItem } from "@/services/rateio";
import { formatarMoeda } from "@/lib/format";

export type SalvarNotaResult = {
  ok: boolean;
  erro?: string;
  /** true quando o erro é um aviso contornável com `forcar` */
  aviso?: boolean;
  id?: string;
};

export async function salvarNota(input: NotaInput): Promise<SalvarNotaResult> {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");

  const parsed = notaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  // Regras de bloqueio
  const rateio = validarRateio(d.rateios);
  if (!rateio.ok) {
    return {
      ok: false,
      erro: `Rateio deve somar 100% (atual: ${(rateio.somaBp / 100).toFixed(2).replace(".", ",")}%)`,
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
    const somaItens = d.itens.reduce(
      (acc, i) => acc + calcularTotalItem(i.qtde, i.unitCents, i.descontoCents),
      0,
    );
    if (somaItens !== d.totalCents) {
      return {
        ok: false,
        aviso: true,
        erro: `Soma dos itens (${formatarMoeda(somaItens)}) difere do total da nota (${formatarMoeda(d.totalCents)}). Salvar mesmo assim?`,
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
      // Edição: recria itens/rateios/parcelas para manter consistência
      await tx.itemNota.deleteMany({ where: { notaId } });
      await tx.parcela.deleteMany({ where: { notaId } });
      await tx.notaFiscal.update({ where: { id: notaId }, data: dadosNota });
    } else {
      const nota = await tx.notaFiscal.create({
        data: { ...dadosNota, createdBy: user.id },
      });
      notaId = nota.id;
    }

    for (const item of d.itens) {
      await tx.itemNota.create({
        data: {
          notaId,
          descricao: item.descricao,
          tipo: item.tipo,
          qtde: item.qtde,
          unidade: item.unidade,
          unitCents: item.unitCents,
          descontoCents: item.descontoCents,
          totalCents: calcularTotalItem(item.qtde, item.unitCents, item.descontoCents),
          rateios: {
            create: d.rateios.map((r) => ({
              obraId: r.obraId,
              etapaId: r.etapaId || null,
              fracaoBp: r.fracaoBp,
            })),
          },
        },
      });
    }

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

  revalidatePath("/notas");
  revalidatePath("/contas");
  return { ok: true, id };
}

export async function excluirNota(id: string): Promise<SalvarNotaResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const pagas = await prisma.parcela.count({ where: { notaId: id, status: "PAGA" } });
  if (pagas > 0) {
    return { ok: false, erro: "Nota possui parcelas pagas — não pode ser excluída." };
  }
  await prisma.notaFiscal.delete({ where: { id } });
  revalidatePath("/notas");
  revalidatePath("/contas");
  return { ok: true };
}

/** Criação rápida de fornecedor sem sair do formulário de NF. */
export async function criarFornecedorInline(
  nome: string,
  cnpj?: string,
): Promise<{ ok: boolean; erro?: string; fornecedor?: { id: string; nome: string; cnpj: string | null } }> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  if (!nome.trim()) return { ok: false, erro: "Nome é obrigatório" };

  if (cnpj?.trim()) {
    const existente = await prisma.fornecedor.findUnique({ where: { cnpj: cnpj.trim() } });
    if (existente) return { ok: false, erro: `CNPJ já cadastrado para "${existente.nome}"` };
  }
  const f = await prisma.fornecedor.create({
    data: { nome: nome.trim(), cnpj: cnpj?.trim() || null },
  });
  revalidatePath("/fornecedores");
  return { ok: true, fornecedor: { id: f.id, nome: f.nome, cnpj: f.cnpj } };
}
