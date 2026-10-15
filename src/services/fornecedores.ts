import { z } from "zod";
import type { Fornecedor } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { variantesDocumento } from "./nfe-xml";
import { normalizarDocumentoCadastro } from "./correspondencia-fornecedor";

export const fornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200, "O nome pode ter no máximo 200 caracteres"),
  cnpj: z.string().max(30).optional(),
  fone: z.string().max(40).optional(),
  obs: z.string().max(2000, "A observação pode ter no máximo 2000 caracteres").optional(),
});

type FornecedorInput = z.infer<typeof fornecedorSchema>;

export async function buscarFornecedorPorDocumento(documento: string, ignorarId?: string) {
  return prisma.fornecedor.findFirst({
    where: { cnpj: { in: variantesDocumento(documento) }, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    select: { id: true, nome: true, cnpj: true },
  });
}

// Na edição, documento igual ao `atual` passa sem checar o DV, para não travar cadastros antigos.
export async function validarDocumentoFornecedor(
  cnpj: string | undefined,
  opts: { ignorarId?: string; atual?: string | null } = {},
): Promise<{ ok: true; cnpj: string | null } | { ok: false; erro: string }> {
  const valor = cnpj?.trim();
  if (!valor) return { ok: true, cnpj: null };

  let gravar = valor;
  const igualAoAtual = !!opts.atual && opts.atual.replace(/\D/g, "") === valor.replace(/\D/g, "");
  const normalizado = normalizarDocumentoCadastro(valor);
  if (normalizado.ok) gravar = normalizado.valor;
  else if (!igualAoAtual) return normalizado;

  const repetido = await buscarFornecedorPorDocumento(gravar, opts.ignorarId);
  if (repetido) return { ok: false, erro: `CNPJ/CPF já cadastrado para "${repetido.nome}"` };
  return { ok: true, cnpj: gravar };
}

export async function criarFornecedorValidado(
  dados: FornecedorInput,
): Promise<{ ok: true; fornecedor: Fornecedor } | { ok: false; erro: string }> {
  const doc = await validarDocumentoFornecedor(dados.cnpj);
  if (!doc.ok) return doc;
  const fornecedor = await prisma.fornecedor.create({ data: { ...dados, cnpj: doc.cnpj } });
  return { ok: true, fornecedor };
}
