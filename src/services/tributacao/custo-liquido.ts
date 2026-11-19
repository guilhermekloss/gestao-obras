// Custo da obra líquido do crédito de IBS/CBS. Puro: as notas e as classificações chegam prontas (ver custo-liquido-db.ts).
// Mesma base do realizado de custos.ts: itens somados por nota e só então rateados, com o arredondamento por nota.
import type { RegimeIbsCbs } from "@prisma/client";
import { custoRateado } from "../rateio";
import {
  creditoDaNota,
  custoLiquidoCents,
  type ClassificacaoParaCredito,
  type ItemParaCredito,
  type SituacaoCredito,
} from "./credito";

export type ItemParaCustoLiquido = ItemParaCredito & { totalCents: number };

export type NotaParaCustoLiquido = {
  /** Data de emissão: decide o período de teste (2026) e a vigência da classificação. */
  dataCompra: Date | string;
  itens: ItemParaCustoLiquido[];
  rateios: { obraId: string; etapaId: string | null; fracaoBp: number }[];
};

export type ContextoCustoLiquido = {
  regimeEmpresa: RegimeIbsCbs;
  classificacoes: readonly ClassificacaoParaCredito[];
};

/** IBS/CBS destacado (já rateado) em cada situação: mostra quanto não virou crédito e por quê. */
export type DestacadoPorSituacao = Partial<Record<SituacaoCredito, number>>;

export type CustoLiquido = {
  /** Itens das notas recebidas, rateados. */
  brutoCents: number;
  /** IBS/CBS destacado, com ou sem direito a crédito. */
  destacadoCents: number;
  /** A recuperar: só o que a situação permite apropriar. */
  creditoCents: number;
  /** Bruto menos crédito, nunca negativo. */
  liquidoCents: number;
  porSituacao: DestacadoPorSituacao;
};

export const SEM_CUSTO: CustoLiquido = { brutoCents: 0, destacadoCents: 0, creditoCents: 0, liquidoCents: 0, porSituacao: {} };

// Soma bruta, crédito e destacado; o líquido é refeito no fim (e não somado), para o total fechar com a conta de cada parte.
function fechar(c: Omit<CustoLiquido, "liquidoCents">): CustoLiquido {
  return { ...c, liquidoCents: custoLiquidoCents(c.brutoCents, c.creditoCents) };
}

/** Soma vários custos (ex.: as obras do dashboard) sem perder a quebra por situação. */
export function somarCustosLiquidos(custos: Iterable<CustoLiquido>): CustoLiquido {
  const acc = { brutoCents: 0, destacadoCents: 0, creditoCents: 0, porSituacao: {} as DestacadoPorSituacao };
  for (const c of custos) {
    acc.brutoCents += c.brutoCents;
    acc.destacadoCents += c.destacadoCents;
    acc.creditoCents += c.creditoCents;
    for (const [sit, cents] of Object.entries(c.porSituacao) as [SituacaoCredito, number][]) {
      acc.porSituacao[sit] = (acc.porSituacao[sit] ?? 0) + cents;
    }
  }
  return fechar(acc);
}

/**
 * Custo líquido por chave (obra, etapa, mês...). A nota é calculada inteira (crédito dos itens somado) e só então
 * rateada: crédito × fração do rateio, arredondado como o bruto. Nota sem rateio (compra da empresa) não entra.
 */
