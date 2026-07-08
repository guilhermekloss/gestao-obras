import { custoRateado } from "./rateio";

export type ParcelaComRateio = {
  valorCents: number;
  vencimento: Date;
  rateios: { obraId: string; fracaoBp: number }[];
};

export type FluxoMensal = {
  meses: string[]; // "2026-01" ordenado
  obras: string[]; // obraIds presentes
  /** valores[mes][obraId] em centavos */
  valores: Record<string, Record<string, number>>;
  totalPorMes: Record<string, number>;
  totalPorObra: Record<string, number>;
};

function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monta a matriz mês × obra a partir das parcelas, distribuindo o valor
 * de cada parcela conforme o rateio da nota (visão que a planilha 2 dava).
 */
export function fluxoMensal(parcelas: ParcelaComRateio[]): FluxoMensal {
  const valores: Record<string, Record<string, number>> = {};
  const obrasSet = new Set<string>();

  for (const p of parcelas) {
    const mes = chaveMes(p.vencimento);
    valores[mes] ??= {};
    for (const r of p.rateios) {
      obrasSet.add(r.obraId);
      valores[mes][r.obraId] =
        (valores[mes][r.obraId] ?? 0) + custoRateado(p.valorCents, r.fracaoBp);
    }
  }

  const meses = Object.keys(valores).sort();
  const obras = [...obrasSet];
  const totalPorMes: Record<string, number> = {};
  const totalPorObra: Record<string, number> = {};

  for (const mes of meses) {
    for (const obraId of obras) {
      const v = valores[mes][obraId] ?? 0;
      totalPorMes[mes] = (totalPorMes[mes] ?? 0) + v;
      totalPorObra[obraId] = (totalPorObra[obraId] ?? 0) + v;
    }
  }

  return { meses, obras, valores, totalPorMes, totalPorObra };
}
