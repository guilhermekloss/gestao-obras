// Tipos e regras básicas do IBS/CBS lidos dos documentos fiscais. Os nomes dos campos são os das colunas de ItemNota,
// para o item lido do XML ir para o banco sem tradução. Sem acesso ao banco: pode ir para o client.
import type { RegimeIbsCbs } from "@prisma/client";
import { dataParaInput } from "@/lib/format";

export const REGIME_IBS_CBS_LABELS: Record<RegimeIbsCbs, string> = {
  NAO_INFORMADO: "Não informado",
  REGULAR: "Regime regular",
  SIMPLES_NACIONAL: "Simples Nacional",
};

/** Primeiro dia da reforma nos documentos fiscais (ano de teste, aaaa-mm-dd). */
export const INICIO_IBS_CBS_NA_NOTA = "2026-01-01";
/** Primeiro dia com crédito de IBS/CBS no custo (aaaa-mm-dd). */
export const INICIO_CREDITO_IBS_CBS = "2027-01-01";

/** Dia (aaaa-mm-dd) de uma data gravada ao meio-dia local (dataCompra), ou de um texto que já começa pelo dia. */
export function diaDe(data: Date | string): string {
  return typeof data === "string" ? data.slice(0, 10) : dataParaInput(data);
}

/** Dia de uma coluna @db.Date: chega como meia-noite UTC, então vem do ISO e não do fuso local (que voltaria um dia). */
export function diaUtc(data: Date): string {
  return data.toISOString().slice(0, 10);
}

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

/** As colunas de IBS/CBS de ItemNota: todas anuláveis (item sem o grupo, lançamento manual). */
export type ColunasIbsCbs = { [K in keyof TributacaoIbsCbs]: TributacaoIbsCbs[K] | null };

type Aliquota = "pCbs" | "pIbsUf" | "pIbsMun" | "pRedCbs" | "pRedIbs";
type DecimalGravado = { toString(): string } | null;

/** As mesmas colunas como o Prisma devolve: alíquotas em Decimal. */
export type ColunasIbsCbsGravadas = Omit<ColunasIbsCbs, Aliquota> & Record<Aliquota, DecimalGravado>;

/** Select das colunas de IBS/CBS de ItemNota; o `satisfies` mantém select e tipo em sincronia. */
export const SELECT_IBS_CBS = {
  cst: true,
  cClassTrib: true,
  ibsCbsBaseCents: true,
  pCbs: true,
  pIbsUf: true,
  pIbsMun: true,
  pRedCbs: true,
  pRedIbs: true,
  cbsCents: true,
  ibsUfCents: true,
  ibsMunCents: true,
  ibsCbsDiferidoCents: true,
  cCredPres: true,
  credPresCents: true,
} as const satisfies Record<keyof TributacaoIbsCbs, true>;

/** Só o que o crédito lê (classificação e valores destacados). */
export const SELECT_CREDITO_IBS_CBS = {
  cClassTrib: true,
  cbsCents: true,
  ibsUfCents: true,
  ibsMunCents: true,
} as const satisfies Partial<Record<keyof TributacaoIbsCbs, true>>;

export type ColunasCreditoIbsCbs = Pick<ColunasIbsCbs, keyof typeof SELECT_CREDITO_IBS_CBS>;

const CAMPOS_IBS_CBS = Object.keys(SELECT_IBS_CBS) as (keyof TributacaoIbsCbs)[];

/** Item sem IBS/CBS: todas as colunas nulas. */
export const SEM_IBS_CBS: Readonly<ColunasIbsCbs> = Object.freeze(
  Object.fromEntries(CAMPOS_IBS_CBS.map((k) => [k, null])) as ColunasIbsCbs,
);

/** Achata a tributação do item (ou a falta dela) nas colunas de ItemNota; só as colunas de IBS/CBS, nada a mais. */
export function colunasIbsCbs(t: Partial<ColunasIbsCbs> | null | undefined): ColunasIbsCbs {
  const c = { ...SEM_IBS_CBS } as Record<keyof TributacaoIbsCbs, unknown>;
  if (t) for (const k of CAMPOS_IBS_CBS) c[k] = t[k] ?? null;
  return c as ColunasIbsCbs;
}

const texto = (d: DecimalGravado | undefined) => (d == null ? null : d.toString());

/** Colunas gravadas com as alíquotas Decimal em texto exato (como vieram do XML). */
export function ibsCbsDoGravado(g: Partial<ColunasIbsCbsGravadas>): ColunasIbsCbs {
  return {
    ...colunasIbsCbs(g as Partial<ColunasIbsCbs>),
    pCbs: texto(g.pCbs),
    pIbsUf: texto(g.pIbsUf),
    pIbsMun: texto(g.pIbsMun),
    pRedCbs: texto(g.pRedCbs),
    pRedIbs: texto(g.pRedIbs),
  };
}

/** O item tem o grupo IBS/CBS (CST ou classificação informados). */
export function temGrupoIbsCbs(item: { cst?: string | null; cClassTrib?: string | null }): boolean {
  return !!item.cst || !!item.cClassTrib;
}

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

/** Regime do fornecedor como as telas mostram: o CRT 1 e o 2 são o mesmo Simples. */
export type RegimeFornecedor = "SIMPLES" | "NORMAL" | "MEI" | "NAO_IDENTIFICADO";

export const REGIME_FORNECEDOR_LABELS: Record<RegimeFornecedor, string> = {
  SIMPLES: "Simples",
  NORMAL: "Regime normal",
  MEI: "MEI",
  NAO_IDENTIFICADO: "Não identificado",
};

const REGIME_DO_CRT: Record<CrtEmitente, RegimeFornecedor> = { "1": "SIMPLES", "2": "SIMPLES", "3": "NORMAL", "4": "MEI" };

/** CRT ausente ou inválido (nota antiga, lançamento manual) é não identificado. */
export function regimeDoCrt(crt: string | null | undefined): RegimeFornecedor {
  const v = crtValido(crt);
  return v ? REGIME_DO_CRT[v] : "NAO_IDENTIFICADO";
}

/** Descrição do item acessório com o IBS/CBS cobrado por fora do vNF (NF-e e NFS-e). */
export const DESCRICAO_IBS_CBS_POR_FORA = "IBS/CBS destacados na nota (cobrados por fora)";

/** A linha acessória do IBS/CBS por fora. Não há coluna que a marque: a descrição é fixa (nfe-xml e nfse-xml). */
export function ehLinhaIbsCbsPorFora(item: { descricao?: string | null }): boolean {
  return item.descricao === DESCRICAO_IBS_CBS_POR_FORA;
}

/** CBS + IBS (UF e município) destacados no item; 0 quando não há destaque. */
export function ibsCbsDestacadoCents(
  item: { cbsCents?: number | null; ibsUfCents?: number | null; ibsMunCents?: number | null },
): number {
  return (item.cbsCents ?? 0) + (item.ibsUfCents ?? 0) + (item.ibsMunCents ?? 0);
}
