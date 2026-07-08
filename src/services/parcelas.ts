import { addMonths, setDate, lastDayOfMonth } from "date-fns";
import type { FormaPagto } from "@prisma/client";

export type ParcelaGerada = {
  numero: number;
  valorCents: number;
  vencimento: Date;
};

/**
 * Divide um total em N parcelas inteiras (centavos) sem perder centavos:
 * a diferença do arredondamento vai para a primeira parcela.
 */
export function dividirValor(totalCents: number, n: number): number[] {
  if (n < 1) throw new Error("Número de parcelas deve ser ≥ 1");
  const base = Math.floor(totalCents / n);
  const resto = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

/** Dia 20 do mês seguinte à data (padrão de vencimento de cartão observado nas planilhas). */
function dia20MesSeguinte(data: Date): Date {
  return setDate(addMonths(data, 1), 20);
}

/** Mesmo dia do mês seguinte, ajustando para o último dia quando o mês é mais curto. */
function mesSeguinte(data: Date, meses: number): Date {
  const alvo = addMonths(data, meses);
  const ultimo = lastDayOfMonth(alvo).getDate();
  return alvo.getDate() > ultimo ? setDate(alvo, ultimo) : alvo;
}

/**
 * Gera parcelas com vencimento sugerido conforme a forma de pagamento:
 * - PIX / DÉBITO: 1 parcela vencendo na data da compra
 * - CARTÃO: parcela 1 no dia 20 do mês seguinte; demais a cada mês
 * - BOLETO: parcelas a cada 30 dias-mês a partir do mês seguinte
 * A soma das parcelas é sempre exatamente o total.
 */
export function gerarParcelas(opts: {
  totalCents: number;
  numParcelas: number;
  formaPagto: FormaPagto;
  dataCompra: Date;
}): ParcelaGerada[] {
  const { totalCents, numParcelas, formaPagto, dataCompra } = opts;
  if (totalCents <= 0) throw new Error("Total deve ser maior que zero");

  const aVista = formaPagto === "PIX" || formaPagto === "DEBITO";
  const n = aVista ? 1 : numParcelas;
  const valores = dividirValor(totalCents, n);

  return valores.map((valorCents, i) => {
    let vencimento: Date;
    if (aVista) {
      vencimento = dataCompra;
    } else if (formaPagto === "CARTAO") {
      vencimento = mesSeguinte(dia20MesSeguinte(dataCompra), i);
    } else {
      vencimento = mesSeguinte(dataCompra, i + 1);
    }
    return { numero: i + 1, valorCents, vencimento };
  });
}

/** Valida que a soma das parcelas bate com o total da nota (regra de bloqueio). */
export function validarParcelas(
  parcelas: { valorCents: number }[],
  totalCents: number,
): { ok: boolean; diferencaCents: number } {
  const soma = parcelas.reduce((acc, p) => acc + p.valorCents, 0);
  return { ok: soma === totalCents, diferencaCents: soma - totalCents };
}
