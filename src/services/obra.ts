import { BP_TOTAL } from "./rateio";
import { formatarPercentBp } from "@/lib/format";

// Ponderado pelo orçamento; etapa sem orçamento não pesa, salvo se nenhuma tiver (aí média simples).
export function avancoPonderado(
  etapas: { orcamentoCents: number; percentBp: number }[],
): number {
  if (etapas.length === 0) return 0;

  const pesoTotal = etapas.reduce((acc, e) => acc + e.orcamentoCents, 0);
  if (pesoTotal === 0) {
    const soma = etapas.reduce((acc, e) => acc + e.percentBp, 0);
    return Math.round(soma / etapas.length);
  }

  const somaPonderada = etapas.reduce(
    (acc, e) => acc + e.percentBp * e.orcamentoCents,
    0,
  );
  return Math.round(somaPonderada / pesoTotal);
}

export function validarAvanco(
  novoPercentBp: number,
  atualPercentBp: number,
): { ok: boolean; erro?: string } {
  if (novoPercentBp < 0 || novoPercentBp > BP_TOTAL) {
    return { ok: false, erro: "Avanço deve estar entre 0% e 100%" };
  }
  if (novoPercentBp < atualPercentBp) {
    return {
      ok: false,
      erro: `Avanço não pode regredir (atual: ${formatarPercentBp(atualPercentBp)})`,
    };
  }
  return { ok: true };
}

export function orcamentoTotal(etapas: { orcamentoCents: number }[]): number {
  return etapas.reduce((acc, e) => acc + e.orcamentoCents, 0);
}

// Avanço da obra a partir do último avanço de cada etapa (etapa sem medição conta 0%).
export function avancoDaObra(
  etapas: { id: string; orcamentoCents: number }[],
  avancos: Map<string, number>,
): number {
  return avancoPonderado(etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, percentBp: avancos.get(e.id) ?? 0 })));
}
