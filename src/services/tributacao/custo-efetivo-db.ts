import { Prisma, type RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inputParaData } from "@/lib/format";
import { carregarRegimeIbsCbs } from "@/services/empresa";
import { carregarClassificacoes } from "./classificacao-db";
import { codigosParaClassificar } from "./custo-liquido";
import {
  comprasDasNotas,
  creditoDasCompras,
  custoEfetivoPorFornecedor,
  inicioDoPeriodo,
  MESES_PADRAO,
  type CompraParaCusto,
  type CreditoDoFornecedor,
  type GrupoUnidade,
  type NotaParaCusto,
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

/**
 * CRT da nota mais recente com CRT de cada fornecedor dado, numa consulta: DISTINCT ON no Postgres devolve uma linha
 * por fornecedor (o `distinct` do Prisma traria todas as notas e deduplicaria em memória) e usa o índice
 * [fornecedorId, dataCompra]. Para a lista inteira de fornecedores, o CRT vem de calcularDependencia (mesma leitura).
 */
export async function carregarCrtPorFornecedor(ids: readonly string[], db: Db = prisma): Promise<Map<string, CrtEmitente>> {
  if (ids.length === 0) return new Map();
  const notas = await db.$queryRaw<{ fornecedorId: string; crtEmitente: string | null }[]>(Prisma.sql`
    SELECT DISTINCT ON ("fornecedorId") "fornecedorId", "crtEmitente"
    FROM "NotaFiscal"
    WHERE "crtEmitente" IS NOT NULL AND "fornecedorId" IN (${Prisma.join([...new Set(ids)])})
    ORDER BY "fornecedorId", "dataCompra" DESC, "createdAt" DESC`);
  const mapa = new Map<string, CrtEmitente>();
  for (const n of notas) {
    const crt = crtValido(n.crtEmitente);
    if (crt) mapa.set(n.fornecedorId, crt);
  }
  return mapa;
}

// A classificação só pesa no regime regular e de 2027 em diante (creditoDoItem sai antes nos outros casos).
function codigosDasCompras(compras: readonly CompraParaCusto[], regime: RegimeIbsCbs): string[] {
  return codigosParaClassificar(
    compras.map((c) => ({ dataCompra: c.dataEmissao, itens: [c.item] })),
    regime,
  );
}

export type CustoEfetivoDoMaterial = {
  regimeEmpresa: RegimeIbsCbs;
  meses: number;
  /** Primeiro dia do período (aaaa-mm-dd). */
  desde: string;
  grupos: GrupoUnidade[];
};

/** Custo efetivo por fornecedor de um material: consultas fixas (itens, CRT e, com regime regular, classificações), qualquer que seja o número de notas. */
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
    carregarClassificacoes(codigosDasCompras(compras, regimeEmpresa), db),
    carregarCrtPorFornecedor([...new Set(compras.map((c) => c.fornecedorId))], db),
  ]);
  const grupos = custoEfetivoPorFornecedor(compras, { regimeEmpresa, classificacoes, agora, meses, crtPorFornecedor });
  return { regimeEmpresa, meses, desde, grupos };
}

export type CreditoDoFornecedorCarregado = CreditoDoFornecedor & { regimeEmpresa: RegimeIbsCbs; meses: number; desde: string };

/**
 * Crédito de IBS/CBS que as compras de um fornecedor geraram no período, a partir das notas que a página já leu
 * (com todos os itens). Sem consulta de notas: o regime vem da leitura da empresa em cache e as classificações do memo.
 */
export async function calcularCreditoDoFornecedor(
  fornecedor: { id: string; nome: string },
  notas: readonly NotaParaCusto[],
  { meses = MESES_PADRAO, agora = new Date() }: Omit<Opcoes, "db"> = {},
): Promise<CreditoDoFornecedorCarregado> {
  const desde = inicioDoPeriodo(agora, meses);
  // o mesmo corte da consulta por período (dataCompra ≥ início do dia), antes do corte por dia de avaliar()
  const inicio = inputParaData(desde).getTime();
  const compras = comprasDasNotas(fornecedor, notas.filter((n) => n.dataCompra.getTime() >= inicio));
  const regimeEmpresa = await carregarRegimeIbsCbs();
  const classificacoes = await carregarClassificacoes(codigosDasCompras(compras, regimeEmpresa));
  const credito = creditoDasCompras(compras, { regimeEmpresa, classificacoes, agora, meses });
  return { ...credito, regimeEmpresa, meses, desde };
}
