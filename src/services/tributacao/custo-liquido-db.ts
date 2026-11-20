import { cache } from "react";
import type { Prisma, RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { carregarRegimeIbsCbs } from "../empresa";
import { carregarClassificacoes } from "./classificacao-db";
import { indexarClassificacoes } from "./credito";
import {
  agregarCustoLiquido,
  codigosParaClassificar,
  liquidosDosItens,
  somarCustosLiquidos,
  type ContextoCustoLiquido,
  type CustoLiquido,
  type ItemParaCustoLiquido,
} from "./custo-liquido";
import { INICIO_IBS_CBS_NA_NOTA, SELECT_CREDITO_IBS_CBS, type ColunasCreditoIbsCbs } from "./ibs-cbs";

// Só as notas com IBS/CBS destacado entram: sem destaque não há crédito, e o realizado bruto de todas
// continua vindo de custos.ts. A reforma começou a destacar em 2026, então o corte por data usa o índice de dataCompra.
const INICIO_DESTAQUE = new Date(`${INICIO_IBS_CBS_NA_NOTA}T00:00:00`);
const COM_DESTAQUE: Prisma.ItemNotaWhereInput = {
  OR: [{ cbsCents: { gt: 0 } }, { ibsUfCents: { gt: 0 } }, { ibsMunCents: { gt: 0 } }],
};

/** Regime da empresa e as classificações dos itens dados, já indexadas (a segunda leitura só com regime regular e destaque). */
export async function carregarContextoCredito(
  notas: readonly { dataCompra: Date | string; itens: readonly ColunasCreditoIbsCbs[] }[],
): Promise<ContextoCustoLiquido> {
  const regime = await carregarRegimeIbsCbs();
  const classificacoes = await carregarClassificacoes(codigosParaClassificar(notas, regime));
  return { regimeEmpresa: regime, classificacoes: indexarClassificacoes(classificacoes) };
}

export type CreditoIbsCbs = {
  regime: RegimeIbsCbs;
  /** Soma de todas as obras lidas (a obra filtrada, quando há filtro). */
  total: CustoLiquido;
  porObra: Map<string, CustoLiquido>;
  /** Só com obra filtrada (sem filtro as etapas de obras diferentes se misturariam). A chave null é o rateio sem etapa. */
  porEtapa: Map<string | null, CustoLiquido>;
};

// Uma leitura por requisição (cache só memoiza no render); compartilhado, não mutar.
export const carregarCreditoIbsCbs = cache(async (obraId: string = ""): Promise<CreditoIbsCbs> => {
  const notas = await prisma.notaFiscal.findMany({
    where: {
      dataCompra: { gte: INICIO_DESTAQUE },
      itens: { some: COM_DESTAQUE },
      ...(obraId ? { rateios: { some: { obraId } } } : {}),
    },
    select: {
      dataCompra: true,
      itens: { select: { totalCents: true, ...SELECT_CREDITO_IBS_CBS } },
      rateios: { where: obraId ? { obraId } : undefined, select: { obraId: true, etapaId: true, fracaoBp: true } },
    },
  });
  const ctx = await carregarContextoCredito(notas);
  const porObra = agregarCustoLiquido(notas, ctx, (_, r) => r.obraId);
  const porEtapa = obraId ? agregarCustoLiquido(notas, ctx, (_, r) => r.etapaId) : new Map<string | null, CustoLiquido>();
  return { regime: ctx.regimeEmpresa, total: somarCustosLiquidos(porObra.values()), porObra, porEtapa };
});

/** Itens com o total já líquido do crédito, para a curva ABC. As notas precisam trazer dataCompra, a descrição e SELECT_CREDITO_IBS_CBS. */
export async function liquidarItensDasNotas<N extends { dataCompra: Date | string; itens: ItemParaCustoLiquido[] }>(
  notas: N[],
): Promise<N[]> {
  const ctx = await carregarContextoCredito(notas);
  return notas.map((n) => {
    const liquidos = liquidosDosItens(n.itens, n.dataCompra, ctx);
    return { ...n, itens: n.itens.map((i, k) => ({ ...i, totalCents: liquidos[k] })) };
  });
}
