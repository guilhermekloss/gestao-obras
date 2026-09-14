import { z } from "zod";
import type { Fornecedor } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const fornecedorSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  cnpj: z.string().optional(),
  fone: z.string().optional(),
  obs: z.string().optional(),
});

export type FornecedorInput = z.infer<typeof fornecedorSchema>;

/** Cria um fornecedor após checar duplicidade de CNPJ — usado tanto pelo cadastro completo quanto pela criação rápida a partir da NF. */
export async function criarFornecedorValidado(
  dados: FornecedorInput,
): Promise<{ ok: true; fornecedor: Fornecedor } | { ok: false; erro: string }> {
  if (dados.cnpj) {
    const existente = await prisma.fornecedor.findUnique({ where: { cnpj: dados.cnpj } });
    if (existente) return { ok: false, erro: `CNPJ já cadastrado para "${existente.nome}"` };
  }
  const fornecedor = await prisma.fornecedor.create({ data: dados });
  return { ok: true, fornecedor };
}
