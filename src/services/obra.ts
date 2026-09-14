import { BP_TOTAL } from "./rateio";
import { formatarPercentBp } from "@/lib/format";

/**
 * Avanço físico da obra = média das etapas ponderada pelo orçamento previsto.
 * Etapas sem orçamento entram com peso igual entre si quando nenhuma etapa
 * tem orçamento; caso contrário, etapas sem orçamento não pesam.
 */
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

/** Garante que o avanço informado não regride nem passa de 100%. */
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
