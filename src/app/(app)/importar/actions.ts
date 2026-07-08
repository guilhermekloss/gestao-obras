"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { importarPlanilhas, normalizarChave } from "@/services/importacao";

export type PreviewImportacao = {
  ok: boolean;
  erro?: string;
  totalNotas?: number;
  totalItens?: number;
  totalParcelas?: number;
  fornecedoresNovos?: number;
  notasJaExistentes?: number;
  valorTotalCents?: number;
  inconsistencias?: string[];
  importadas?: number;
};

async function processar(formData: FormData, executar: boolean): Promise<PreviewImportacao> {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");

  const arqItens = formData.get("csvItens");
  const arqFin = formData.get("csvFinanceiro");
  if (!(arqItens instanceof File) || !(arqFin instanceof File)) {
    return { ok: false, erro: "Envie os dois arquivos CSV" };
  }

  const obras = await prisma.obra.findMany({ select: { id: true, codigo: true } });
  if (obras.length === 0) return { ok: false, erro: "Cadastre as obras antes de importar" };
  const obraPorCodigo = new Map(obras.map((o) => [normalizarChave(o.codigo), o.id]));

  const { notas, inconsistencias } = importarPlanilhas(
    await arqItens.text(),
    await arqFin.text(),
    obras.map((o) => o.codigo),
  );
  if (notas.length === 0) {
    return { ok: false, erro: "Nenhuma nota reconhecida nos arquivos — confira o formato das colunas" };
  }

  // Fornecedores existentes (dedup por CNPJ e por nome normalizado)
  const fornecedoresDb = await prisma.fornecedor.findMany();
  const porCnpj = new Map(fornecedoresDb.filter((f) => f.cnpj).map((f) => [f.cnpj!, f.id]));
  const porNome = new Map(fornecedoresDb.map((f) => [normalizarChave(f.nome), f.id]));

  const fornecedoresNovos = new Set<string>();
  for (const n of notas) {
    const existe =
      (n.cnpj && porCnpj.has(n.cnpj)) || porNome.has(normalizarChave(n.fornecedor));
    if (!existe) fornecedoresNovos.add(normalizarChave(n.fornecedor));
  }

  // Notas já importadas (fornecedor+número)
  const existentes = await prisma.notaFiscal.findMany({
    select: { numero: true, fornecedor: { select: { nome: true, cnpj: true } } },
  });
  const chavesExistentes = new Set(
    existentes.map((e) => `${normalizarChave(e.fornecedor.nome)}::${e.numero}`),
  );
  const novas = notas.filter(
    (n) => !chavesExistentes.has(`${normalizarChave(n.fornecedor)}::${n.numero}`),
  );

  const resumo: PreviewImportacao = {
    ok: true,
    totalNotas: notas.length,
    totalItens: notas.reduce((a, n) => a + n.itens.length, 0),
    totalParcelas: notas.reduce((a, n) => a + n.parcelas.length, 0),
    fornecedoresNovos: fornecedoresNovos.size,
    notasJaExistentes: notas.length - novas.length,
    valorTotalCents: notas.reduce((a, n) => a + n.totalCents, 0),
    inconsistencias,
  };
  if (!executar) return resumo;

  let importadas = 0;
  for (const n of novas) {
    await prisma.$transaction(async (tx) => {
      // fornecedor: acha ou cria
      let fornecedorId =
        (n.cnpj ? porCnpj.get(n.cnpj) : undefined) ?? porNome.get(normalizarChave(n.fornecedor));
      if (!fornecedorId) {
        const f = await tx.fornecedor.create({
          data: { nome: n.fornecedor, cnpj: n.cnpj },
        });
        fornecedorId = f.id;
        if (n.cnpj) porCnpj.set(n.cnpj, f.id);
        porNome.set(normalizarChave(n.fornecedor), f.id);
      }

      const nota = await tx.notaFiscal.create({
        data: {
          fornecedorId,
          numero: n.numero,
          dataCompra: n.dataCompra,
          totalCents: n.totalCents,
          formaPagto: n.formaPagto,
          obs: "Importado das planilhas",
          createdBy: user.id,
        },
      });

      for (const item of n.itens) {
        await tx.itemNota.create({
          data: {
            notaId: nota.id,
            descricao: item.descricao,
            tipo: item.tipo,
            qtde: item.qtde,
            unidade: item.unidade,
            unitCents: item.unitCents,
            descontoCents: item.descontoCents,
            totalCents: item.totalCents,
            rateios: {
              create: item.rateios
                .filter((r) => obraPorCodigo.has(normalizarChave(r.codigoObra)))
                .map((r) => ({
                  obraId: obraPorCodigo.get(normalizarChave(r.codigoObra))!,
                  fracaoBp: r.fracaoBp,
                })),
            },
          },
        });
      }

      if (n.parcelas.length > 0) {
        await tx.parcela.createMany({
          data: n.parcelas.map((p) => ({
            notaId: nota.id,
            numero: p.numero,
            valorCents: p.valorCents,
            vencimento: p.vencimento,
            pagaEm: p.pagaEm,
            status: p.pagaEm ? ("PAGA" as const) : ("ABERTA" as const),
          })),
        });
      }
    });
    importadas++;
  }

  revalidatePath("/notas");
  revalidatePath("/contas");
  revalidatePath("/fornecedores");
  return { ...resumo, importadas };
}

export async function previewImportacao(formData: FormData) {
  return processar(formData, false);
}

export async function executarImportacao(formData: FormData) {
  return processar(formData, true);
}
