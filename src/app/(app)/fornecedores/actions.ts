"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { ActionResult } from "../obras/actions";

const fornecedorSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  cnpj: z.string().optional(),
  fone: z.string().optional(),
  obs: z.string().optional(),
});

function parseFornecedor(formData: FormData) {
  return fornecedorSchema.safeParse({
    nome: formData.get("nome"),
    cnpj: (formData.get("cnpj") as string)?.trim() || undefined,
    fone: (formData.get("fone") as string) || undefined,
    obs: (formData.get("obs") as string) || undefined,
  });
}

export async function criarFornecedor(formData: FormData): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const parsed = parseFornecedor(formData);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.cnpj) {
    const existente = await prisma.fornecedor.findUnique({ where: { cnpj: d.cnpj } });
    if (existente) return { ok: false, erro: `CNPJ já cadastrado para "${existente.nome}"` };
  }

  await prisma.fornecedor.create({ data: d });
  revalidatePath("/fornecedores");
  return { ok: true };
}

export async function atualizarFornecedor(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
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
  revalidatePath("/fornecedores");
  return { ok: true };
}

export async function excluirFornecedor(id: string): Promise<ActionResult> {
  await exigirPapel("ADMIN");
  const notas = await prisma.notaFiscal.count({ where: { fornecedorId: id } });
  if (notas > 0) {
    return { ok: false, erro: "Fornecedor possui notas fiscais — não pode ser excluído." };
  }
  await prisma.fornecedor.delete({ where: { id } });
  revalidatePath("/fornecedores");
  return { ok: true };
}
