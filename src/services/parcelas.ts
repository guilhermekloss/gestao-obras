import { addMonths, setDate, lastDayOfMonth } from "date-fns";
import type { FormaPagto, StatusParcela } from "@prisma/client";

type ParcelaGerada = {
  numero: number;
  valorCents: number;
  vencimento: Date;
};

// A diferença do arredondamento vai para a primeira parcela.
export function dividirValor(totalCents: number, n: number): number[] {
  if (n < 1) throw new Error("Número de parcelas deve ser ≥ 1");
  const base = Math.floor(totalCents / n);
  const resto = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

function dia20MesSeguinte(data: Date): Date {
  return setDate(addMonths(data, 1), 20);
}

function mesSeguinte(data: Date, meses: number): Date {
  const alvo = addMonths(data, meses);
  const ultimo = lastDayOfMonth(alvo).getDate();
  return alvo.getDate() > ultimo ? setDate(alvo, ultimo) : alvo;
}

// PIX/débito/dinheiro: 1 parcela na compra. Transferência: 1ª na compra; cartão: 1ª no dia 20 do mês
// seguinte; boleto: 1ª no mês seguinte — as demais, mês a mês.
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

export type ParcelaExistente = {
  numero: number;
  valorCents: number;
  vencimento: string;
  status: StatusParcela;
  pagaEm: Date | null;
};

type ParcelaEditada = {
  numero: number;
  valorCents: number;
  vencimento: string;
};

type AcaoParcela = "manter" | "atualizar" | "criar";

type ParcelaReconciliada = ParcelaEditada & {
  acao: AcaoParcela;
  status: StatusParcela;
  pagaEm: Date | null;
};

type ParcelaPagaAfetada = { numero: number; motivo: "alterada" | "removida" };

type ReconciliacaoParcelas = {
  parcelas: ParcelaReconciliada[];
  removidas: number[];
  pagasAfetadas: ParcelaPagaAfetada[];
};

// Casa por `numero`; parcela com valor ou vencimento alterado volta a ABERTA (o pagamento era de outro valor/data).
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

export function validarParcelas(
  parcelas: { valorCents: number }[],
  totalCents: number,
): { ok: boolean; diferencaCents: number } {
  const soma = parcelas.reduce((acc, p) => acc + p.valorCents, 0);
  return { ok: soma === totalCents, diferencaCents: soma - totalCents };
}
