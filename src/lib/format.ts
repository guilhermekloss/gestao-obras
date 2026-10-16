import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const moedaBR = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatarMoeda(cents: number): string {
  return moedaBR.format(cents / 100);
}

export function moedaParaCents(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(limpo);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function centsParaEditavel(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
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

export function formatarPercentBp(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function percentBpParaEditavel(bp: number): string {
  return (bp / 100).toFixed(2).replace(".", ",");
}

export function percentEditavelParaBp(s: string): number | null {
  const num = parseFloat(s.replace(",", "."));
  return Number.isNaN(num) ? null : Math.round(num * 100);
}

// Componentes locais: toISOString().slice(0, 10) desloca um dia perto da meia-noite.
export function dataParaInput(data: Date | string): string {
  const d = new Date(data);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Meio-dia local: o fuso não empurra a data para o dia anterior/seguinte.
export function inputParaData(valor: string): Date {
  return new Date(`${valor}T12:00:00`);
}

export function formatarTempoRelativo(data: Date | string, agora: Date = new Date()): string {
  const d = new Date(data);
  const min = Math.floor((agora.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias <= 30) return `há ${dias} dias`;
  return formatarData(d);
}

export const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// "aaaa-mm" no mês local: chave de agrupamento por mês
export function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "2026-10" -> "out/26"
export function rotuloChaveMes(chave: string): string {
  const [ano, mes] = chave.split("-");
  return `${MESES_ABREV[parseInt(mes) - 1]}/${ano.slice(2)}`;
}
