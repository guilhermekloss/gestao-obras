export const BP_TOTAL = 10_000; // 100% em basis points

/** Valida que as frações de rateio somam exatamente 100% (regra de bloqueio). */
export function validarRateio(rateios: { fracaoBp: number }[]): {
  ok: boolean;
  somaBp: number;
} {
  const somaBp = rateios.reduce((acc, r) => acc + r.fracaoBp, 0);
  return { ok: somaBp === BP_TOTAL, somaBp };
}

/**
 * Divide 100% igualmente entre N obras sem perder basis points:
 * o resto do arredondamento vai para a primeira.
 */
export function dividirIgualmente(n: number): number[] {
  if (n < 1) throw new Error("Divisão exige ao menos 1 obra");
  const base = Math.floor(BP_TOTAL / n);
  const resto = BP_TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

/** Total de um item em centavos: qtde × unitário − desconto (arredondado por item). */
export function calcularTotalItem(
  qtde: number,
  unitCents: number,
  descontoCents = 0,
): number {
  return Math.round(qtde * unitCents) - descontoCents;
}

/** Parcela do custo de um item atribuída a uma obra, em centavos. */
export function custoRateado(totalCents: number, fracaoBp: number): number {
  return Math.round((totalCents * fracaoBp) / BP_TOTAL);
}

/** Soma os totais de uma lista de itens (mesma fórmula de `calcularTotalItem`). */
export function somaItens(
  itens: { qtde: number; unitCents: number; descontoCents?: number }[],
): number {
  return itens.reduce((acc, i) => acc + calcularTotalItem(i.qtde, i.unitCents, i.descontoCents), 0);
}
