"use server";

import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { fornecedorSchema, criarFornecedorValidado } from "@/services/fornecedores";

function parseFornecedor(formData: FormData) {
  return fornecedorSchema.safeParse({
    nome: formData.get("nome"),
    cnpj: (formData.get("cnpj") as string)?.trim() || undefined,
    fone: (formData.get("fone") as string) || undefined,
    obs: (formData.get("obs") as string) || undefined,
  });
}

export const criarFornecedor = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/fornecedores"] },
  async (_user, formData: FormData): Promise<ActionResult> => {
    const parsed = parseFornecedor(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const resultado = await criarFornecedorValidado(parsed.data);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    return { ok: true };
  },
);

export const atualizarFornecedor = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/fornecedores"] },
  async (_user, id: string, formData: FormData): Promise<ActionResult> => {
    const parsed = parseFornecedor(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    if (d.cnpj) {
      const duplicado = await prisma.fornecedor.findFirst({
        where: { cnpj: d.cnpj, NOT: { id } },
      });
      if (duplicado) return { ok: false, erro: `CNPJ já cadastrado para "${duplicado.nome}"` };
    }

    await prisma.fornecedor.update({
      where: { id },
      data: { nome: d.nome, cnpj: d.cnpj ?? null, fone: d.fone ?? null, obs: d.obs ?? null },
    });
    return { ok: true };
  },
);

export const excluirFornecedor = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/fornecedores"] },
  async (_user, id: string): Promise<ActionResult> => {
    const notas = await prisma.notaFiscal.count({ where: { fornecedorId: id } });
    if (notas > 0) {
      return { ok: false, erro: "Fornecedor possui notas fiscais — não pode ser excluído." };
    }
    await prisma.fornecedor.delete({ where: { id } });
    return { ok: true };
  },
);
