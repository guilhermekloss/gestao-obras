"use server";

import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { fornecedorSchema, criarFornecedorValidado, validarDocumentoFornecedor } from "@/services/fornecedores";

function parseFornecedor(formData: FormData) {
  return fornecedorSchema.safeParse({
    nome: formData.get("nome"),
    cnpj: (formData.get("cnpj") as string)?.trim() || undefined,
    fone: (formData.get("fone") as string) || undefined,
    obs: (formData.get("obs") as string) || undefined,
  });
}

export const criarFornecedor = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/fornecedores"], atividade: "fornecedor.criar" },
  async (_user, formData: FormData): Promise<ActionResult> => {
    const parsed = parseFornecedor(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const resultado = await criarFornecedorValidado(parsed.data);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    anotarFornecedorCriado(resultado.fornecedor);
    return { ok: true };
  },
);

export const atualizarFornecedor = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/fornecedores"], atividade: "fornecedor.editar" },
  async (_user, id: string, formData: FormData): Promise<ActionResult> => {
    const parsed = parseFornecedor(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const atual = await prisma.fornecedor.findUnique({ where: { id }, select: { cnpj: true } });
    const doc = await validarDocumentoFornecedor(d.cnpj, { ignorarId: id, atual: atual?.cnpj });
    if (!doc.ok) return doc;

    await prisma.fornecedor.update({
      where: { id },
      data: { nome: d.nome, cnpj: doc.cnpj, fone: d.fone ?? null, obs: d.obs ?? null },
    });
    anotarAtividade({ descricao: `Editou o fornecedor ${d.nome}`, entidade: "fornecedor", entidadeId: id });
    return { ok: true };
  },
);

export const excluirFornecedor = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/fornecedores"], atividade: "fornecedor.excluir" },
  async (_user, id: string): Promise<ActionResult> => {
    const notas = await prisma.notaFiscal.count({ where: { fornecedorId: id } });
    if (notas > 0) {
      return { ok: false, erro: "Fornecedor possui notas fiscais — não pode ser excluído." };
    }
    const fornecedor = await prisma.fornecedor.delete({ where: { id }, select: { nome: true } });
    anotarAtividade({ descricao: `Excluiu o fornecedor ${fornecedor.nome}`, entidade: "fornecedor", entidadeId: id });
    return { ok: true };
  },
);

function anotarFornecedorCriado(f: { id: string; nome: string }) {
  anotarAtividade({ descricao: `Cadastrou o fornecedor ${f.nome}`, entidade: "fornecedor", entidadeId: f.id });
}
