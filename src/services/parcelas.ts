import { addMonths, setDate, lastDayOfMonth } from "date-fns";
import type { FormaPagto, StatusParcela } from "@prisma/client";

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
 * - PIX / DÉBITO / DINHEIRO: 1 parcela vencendo na data da compra
 * - TRANSFERÊNCIA: parcela 1 na data da compra; demais a cada mês (o caso
 *   típico é pagar mão de obra em várias transferências)
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

  const aVista = formaPagto === "PIX" || formaPagto === "DEBITO" || formaPagto === "DINHEIRO";
  const n = aVista ? 1 : numParcelas;
  const valores = dividirValor(totalCents, n);

  return valores.map((valorCents, i) => {
    let vencimento: Date;
    if (aVista) {
      vencimento = dataCompra;
    } else if (formaPagto === "TRANSFERENCIA") {
      vencimento = i === 0 ? dataCompra : mesSeguinte(dataCompra, i);
    } else if (formaPagto === "CARTAO") {
      vencimento = mesSeguinte(dia20MesSeguinte(dataCompra), i);
    } else {
      vencimento = mesSeguinte(dataCompra, i + 1);
    }
    return { numero: i + 1, valorCents, vencimento };
  });
}

// ---------------------------------------------------------------------------
// Edição de nota: preservar pagamentos já registrados
// ---------------------------------------------------------------------------

/** Parcela já gravada. `vencimento` no formato do formulário ("aaaa-mm-dd"). */
export type ParcelaExistente = {
  numero: number;
  valorCents: number;
  vencimento: string;
  status: StatusParcela;
  pagaEm: Date | null;
};

/** Parcela enviada pelo formulário de edição. `vencimento` em "aaaa-mm-dd". */
export type ParcelaEditada = {
  numero: number;
  valorCents: number;
  vencimento: string;
};

/**
 * O que fazer com cada parcela ao salvar:
 * - `manter`: valor e vencimento iguais → não toca no registro (status/pagaEm preservados);
 * - `atualizar`: mesmo número, mas valor ou vencimento mudou → grava e volta a ABERTA;
 * - `criar`: número que não existia.
 */
export type AcaoParcela = "manter" | "atualizar" | "criar";

export type ParcelaReconciliada = ParcelaEditada & {
  acao: AcaoParcela;
  status: StatusParcela;
  pagaEm: Date | null;
};

export type ParcelaPagaAfetada = { numero: number; motivo: "alterada" | "removida" };

export type ReconciliacaoParcelas = {
  /** Estado final de cada parcela editada, na ordem recebida. */
  parcelas: ParcelaReconciliada[];
  /** Números das parcelas antigas que deixaram de existir. */
  removidas: number[];
  /** Parcelas PAGAS que perdem o registro de pagamento — só elas justificam avisar o usuário. */
  pagasAfetadas: ParcelaPagaAfetada[];
};

/**
 * Casa as parcelas antigas com as editadas pelo `numero` e decide o destino
 * de cada uma, preservando status e data de pagamento sempre que valor e
 * vencimento não mudaram. Parcela alterada volta a ABERTA (o pagamento
 * registrado era de outro valor/data); parcela removida some.
 *
 * Mudanças em parcelas ABERTAS não geram aviso: nada se perde.
 */
export function reconciliarParcelas(
  antigas: ParcelaExistente[],
  novas: ParcelaEditada[],
): ReconciliacaoParcelas {
  const numeros = new Set<number>();
  for (const p of novas) {
    if (numeros.has(p.numero)) throw new Error(`Parcela ${p.numero} repetida`);
    numeros.add(p.numero);
  }

  const porNumero = new Map(antigas.map((p) => [p.numero, p]));
  const pagasAfetadas: ParcelaPagaAfetada[] = [];

  const parcelas = novas.map((nova): ParcelaReconciliada => {
    const antiga = porNumero.get(nova.numero);
    if (!antiga) return { ...nova, acao: "criar", status: "ABERTA", pagaEm: null };

    const igual = antiga.valorCents === nova.valorCents && antiga.vencimento === nova.vencimento;
    if (igual) return { ...nova, acao: "manter", status: antiga.status, pagaEm: antiga.pagaEm };

    if (antiga.status === "PAGA") pagasAfetadas.push({ numero: nova.numero, motivo: "alterada" });
    return { ...nova, acao: "atualizar", status: "ABERTA", pagaEm: null };
  });

  const removidas: number[] = [];
  for (const antiga of antigas) {
    if (numeros.has(antiga.numero)) continue;
    removidas.push(antiga.numero);
    if (antiga.status === "PAGA") pagasAfetadas.push({ numero: antiga.numero, motivo: "removida" });
  }

  pagasAfetadas.sort((a, b) => a.numero - b.numero);
  return { parcelas, removidas: removidas.sort((a, b) => a - b), pagasAfetadas };
}

function listarNumeros(numeros: number[]): string {
  const ordinais = numeros.map((n) => `${n}ª`);
  if (ordinais.length <= 1) return ordinais.join("");
  return `${ordinais.slice(0, -1).join(", ")} e ${ordinais[ordinais.length - 1]}`;
}

/**
 * Texto do aviso de confirmação quando a edição afeta parcelas pagas;
 * `null` quando nenhum pagamento se perde.
 */
export function avisoParcelasPagas(afetadas: ParcelaPagaAfetada[]): string | null {
  if (afetadas.length === 0) return null;
  const alteradas = afetadas.filter((a) => a.motivo === "alterada").map((a) => a.numero);
  const removidas = afetadas.filter((a) => a.motivo === "removida").map((a) => a.numero);

  const partes: string[] = [];
  if (alteradas.length > 0) {
    partes.push(
      alteradas.length === 1
        ? `a ${listarNumeros(alteradas)} parcela, já paga, foi alterada e volta a ficar em aberto`
        : `as parcelas ${listarNumeros(alteradas)}, já pagas, foram alteradas e voltam a ficar em aberto`,
    );
  }
  if (removidas.length > 0) {
    partes.push(
      removidas.length === 1
        ? `a ${listarNumeros(removidas)} parcela, já paga, foi removida`
        : `as parcelas ${listarNumeros(removidas)}, já pagas, foram removidas`,
    );
  }
  const frase = partes.join("; ");
  const registro = afetadas.length === 1 ? "desse pagamento" : "desses pagamentos";
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}. O registro ${registro} será perdido.`;
}

/** Valida que a soma das parcelas bate com o total da nota (regra de bloqueio). */
export function validarParcelas(
  parcelas: { valorCents: number }[],
  totalCents: number,
): { ok: boolean; diferencaCents: number } {
  const soma = parcelas.reduce((acc, p) => acc + p.valorCents, 0);
  return { ok: soma === totalCents, diferencaCents: soma - totalCents };
}
