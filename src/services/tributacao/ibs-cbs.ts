// Tipos do IBS/CBS lidos dos documentos fiscais. Os nomes dos campos são os das colunas de ItemNota,
// para o item lido do XML ir para o banco sem tradução. Sem acesso ao banco: pode ir para o client.
import type { RegimeIbsCbs } from "@prisma/client";

export const REGIME_IBS_CBS_LABELS: Record<RegimeIbsCbs, string> = {
  NAO_INFORMADO: "Não informado",
  REGULAR: "Regime regular",
  SIMPLES_NACIONAL: "Simples Nacional",
};

/** IBS/CBS de um item (grupo `imposto/IBSCBS` da NF-e). Valores em centavos; alíquotas em %, texto decimal exato. */
export type TributacaoIbsCbs = {
  /** CST do IBS/CBS (3 dígitos). */
  cst: string;
  /** Classificação tributária (6 dígitos). */
  cClassTrib: string;
  /** gIBSCBS/vBC; nulo quando o CST não leva o grupo (isenção, imunidade, monofásico...). */
  ibsCbsBaseCents: number | null;
  pCbs: string | null;
  pIbsUf: string | null;
  pIbsMun: string | null;
  /** gRed/pRedAliq; nulo sem redução. O do IBS vem da UF (o do município é o mesmo na tabela da Receita). */
  pRedCbs: string | null;
  pRedIbs: string | null;
  /** Valores destacados. No monofásico (CST 620) o IBS vem num valor só e fica em `ibsUfCents`. */
  cbsCents: number | null;
  ibsUfCents: number | null;
  ibsMunCents: number | null;
  /** Soma dos vDif de CBS e IBS (diferimento): não cobrado nesta etapa. */
  ibsCbsDiferidoCents: number | null;
  /** Crédito presumido da operação (gCredPresOper), aproveitado pelo emitente. */
  cCredPres: string | null;
  credPresCents: number | null;
};

/** Totais do grupo `total/IBSCBSTot` da NF-e (conferência com a soma dos itens). */
export type TotaisIbsCbs = {
  ibsCbsBaseCents: number;
  cbsCents: number;
  ibsUfCents: number;
  ibsMunCents: number;
  ibsCbsDiferidoCents: number;
  credPresCents: number;
  /** gMono: CBS e IBS monofásicos (combustíveis). */
  cbsMonoCents: number;
  ibsMonoCents: number;
};

/** CRT do emitente (emit/CRT). */
export type CrtEmitente = "1" | "2" | "3" | "4";

export const CRT_LABELS: Record<CrtEmitente, string> = {
  "1": "Simples Nacional",
  "2": "Simples Nacional (excesso de sublimite)",
  "3": "Regime normal",
  "4": "MEI",
};

export function crtValido(valor: string | null | undefined): CrtEmitente | null {
  return valor && valor in CRT_LABELS ? (valor as CrtEmitente) : null;
}

/** Emitente do Simples ou MEI (CRT 1, 2 ou 4): o IBS/CBS dele não vem destacado como no regime normal. */
export function emitenteDoSimples(crt: string | null | undefined): boolean {
  return crt === "1" || crt === "2" || crt === "4";
}

/** CBS + IBS (UF e município) destacados no item; 0 quando não há destaque. */
export function ibsCbsDestacadoCents(
  item: { cbsCents?: number | null; ibsUfCents?: number | null; ibsMunCents?: number | null },
): number {
  return (item.cbsCents ?? 0) + (item.ibsUfCents ?? 0) + (item.ibsMunCents ?? 0);
}
