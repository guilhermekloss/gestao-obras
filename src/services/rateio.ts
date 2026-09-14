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

/**
 * Distribui 100% entre pesos arbitrários (proporcional a cada peso), sem
 * perder basis points: cada fração é arredondada e o resto do arredondamento
 * vai para a primeira. Não é usada por `dividirIgualmente` — para pesos
 * iguais, o arredondamento por peso pode enviar o resto para uma posição
 * diferente da divisão por `floor`, o que mudaria um resultado já coberto
 * por teste.
 */
export function distribuirBpPorPeso(pesos: number[]): number[] {
  if (pesos.length < 1) throw new Error("Distribuição exige ao menos 1 peso");
  const somaPesos = pesos.reduce((a, p) => a + p, 0);
  const fracoes = pesos.map((p) => Math.round((p / somaPesos) * BP_TOTAL));
  const soma = fracoes.reduce((a, f) => a + f, 0);
  fracoes[0] += BP_TOTAL - soma;
  return fracoes;
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
