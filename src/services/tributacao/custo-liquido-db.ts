import { cache } from "react";
import type { Prisma, RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { carregarEmpresa } from "../empresa";
import { carregarClassificacoes } from "./classificacao-db";
import {
  agregarCustoLiquido,
  codigosParaClassificar,
  liquidoDoItem,
  somarCustosLiquidos,
  type ContextoCustoLiquido,
  type CustoLiquido,
  type ItemParaCustoLiquido,
} from "./custo-liquido";

// Só as notas com IBS/CBS destacado entram: sem destaque não há crédito, e o realizado bruto de todas
// continua vindo de custos.ts. A reforma começou a destacar em 2026, então o corte por data usa o índice de dataCompra.
const INICIO_DESTAQUE = new Date(2026, 0, 1);
const COM_DESTAQUE: Prisma.ItemNotaWhereInput = {
  OR: [{ cbsCents: { gt: 0 } }, { ibsUfCents: { gt: 0 } }, { ibsMunCents: { gt: 0 } }],
};

export const CAMPOS_TRIBUTARIOS = {
  cClassTrib: true,
  cbsCents: true,
  ibsUfCents: true,
  ibsMunCents: true,
} as const;

type ItemTributario = Pick<ItemParaCustoLiquido, "cClassTrib" | "cbsCents" | "ibsUfCents" | "ibsMunCents">;

/** Regime da empresa e as classificações dos itens dados (duas leituras no máximo; a segunda só com regime regular e destaque). */
export async function carregarContextoCredito(
  notas: readonly { dataCompra: Date | string; itens: readonly ItemTributario[] }[],
): Promise<ContextoCustoLiquido> {
  const regime: RegimeIbsCbs = (await carregarEmpresa())?.regimeIbsCbs ?? "NAO_INFORMADO";
  return { regimeEmpresa: regime, classificacoes: await carregarClassificacoes(codigosParaClassificar(notas, regime)) };
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
      itens: { select: { totalCents: true, ...CAMPOS_TRIBUTARIOS } },
      rateios: { where: obraId ? { obraId } : undefined, select: { obraId: true, etapaId: true, fracaoBp: true } },
    },
  });
  const ctx = await carregarContextoCredito(notas);
  const porObra = agregarCustoLiquido(notas, ctx, (_, r) => r.obraId);
  const porEtapa = obraId ? agregarCustoLiquido(notas, ctx, (_, r) => r.etapaId) : new Map<string | null, CustoLiquido>();
  return { regime: ctx.regimeEmpresa, total: somarCustosLiquidos(porObra.values()), porObra, porEtapa };
});

/** Itens com o total já líquido do crédito, para a curva ABC. As notas precisam trazer dataCompra e os campos tributários. */
export async function liquidarItensDasNotas<N extends { dataCompra: Date | string; itens: ItemParaCustoLiquido[] }>(
  notas: N[],
): Promise<N[]> {
  const ctx = await carregarContextoCredito(notas);
  return notas.map((n) => ({
    ...n,
    itens: n.itens.map((i) => ({ ...i, totalCents: liquidoDoItem(i, n.dataCompra, ctx) })),
  }));
}