export function agregarCustoLiquido<N extends NotaParaCustoLiquido, K>(
  notas: readonly N[],
  ctx: ContextoCustoLiquido,
  chaveDe: (nota: N, rateio: N["rateios"][number]) => K,
): Map<K, CustoLiquido> {
  const acc = new Map<K, Omit<CustoLiquido, "liquidoCents">>();
  for (const nota of notas) {
    if (nota.rateios.length === 0) continue;
    const brutoNota = nota.itens.reduce((a, i) => a + i.totalCents, 0);
    const credito = creditoDaNota(nota.itens, { ...ctx, dataEmissao: nota.dataCompra });
    const destacadoPorSituacao = new Map<SituacaoCredito, number>();
    for (const c of credito.itens) {
      if (c.destacadoCents > 0) destacadoPorSituacao.set(c.situacao, (destacadoPorSituacao.get(c.situacao) ?? 0) + c.destacadoCents);
    }
    for (const r of nota.rateios) {
      const chave = chaveDe(nota, r);
      const linha = acc.get(chave) ?? { brutoCents: 0, destacadoCents: 0, creditoCents: 0, porSituacao: {} };
      linha.brutoCents += custoRateado(brutoNota, r.fracaoBp);
      linha.destacadoCents += custoRateado(credito.destacadoCents, r.fracaoBp);
      linha.creditoCents += custoRateado(credito.creditoCents, r.fracaoBp);
      for (const [sit, cents] of destacadoPorSituacao) {
        const parte = custoRateado(cents, r.fracaoBp);
        if (parte > 0) linha.porSituacao[sit] = (linha.porSituacao[sit] ?? 0) + parte;
      }
      acc.set(chave, linha);
    }
  }
  return new Map([...acc].map(([k, v]) => [k, fechar(v)]));
}

/** Um realizado bruto (de custos.ts, que vem de todas as notas) com o crédito recuperável dele. */
export function aplicarCredito(brutoCents: number, creditoCents: number): Pick<CustoLiquido, "brutoCents" | "creditoCents" | "liquidoCents"> {
  const credito = Math.max(0, creditoCents);
  return { brutoCents, creditoCents: credito, liquidoCents: custoLiquidoCents(brutoCents, credito) };
}

/**
 * Líquido do item para a curva ABC: total do item menos o crédito dele. A classificação é escolhida pela data da nota.
 */
export function liquidoDoItem(
  item: ItemParaCustoLiquido,
  dataCompra: Date | string,
  ctx: ContextoCustoLiquido,
): number {
  const { creditoCents } = creditoDaNota([item], { ...ctx, dataEmissao: dataCompra });
  return custoLiquidoCents(item.totalCents, creditoCents);
}

// O realizado bruto continua o número principal: o líquido só toma o lugar dele com regime regular e crédito a recuperar.
export type ModoCusto = "BRUTO" | "LIQUIDO";

export function haCredito(regime: RegimeIbsCbs, creditoCents: number): boolean {
  return regime === "REGULAR" && creditoCents > 0;
}

/** `preferido` vem da escolha do usuário (?custo=bruto); sem crédito não há o que escolher. */
export function modoDoCusto(regime: RegimeIbsCbs, creditoCents: number, preferido?: string | null): ModoCusto {
  return haCredito(regime, creditoCents) && preferido !== "bruto" ? "LIQUIDO" : "BRUTO";
}

export type AvisosCredito = {
  /** Regime não informado e há IBS/CBS destacado: o ADMIN precisa dizer como a empresa apura. */
  pedirRegime: boolean;
  /** IBS/CBS destacado de teste (2026), sem crédito. */
  periodoTesteCents: number;
  /** Destacado que não virou crédito mesmo no regime regular (vedado ou classificação a conferir). */
  naoCreditadoCents: number;
};

export function avisosDoCredito(regime: RegimeIbsCbs, custo: Pick<CustoLiquido, "porSituacao">): AvisosCredito {
  const s = custo.porSituacao;
  return {
    pedirRegime: regime === "NAO_INFORMADO" && (s.REGIME_NAO_INFORMADO ?? 0) > 0,
    periodoTesteCents: s.PERIODO_TESTE ?? 0,
    naoCreditadoCents: (s.VEDADO ?? 0) + (s.CLASSIFICACAO_DESCONHECIDA ?? 0),
  };
}

/** Códigos de classificação que o cálculo vai precisar: só itens com destaque, e só com regime regular (nos demais a classificação não pesa). */
export function codigosParaClassificar(
  notas: readonly { dataCompra: Date | string; itens: readonly ItemParaCredito[] }[],
  regime: RegimeIbsCbs,
): string[] {
  if (regime !== "REGULAR") return [];
  const codigos = new Set<string>();
  for (const n of notas) {
    for (const i of n.itens) {
      if (i.cClassTrib && (i.cbsCents ?? 0) + (i.ibsUfCents ?? 0) + (i.ibsMunCents ?? 0) > 0) codigos.add(i.cClassTrib);
    }
  }
  return [...codigos];
}
