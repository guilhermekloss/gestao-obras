"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { importarPlanilhas, normalizarChave, type NotaImportada } from "@/services/importacao";
import { erroDeRegras, gravarLancamento, type Lancamento } from "@/services/lancamento";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade, ignorarAtividade } from "@/lib/atividade";
import { dataParaInput, formatarMoeda } from "@/lib/format";
import { correspondenciaItem } from "@/services/materiais";
import { carregarBaseMateriais } from "@/services/materiais-db";

export type PreviewImportacao = ActionResult & {
  totalNotas?: number;
  totalItens?: number;
  totalParcelas?: number;
  fornecedoresNovos?: number;
  notasJaExistentes?: number;
  valorTotalCents?: number;
  inconsistencias?: string[];
  // notas que quebram uma regra do lançamento (rateio, parcelas): não entram
  notasRecusadas?: string[];
  importadas?: number;
};

// A planilha antiga traz parcelas que não fecham com o total (já listadas como inconsistência): só essa regra é tolerada.
function paraLancamento(
  n: NotaImportada,
  obraPorCodigo: Map<string, string>,
  fornecedorId: string,
  userId: string,
  materialDoItem: (item: NotaImportada["itens"][number]) => string | undefined = () => undefined,
): { lancamento: Lancamento; obraDesconhecida: boolean } {
  const rateios = n.rateios.map((r) => ({ codigoObra: r.codigoObra, obraId: obraPorCodigo.get(normalizarChave(r.codigoObra)), fracaoBp: r.fracaoBp }));
  return {
    obraDesconhecida: rateios.some((r) => !r.obraId),
    lancamento: {
      fornecedor: { id: fornecedorId },
      tipoDocumento: "NF",
      numero: n.numero,
      dataCompra: dataParaInput(n.dataCompra),
      totalCents: n.totalCents,
      formaPagto: n.formaPagto,
      obs: "Importado das planilhas",
      itens: n.itens.map((item) => ({ ...item, materialId: materialDoItem(item) })),
      rateios: rateios.filter((r) => r.obraId).map((r) => ({ obraId: r.obraId!, fracaoBp: r.fracaoBp })),
      parcelas: n.parcelas.map((p) => ({ ...p, vencimento: dataParaInput(p.vencimento) })),
      criadoPor: userId,
    },
  };
}

const processar = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    revalidar: (_formData: FormData, executar: boolean) =>
      executar ? ["/notas", "/contas", "/fornecedores"] : [],
    atividade: "importacao.planilhas",
  },
  async (user, formData: FormData, executar: boolean): Promise<PreviewImportacao> => {
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

    const fornecedoresDb = await prisma.fornecedor.findMany();
    const porCnpj = new Map(fornecedoresDb.filter((f) => f.cnpj).map((f) => [f.cnpj!, f.id]));
    const porNome = new Map(fornecedoresDb.map((f) => [normalizarChave(f.nome), f.id]));

    const fornecedoresNovos = new Set<string>();
    for (const n of notas) {
      const existe =
        (n.cnpj && porCnpj.has(n.cnpj)) || porNome.has(normalizarChave(n.fornecedor));
      if (!existe) fornecedoresNovos.add(normalizarChave(n.fornecedor));
    }

    const idDoFornecedor = (n: NotaImportada) =>
      (n.cnpj ? porCnpj.get(n.cnpj) : undefined) ?? porNome.get(normalizarChave(n.fornecedor));

    // mesma regra do banco: (fornecedor, número). O nome só cobre fornecedor que ainda não existe.
    const existentes = await prisma.notaFiscal.findMany({
      select: { numero: true, fornecedorId: true },
    });
    const numerosPorFornecedor = new Set(existentes.map((e) => `${e.fornecedorId}::${e.numero}`));
    const novas = notas.filter((n) => {
      const fornecedorId = idDoFornecedor(n);
      return !(fornecedorId && numerosPorFornecedor.has(`${fornecedorId}::${n.numero}`));
    });

    const recusadas = new Map<NotaImportada, string>();
    for (const n of novas) {
      const { lancamento, obraDesconhecida } = paraLancamento(n, obraPorCodigo, "", user.id);
      const erro = obraDesconhecida ? "rateio com obra que não está cadastrada" : erroDeRegras(lancamento, { somaParcelas: false });
      if (erro) recusadas.set(n, erro);
    }
    const aImportar = novas.filter((n) => !recusadas.has(n));

    const resumo: PreviewImportacao = {
      ok: true,
      totalNotas: notas.length,
      totalItens: notas.reduce((a, n) => a + n.itens.length, 0),
      totalParcelas: notas.reduce((a, n) => a + n.parcelas.length, 0),
      fornecedoresNovos: fornecedoresNovos.size,
      notasJaExistentes: notas.length - novas.length,
      valorTotalCents: notas.reduce((a, n) => a + n.totalCents, 0),
      inconsistencias,
      notasRecusadas: [...recusadas].map(([n, erro]) => `${n.fornecedor} NF ${n.numero}: ${erro}`),
    };
    if (!executar) {
      ignorarAtividade(); // a prévia não grava nada
      return resumo;
    }

    // só liga ao catálogo quando a descrição já é conhecida; planilha não cadastra material
    const baseMateriais = await carregarBaseMateriais();
    let importadas = 0;
    const importadasLista: NotaImportada[] = [];
    for (const n of aImportar) {
      const fornecedorExistente = idDoFornecedor(n);
      try {
        const criado = await prisma.$transaction(async (tx) => {
          let fornecedorId = fornecedorExistente;
          let fornecedorCriado: { id: string } | null = null;
          if (!fornecedorId) {
            fornecedorCriado = await tx.fornecedor.create({ data: { nome: n.fornecedor, cnpj: n.cnpj } });
            fornecedorId = fornecedorCriado.id;
          }
          const { lancamento } = paraLancamento(
            n,
            obraPorCodigo,
            fornecedorId,
            user.id,
            (item) =>
              item.tipo === "MATERIAL"
                ? correspondenciaItem({ descricao: item.descricao }, { ...baseMateriais, fornecedorId }).exato?.id
                : undefined,
          );
          await gravarLancamento(tx, lancamento);
          return fornecedorCriado;
        });
        // o mapa só aprende o fornecedor depois do commit: um rollback não deixa id fantasma
        if (criado) {
          if (n.cnpj) porCnpj.set(n.cnpj, criado.id);
          porNome.set(normalizarChave(n.fornecedor), criado.id);
        }
        importadas++;
        importadasLista.push(n);
      } catch (erro) {
        if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== "P2002") throw erro;
        resumo.notasRecusadas!.push(`${n.fornecedor} NF ${n.numero}: já existe uma nota com este número para o fornecedor`);
      }
    }

    if (importadas === 0) ignorarAtividade();
    else anotarAtividade({
      descricao: `Importou ${importadas} lançamento${importadas === 1 ? "" : "s"} das planilhas (${formatarMoeda(importadasLista.reduce((a, n) => a + n.totalCents, 0))})`,
      obraIds: [...new Set(importadasLista.flatMap((n) => n.rateios.map((r) => obraPorCodigo.get(normalizarChave(r.codigoObra)))))].filter(
        (id): id is string => !!id,
      ),
      valorCents: importadasLista.reduce((a, n) => a + n.totalCents, 0),
    });
    return { ...resumo, importadas };
  },
);

export async function previewImportacao(formData: FormData): Promise<PreviewImportacao> {
  return processar(formData, false);
}

export async function executarImportacao(formData: FormData): Promise<PreviewImportacao> {
  return processar(formData, true);
}
