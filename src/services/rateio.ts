export const BP_TOTAL = 10_000; // 100% em basis points

export function validarRateio(rateios: { fracaoBp: number }[]): {
  ok: boolean;
  somaBp: number;
} {
  const somaBp = rateios.reduce((acc, r) => acc + r.fracaoBp, 0);
  return { ok: somaBp === BP_TOTAL, somaBp };
}

// O resto do arredondamento vai para a primeira obra.
export function dividirIgualmente(n: number): number[] {
  if (n < 1) throw new Error("Divisão exige ao menos 1 obra");
  const base = Math.floor(BP_TOTAL / n);
  const resto = BP_TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

// Resto para a primeira. Não reusar em dividirIgualmente: com pesos iguais o resto cairia em outra posição.
export function distribuirBpPorPeso(pesos: number[]): number[] {
  if (pesos.length < 1) throw new Error("Distribuição exige ao menos 1 peso");
  const somaPesos = pesos.reduce((a, p) => a + p, 0);
  const fracoes = pesos.map((p) => Math.round((p / somaPesos) * BP_TOTAL));
  const soma = fracoes.reduce((a, f) => a + f, 0);
  fracoes[0] += BP_TOTAL - soma;
  return fracoes;
}

export function calcularTotalItem(
  qtde: number,
  unitCents: number,
  descontoCents = 0,
): number {
  return Math.round(qtde * unitCents) - descontoCents;
}

export function custoRateado(totalCents: number, fracaoBp: number): number {
  return Math.round((totalCents * fracaoBp) / BP_TOTAL);
}

export function somaItens(
  itens: { qtde: number; unitCents: number; descontoCents?: number }[],
): number {
  return itens.reduce((acc, i) => acc + calcularTotalItem(i.qtde, i.unitCents, i.descontoCents), 0);
}
