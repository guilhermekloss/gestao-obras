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

/** Converte string de moeda BR ("1.234,56") para centavos (Int). Inválido/vazio → 0. */
export function moedaParaCents(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(limpo);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converte centavos (Int) para string editável ("1234,56" — sem separador de
 * milhar, para não conflitar com o parser de `moedaParaCents`). Inverso de
 * `moedaParaCents`. Ex.: 123456 → "1234,56", 0 → "0,00".
 *
 * Campos que devem ficar em branco quando o valor é zero (ex.: orçamento
 * ainda não preenchido) fazem isso no call site: `cents ? centsParaEditavel(cents) : ""`.
 */
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

/** Formata basis points como percentual para exibição (1 casa). Ex.: 2550 → "25,5%" */
export function formatarPercentBp(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Converte basis points para string editável, com precisão total de bp
 * (2 casas — 1 bp = 0,01%). Usado em campos editáveis (rateio, medição),
 * onde `formatarPercentBp` perderia precisão ao arredondar para 1 casa.
 * Ex.: 3334 → "33,34".
 */
export function percentBpParaEditavel(bp: number): string {
  return (bp / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte string de percentual editável ("33,34") para basis points.
 * Retorna `null` quando a string não é um número válido — o call site decide
 * a política (0 para tolerar digitação parcial, ou erro de validação).
 */
export function percentEditavelParaBp(s: string): number | null {
  const num = parseFloat(s.replace(",", "."));
  return Number.isNaN(num) ? null : Math.round(num * 100);
}

/**
 * Converte uma Date para o valor de um `<input type="date">` ("aaaa-mm-dd"),
 * usando os componentes locais (não UTC) — `toISOString().slice(0, 10)` desloca
 * um dia perto da meia-noite em fusos a leste de UTC.
 */
export function dataParaInput(data: Date | string): string {
  const d = new Date(data);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Converte o valor de um `<input type="date">` ("aaaa-mm-dd") para uma Date
 * fixada ao meio-dia local, evitando que o fuso horário jogue a data para o
 * dia anterior ou seguinte ao converter para UTC internamente.
 */
export function inputParaData(valor: string): Date {
  return new Date(`${valor}T12:00:00`);
}

/**
 * Tempo decorrido em texto curto: "agora", "há 5 min", "há 3 h", "ontem",
 * "há 4 dias"; acima de 30 dias, a data. Ex.: último acesso de um usuário.
 */
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
