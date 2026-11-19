import type { RegimeIbsCbs } from "@prisma/client";
import { dataParaInput } from "@/lib/format";
import { ibsCbsDestacadoCents } from "./ibs-cbs";

// Crédito de IBS/CBS do adquirente (a construtora). Premissas, todas conservadoras:
// - só a empresa no regime regular credita; Simples e "não informado" não (o tributo fica no custo);
// - 2026 é o ano de teste (CBS 0,9% e IBS 0,1%, compensados pelo fornecedor com PIS/Cofins): sem crédito econômico;
// - a partir de 2027 o crédito é o destacado no documento (CBS + IBS da UF + IBS do município), por tributo,
//   quando a classificação tributária (tabela da Receita) permite a apropriação pelo adquirente;
// - classificação ausente, fora da vigência ou desconhecida: crédito zero até alguém conferir;
// - crédito presumido do adquirente não vem no documento: só é sinalizado, não somado.

/** Primeiro dia com crédito de IBS/CBS no custo (aaaa-mm-dd). */
export const INICIO_CREDITO_IBS_CBS = "2027-01-01";

/** O que a regra precisa da ClassificacaoTributaria; vigências em aaaa-mm-dd, fim inclusive. */
export type ClassificacaoParaCredito = {
  codigo: string;
  inicioVigencia: string;
  fimVigencia: string | null;
  apropriaCreditoCbs: boolean;
  apropriaCreditoIbs: boolean;
  creditoPresumidoAdquirente: boolean;
};

/** Colunas de ItemNota usadas no cálculo (o item lido do XML, TributacaoIbsCbs, também serve). */
export type ItemParaCredito = {
  cClassTrib: string | null;
  cbsCents: number | null;
  ibsUfCents: number | null;
  ibsMunCents: number | null;
};

export type SituacaoCredito =
  /** CBS e IBS destacados viram crédito. */
  | "PERMITIDO"
  /** Só um dos tributos permite (ex.: 200025, IBS sim e CBS não). */
  | "PARCIAL"
  /** A classificação não deixa o adquirente apropriar. */
  | "VEDADO"
  /** Nada destacado (nota anterior à reforma, isenção, imunidade, lançamento manual). */
  | "SEM_DESTAQUE"
  /** Emissão antes de 2027. */
  | "PERIODO_TESTE"
  /** Empresa no Simples Nacional. */
  | "REGIME_NAO_REGULAR"
  /** Regime da empresa não cadastrado (tela Empresa). */
  | "REGIME_NAO_INFORMADO"
  /** cClassTrib ausente, fora da tabela ou fora da vigência na data de emissão. */
  | "CLASSIFICACAO_DESCONHECIDA";

export type CreditoDoItem = {
  situacao: SituacaoCredito;
  /** CBS + IBS destacados no item. */
  destacadoCents: number;
  creditoCents: number;
  cbsCreditoCents: number;
  ibsCreditoCents: number;
  /** A classificação prevê crédito presumido para o adquirente (não calculado aqui). */
  creditoPresumidoAdquirente: boolean;
};

export type ContextoCredito = {
  regimeEmpresa: RegimeIbsCbs;
  /** Data de emissão do documento (Date gravado ao meio-dia local, ou aaaa-mm-dd). */
  dataEmissao: Date | string;
  /** Classificação do item já escolhida (ver classificacaoVigente); conferida de novo aqui. */
  classificacao?: ClassificacaoParaCredito | null;
};

function diaDe(data: Date | string): string {
  return typeof data === "string" ? data.slice(0, 10) : dataParaInput(data);
}

function vigente(c: ClassificacaoParaCredito, dia: string): boolean {
  return c.inicioVigencia <= dia && (c.fimVigencia === null || dia <= c.fimVigencia);
}

/** Classificação do código na data (a de início mais recente, se houver mais de uma); nula se nenhuma vale. */
export function classificacaoVigente<C extends ClassificacaoParaCredito>(
  classificacoes: readonly C[],
  codigo: string | null | undefined,
  data: Date | string,
): C | null {
  if (!codigo) return null;
  const dia = diaDe(data);
  let melhor: C | null = null;
  for (const c of classificacoes) {
    if (c.codigo === codigo && vigente(c, dia) && (!melhor || c.inicioVigencia > melhor.inicioVigencia)) melhor = c;
  }
  return melhor;
}

export function creditoDoItem(item: ItemParaCredito, ctx: ContextoCredito): CreditoDoItem {
  const destacadoCents = ibsCbsDestacadoCents(item);
  const sem = (situacao: SituacaoCredito, creditoPresumidoAdquirente = false): CreditoDoItem => ({
    situacao,
    destacadoCents,
    creditoCents: 0,
    cbsCreditoCents: 0,
    ibsCreditoCents: 0,
    creditoPresumidoAdquirente,
  });

  if (destacadoCents <= 0) return sem("SEM_DESTAQUE");
  if (ctx.regimeEmpresa === "NAO_INFORMADO") return sem("REGIME_NAO_INFORMADO");
  if (ctx.regimeEmpresa !== "REGULAR") return sem("REGIME_NAO_REGULAR");
  const dia = diaDe(ctx.dataEmissao);
  if (dia < INICIO_CREDITO_IBS_CBS) return sem("PERIODO_TESTE");

  const c = ctx.classificacao;
  if (!c || !item.cClassTrib || c.codigo !== item.cClassTrib || !vigente(c, dia)) return sem("CLASSIFICACAO_DESCONHECIDA");

  const cbsCreditoCents = c.apropriaCreditoCbs ? (item.cbsCents ?? 0) : 0;
  const ibsCreditoCents = c.apropriaCreditoIbs ? (item.ibsUfCents ?? 0) + (item.ibsMunCents ?? 0) : 0;
  const situacao: SituacaoCredito =
    c.apropriaCreditoCbs && c.apropriaCreditoIbs ? "PERMITIDO" : c.apropriaCreditoCbs || c.apropriaCreditoIbs ? "PARCIAL" : "VEDADO";
  return {
    situacao,
    destacadoCents,
    creditoCents: cbsCreditoCents + ibsCreditoCents,
    cbsCreditoCents,
    ibsCreditoCents,
    creditoPresumidoAdquirente: c.creditoPresumidoAdquirente,
  };
}

/** Crédito de todos os itens de um documento, escolhendo a classificação vigente de cada um. */
export function creditoDaNota(
  itens: readonly ItemParaCredito[],
  ctx: Omit<ContextoCredito, "classificacao"> & { classificacoes: readonly ClassificacaoParaCredito[] },
): { creditoCents: number; destacadoCents: number; itens: CreditoDoItem[] } {
  const porItem = itens.map((item) =>
    creditoDoItem(item, {
      regimeEmpresa: ctx.regimeEmpresa,
      dataEmissao: ctx.dataEmissao,
      classificacao: classificacaoVigente(ctx.classificacoes, item.cClassTrib, ctx.dataEmissao),
    }),
  );
  return {
    creditoCents: porItem.reduce((a, i) => a + i.creditoCents, 0),
    destacadoCents: porItem.reduce((a, i) => a + i.destacadoCents, 0),
    itens: porItem,
  };
}

/** Custo líquido do crédito, nunca negativo (crédito acima do total é erro de dado, não custo negativo). */
export function custoLiquidoCents(totalCents: number, creditoCents: number): number {
  return Math.max(0, totalCents - Math.max(0, creditoCents));
}
