import { cache } from "react";
import type { Prisma, RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notasDaObra, notasParaAnalise } from "../custos";
import { carregarRegimeIbsCbs } from "../empresa";
import { carregarClassificacoes } from "./classificacao-db";
import { indexarClassificacoes } from "./credito";
import {
  agregarCustoLiquido,
  codigosParaClassificar,
  liquidosDosItens,
  modoDoCusto,
  somarCustosLiquidos,
  type ContextoCustoLiquido,
  type CustoLiquido,
  type ItemParaCustoLiquido,
} from "./custo-liquido";
import { INICIO_IBS_CBS_NA_NOTA, SELECT_CREDITO_IBS_CBS, type ColunasCreditoIbsCbs } from "./ibs-cbs";

// Só as notas com IBS/CBS destacado entram: sem destaque não há crédito, e o realizado bruto de todas continua
// vindo de custos.ts. A reforma começou a destacar em 2026 (meia-noite local, como o corte antigo no banco).
const INICIO_DESTAQUE = new Date(`${INICIO_IBS_CBS_NA_NOTA}T00:00:00`);
// cada tributo conferido à parte, como o filtro que ficava no banco (OR de cbs, IBS da UF e do município > 0)
const temDestaque = (i: ColunasCreditoIbsCbs) => (i.cbsCents ?? 0) > 0 || (i.ibsUfCents ?? 0) > 0 || (i.ibsMunCents ?? 0) > 0;

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

type Rateio = { obraId: string; etapaId: string | null; fracaoBp: number };
type NotaLida = { dataCompra: Date; itens: ItemParaCustoLiquido[]; rateios: Rateio[] };

/**
 * Crédito de IBS/CBS de notas já lidas (notasParaAnalise ou notasDaObra, de custos.ts): filtra em memória as de 2026 em
 * diante com destaque e, com `obraId`, só os rateios da obra. Sem consulta de notas.
 */
export async function creditoIbsCbsDasNotas(notas: readonly NotaLida[], obraId?: string): Promise<CreditoIbsCbs> {
  const inicio = INICIO_DESTAQUE.getTime();
  const comDestaque: NotaLida[] = [];
  for (const n of notas) {
    if (n.dataCompra.getTime() < inicio || !n.itens.some(temDestaque)) continue;
    if (!obraId) {
      comDestaque.push(n);
      continue;
    }
    const rateios = n.rateios.filter((r) => r.obraId === obraId);
    if (rateios.length > 0) comDestaque.push(rateios.length === n.rateios.length ? n : { ...n, rateios });
  }
  const ctx = await carregarContextoCredito(comDestaque);
  if (!obraId) {
    const porObra = agregarCustoLiquido(comDestaque, ctx, (_, r) => r.obraId);
    return { regime: ctx.regimeEmpresa, total: somarCustosLiquidos(porObra.values()), porObra, porEtapa: new Map() };
  }
  // os rateios são todos da obra: ela é a soma das etapas, sem calcular o crédito de cada nota uma segunda vez
  const porEtapa = agregarCustoLiquido(comDestaque, ctx, (_, r) => r.etapaId);
  const total = somarCustosLiquidos(porEtapa.values());
  return { regime: ctx.regimeEmpresa, total, porObra: porEtapa.size > 0 ? new Map([[obraId, total]]) : new Map(), porEtapa };
}

/**
 * De onde vêm as notas. Para não ler de novo o que a página já leu:
 * - "obra": notasDaObra, a mesma leitura do realizado por etapa e por mês da obra (Orçamento, resumo da obra);
 * - "todas": notasParaAnalise, a do dashboard (realizado, alertas, curva ABC), filtrando a obra em memória;
 * - "destaque": consulta própria só das notas com IBS/CBS destacado, para a página que não lê as notas de outro jeito.
 */
export type FonteDoCredito = "obra" | "todas" | "destaque";

const COM_DESTAQUE: Prisma.ItemNotaWhereInput = {
  OR: [{ cbsCents: { gt: 0 } }, { ibsUfCents: { gt: 0 } }, { ibsMunCents: { gt: 0 } }],
};

// usa o índice de dataCompra; com obra, só as notas e os rateios dela
function notasComDestaque(obraId: string) {
  return prisma.notaFiscal.findMany({
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
}

// Uma leitura por requisição (cache só memoiza no render); compartilhado, não mutar. Argumentos sempre primitivos e
// normalizados, para carregarCreditoIbsCbs() e carregarCreditoIbsCbs("") caírem na mesma entrada.
const creditoDaRequisicao = cache(async (obraId: string, fonte: FonteDoCredito): Promise<CreditoIbsCbs> => {
  const notas: readonly NotaLida[] =
    fonte === "destaque" ? await notasComDestaque(obraId) : fonte === "obra" ? await notasDaObra(obraId) : await notasParaAnalise();
  return creditoIbsCbsDasNotas(notas, obraId || undefined);
});

/** Crédito de IBS/CBS das obras (ou de uma). Sem `fonte`: com obra, "obra"; sem obra, "todas". */
export function carregarCreditoIbsCbs(obraId?: string, fonte?: FonteDoCredito): Promise<CreditoIbsCbs> {
  const f = fonte ?? (obraId ? "obra" : "todas");
  return creditoDaRequisicao(obraId ?? "", !obraId && f === "obra" ? "todas" : f);
}

/**
 * Bruto ou líquido numa tela que só precisa saber se há crédito a recuperar (curva ABC). Fora do regime regular o custo
 * é sempre o bruto: nem as notas com destaque são lidas (o regime vem da leitura da empresa em cache).
 */
export async function carregarModoDoCusto(obraId: string | undefined, preferido?: string | null): Promise<ReturnType<typeof modoDoCusto>> {
  const regime = await carregarRegimeIbsCbs();
  if (regime !== "REGULAR") return modoDoCusto(regime, 0, preferido);
  const credito = await carregarCreditoIbsCbs(obraId, "destaque");
  return modoDoCusto(regime, credito.total.creditoCents, preferido);
}

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
