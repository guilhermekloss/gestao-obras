import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const moedaBR = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata centavos (Int) como moeda BR. Ex.: 123456 → "R$ 1.234,56" */
export function formatarMoeda(cents: number): string {
  return moedaBR.format(cents / 100);
}

/** Converte string de moeda BR ("1.234,56") para centavos (Int). */
export function moedaParaCents(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(limpo);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function formatarData(data: Date | string): string {
  return format(new Date(data), "dd/MM/yyyy", { locale: ptBR });
}

export function formatarDataCurta(data: Date | string): string {
  return format(new Date(data), "dd/MM", { locale: ptBR });
}

export function formatarMesAno(data: Date | string): string {
  return format(new Date(data), "MMM/yy", { locale: ptBR });
}

/** Formata basis points como percentual. Ex.: 2550 → "25,5%" */
export function formatarPercentBp(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
