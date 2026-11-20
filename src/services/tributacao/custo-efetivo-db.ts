import type { Prisma, RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inputParaData } from "@/lib/format";
import { carregarRegimeIbsCbs } from "@/services/empresa";
import { carregarClassificacoes } from "./classificacao-db";
import {
  creditoDasCompras,
  custoEfetivoPorFornecedor,
  inicioDoPeriodo,
  MESES_PADRAO,
  type CompraParaCusto,
  type CreditoDoFornecedor,
  type GrupoUnidade,
} from "./custo-efetivo";
import { crtValido, DESCRICAO_IBS_CBS_POR_FORA, SELECT_CREDITO_IBS_CBS, type CrtEmitente } from "./ibs-cbs";

type Db = Prisma.TransactionClient | typeof prisma;

type Opcoes = { meses?: number; agora?: Date; db?: Db };

const selectItem = {
  id: true,
  qtde: true,
  descricao: true,
  unidade: true,
  totalCents: true,
  ...SELECT_CREDITO_IBS_CBS,
  nota: {
    select: {
      id: true,
      dataCompra: true,
      crtEmitente: true,
      fornecedor: { select: { id: true, nome: true } },
      // a nota tem a linha do IBS/CBS por fora? (junto da consulta, mesmo com itens filtrados por material)
      itens: { where: { descricao: DESCRICAO_IBS_CBS_POR_FORA }, select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.ItemNotaSelect;

type ItemLido = Prisma.ItemNotaGetPayload<{ select: typeof selectItem }>;

function paraCompra(i: ItemLido): CompraParaCusto {
  return {
    notaId: i.nota.id,
    fornecedorId: i.nota.fornecedor.id,
    fornecedorNome: i.nota.fornecedor.nome,
    descricao: i.descricao,
    ibsCbsPorFora: i.nota.itens.length > 0,
    unidade: i.unidade,
    qtde: Number(i.qtde),
    totalCents: i.totalCents,
    dataEmissao: i.nota.dataCompra,
    crtEmitente: i.nota.crtEmitente,
    // a linha lida já tem as colunas do crédito (SELECT_CREDITO_IBS_CBS)
    item: i,
  };
}

/** CRT da nota mais recente com CRT de cada fornecedor (todos, ou só os `ids`), numa consulta. */
export async function carregarCrtPorFornecedor(ids?: readonly string[], db: Db = prisma): Promise<Map<string, CrtEmitente>> {
  if (ids && ids.length === 0) return new Map();
  const notas = await db.notaFiscal.findMany({
    where: { crtEmitente: { not: null }, ...(ids ? { fornecedorId: { in: [...ids] } } : {}) },
    distinct: ["fornecedorId"],
    orderBy: [{ dataCompra: "desc" }, { createdAt: "desc" }],
    select: { fornecedorId: true, crtEmitente: true },
  });
  const mapa = new Map<string, CrtEmitente>();
  for (const n of notas) {
    const crt = crtValido(n.crtEmitente);
    if (crt) mapa.set(n.fornecedorId, crt);
  }
  return mapa;
}

export type CustoEfetivoDoMaterial = {
  regimeEmpresa: RegimeIbsCbs;
  meses: number;
  /** Primeiro dia do período (aaaa-mm-dd). */
  desde: string;
  grupos: GrupoUnidade[];
};

/** Custo efetivo por fornecedor de um material: 4 consultas fixas, qualquer que seja o número de notas. */
export async function carregarCustoEfetivoDoMaterial(materialId: string, { meses = MESES_PADRAO, agora = new Date(), db = prisma }: Opcoes = {}): Promise<CustoEfetivoDoMaterial> {
  const desde = inicioDoPeriodo(agora, meses);
  const [itens, regimeEmpresa] = await Promise.all([
    db.itemNota.findMany({
      where: { materialId, nota: { dataCompra: { gte: inputParaData(desde) } } },
      select: selectItem,
    }),
    carregarRegimeIbsCbs(db),
  ]);
  const compras = itens.map(paraCompra);
  const [classificacoes, crtPorFornecedor] = await Promise.all([
    carregarClassificacoes(
      itens.map((i) => i.cClassTrib),
      db,
    ),
    carregarCrtPorFornecedor([...new Set(compras.map((c) => c.fornecedorId))], db),
  ]);
  const grupos = custoEfetivoPorFornecedor(compras, { regimeEmpresa, classificacoes, agora, meses, crtPorFornecedor });
  return { regimeEmpresa, meses, desde, grupos };
}

export type CreditoDoFornecedorCarregado = CreditoDoFornecedor & { regimeEmpresa: RegimeIbsCbs; meses: number; desde: string };

/** Crédito de IBS/CBS que as compras de um fornecedor geraram no período. */
export async function carregarCreditoDoFornecedor(fornecedorId: string, { meses = MESES_PADRAO, agora = new Date(), db = prisma }: Opcoes = {}): Promise<CreditoDoFornecedorCarregado> {
  const desde = inicioDoPeriodo(agora, meses);
  const [itens, regimeEmpresa] = await Promise.all([
    db.itemNota.findMany({
      where: { nota: { fornecedorId, dataCompra: { gte: inputParaData(desde) } } },
      select: selectItem,
    }),
    carregarRegimeIbsCbs(db),
  ]);
  const classificacoes = await carregarClassificacoes(
    itens.map((i) => i.cClassTrib),
    db,
  );
  const credito = creditoDasCompras(itens.map(paraCompra), { regimeEmpresa, classificacoes, agora, meses });
  return { ...credito, regimeEmpresa, meses, desde };
}
