"use server";

import { prisma } from "@/lib/prisma";
import { notaSchema, type NotaInput } from "@/schemas/nota";
import { descricaoDoLancamento, registrarLancamento } from "@/services/lancamento";
import { fornecedorSchema, criarFornecedorValidado } from "@/services/fornecedores";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";

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

    const r = await registrarLancamento(
      {
        id: d.id,
        fornecedor: { id: d.fornecedorId },
        tipoDocumento,
        numero: d.numero,
        dataCompra: d.dataCompra,
        totalCents: d.totalCents,
        formaPagto: d.formaPagto,
        obs: d.obs,
        anexoUrl: d.anexoUrl,
        anexoNome: d.anexoNome,
        chaveNfe: d.chaveNfe,
        itens: d.itens,
        rateios: d.rateios,
        parcelas: d.parcelas,
        criadoPor: user.id,
      },
      { forcar: d.forcar },
    );
    if (!r.ok) return { ok: false, erro: r.erro, aviso: r.aviso };

    anotarAtividade({
      descricao: descricaoDoLancamento(d.id ? "Editou" : "Lançou", { tipoDocumento, numero: r.numero, totalCents: d.totalCents }, r.fornecedorNome),
      entidade: "nota",
      entidadeId: r.notaId,
      obraIds: d.rateios.map((x) => x.obraId),
      valorCents: d.totalCents,
    });
    return { ok: true, id: r.notaId };
  },
);

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
      descricao: descricaoDoLancamento("Excluiu", nota, nota.fornecedor.nome),
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
