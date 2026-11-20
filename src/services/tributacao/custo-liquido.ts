// Custo da obra líquido do crédito de IBS/CBS. Puro: as notas e as classificações chegam prontas (ver custo-liquido-db.ts).
// Mesma base do realizado de custos.ts: itens somados por nota e só então rateados, com o arredondamento por nota.
import type { RegimeIbsCbs } from "@prisma/client";
import { custoRateado } from "../rateio";
import {
  classificacaoVigente,
  creditoDaNota,
  creditoDoItem,
  custoLiquidoCents,
  indexarClassificacoes,
  type Classificacoes,
  type ItemParaCredito,
  type SituacaoCredito,
} from "./credito";
import { diaDe, ehLinhaIbsCbsPorFora, ibsCbsDestacadoCents, INICIO_CREDITO_IBS_CBS } from "./ibs-cbs";

export type ItemParaCustoLiquido = ItemParaCredito & { totalCents: number; descricao?: string | null };

export type NotaParaCustoLiquido = {
  /** Data de emissão: decide o período de teste (2026) e a vigência da classificação. */
  dataCompra: Date | string;
  itens: ItemParaCustoLiquido[];
  rateios: { obraId: string; etapaId: string | null; fracaoBp: number }[];
};

export type ContextoCustoLiquido = {
  regimeEmpresa: RegimeIbsCbs;
  classificacoes: Classificacoes;
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
  const classificacoes = indexarClassificacoes(ctx.classificacoes);
  for (const nota of notas) {
    if (nota.rateios.length === 0) continue;
    const brutoNota = nota.itens.reduce((a, i) => a + i.totalCents, 0);
    const credito = creditoDaNota(nota.itens, { ...ctx, classificacoes, dataEmissao: nota.dataCompra });
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

export type CustoDoItem = {
  /** O desembolso do item: com IBS/CBS por fora, total + destacado; a linha acessória fica em 0. */
  brutoCents: number;
  /** O que de fato sai do custo: bruto − líquido (o crédito acima do bruto não conta). */
  creditoCents: number;
  /** Bruto menos crédito, nunca negativo. */
  liquidoCents: number;
  situacao: SituacaoCredito;
};

/**
 * Custo de um item com o crédito dele (classificação escolhida pela data). Nota com IBS/CBS por fora (`porFora`): o total
 * do produto não traz o imposto, que está na linha acessória; o imposto pago à parte e não recuperado é custo do produto,
 * então bruto = total + destacado, e a linha acessória fica em 0 (o valor dela já foi redistribuído nos produtos).
 */
export function custoDoItem(
  item: ItemParaCustoLiquido,
  ctx: ContextoCustoLiquido & { dataEmissao: Date | string; porFora: boolean },
): CustoDoItem {
  const { situacao, creditoCents } = creditoDoItem(item, {
    regimeEmpresa: ctx.regimeEmpresa,
    dataEmissao: ctx.dataEmissao,
    classificacao: classificacaoVigente(ctx.classificacoes, item.cClassTrib, ctx.dataEmissao),
  });
  if (ctx.porFora && ehLinhaIbsCbsPorFora(item)) return { brutoCents: 0, creditoCents: 0, liquidoCents: 0, situacao };
  const brutoCents = item.totalCents + (ctx.porFora ? ibsCbsDestacadoCents(item) : 0);
  const liquidoCents = custoLiquidoCents(brutoCents, creditoCents);
  return { brutoCents, creditoCents: brutoCents - liquidoCents, liquidoCents, situacao };
}

/**
 * Líquido de cada item de uma nota, na ordem dada, para a curva ABC. `porFora` ausente: a nota tem IBS/CBS por fora se
 * tiver a linha acessória (vNFTot > vNF, ou NFS-e). A soma bate com o líquido da nota de agregarCustoLiquido (só há
 * somas inteiras, sem arredondar).
 */
export function liquidosDosItens(
  itens: readonly ItemParaCustoLiquido[],
  dataCompra: Date | string,
  ctx: ContextoCustoLiquido,
  porFora: boolean = itens.some(ehLinhaIbsCbsPorFora),
): number[] {
  const c = { ...ctx, dataEmissao: dataCompra, porFora };
  return itens.map((i) => custoDoItem(i, c).liquidoCents);
}

// O realizado bruto continua o número principal: o líquido só toma o lugar dele com regime regular e crédito a recuperar.
export type ModoCusto = "BRUTO" | "LIQUIDO";

/** `comCredito`: há o que escolher (regime regular e crédito a recuperar). `preferido` vem do usuário (?custo=bruto). */
export function modoDoCusto(regime: RegimeIbsCbs, creditoCents: number, preferido?: string | null): { comCredito: boolean; modo: ModoCusto } {
  const comCredito = regime === "REGULAR" && creditoCents > 0;
  return { comCredito, modo: comCredito && preferido !== "bruto" ? "LIQUIDO" : "BRUTO" };
}

export type AvisosCredito = {
  /** Regime não informado e há IBS/CBS destacado: o ADMIN precisa dizer como a empresa apura. */
  pedirRegime: boolean;
  /** IBS/CBS destacado de teste (2026), sem crédito. */
  periodoTesteCents: number;
  /** Destacado que não virou crédito mesmo no regime regular (vedado ou classificação a conferir). */
  naoCreditadoCents: number;
};

/** Avisos do crédito lido (CreditoIbsCbs de custo-liquido-db, ou só o regime e o total). */
export function avisosDoCredito(credito: { regime: RegimeIbsCbs; total: Pick<CustoLiquido, "porSituacao"> }): AvisosCredito {
  const s = credito.total.porSituacao;
  return {
    pedirRegime: credito.regime === "NAO_INFORMADO" && (s.REGIME_NAO_INFORMADO ?? 0) > 0,
    periodoTesteCents: s.PERIODO_TESTE ?? 0,
    naoCreditadoCents: (s.VEDADO ?? 0) + (s.CLASSIFICACAO_DESCONHECIDA ?? 0),
  };
}

/**
 * Códigos de classificação que o cálculo vai precisar: só com regime regular, só notas de 2027 em diante e só itens com
 * destaque. Nos demais casos creditoDoItem decide antes de olhar a classificação, então nem vale carregá-la.
 */
export function codigosParaClassificar(
  notas: readonly { dataCompra: Date | string; itens: readonly ItemParaCredito[] }[],
  regime: RegimeIbsCbs,
): string[] {
  if (regime !== "REGULAR") return [];
  const codigos = new Set<string>();
  for (const n of notas) {
    if (diaDe(n.dataCompra) < INICIO_CREDITO_IBS_CBS) continue;
    for (const i of n.itens) {
      if (i.cClassTrib && ibsCbsDestacadoCents(i) > 0) codigos.add(i.cClassTrib);
    }
  }
  return [...codigos];
}
