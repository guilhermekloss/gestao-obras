import { addDays, startOfDay } from "date-fns";
import type { FormaPagto, TipoDocumento } from "@prisma/client";
import { chaveMes } from "@/lib/format";
import { custoRateado } from "./rateio";

type ParcelaComRateio = {
  valorCents: number;
  vencimento: Date;
  rateios: { obraId: string; fracaoBp: number }[];
};

type FluxoMensal = {
  meses: string[];
  obras: string[];
  valores: Record<string, Record<string, number>>;
  totalPorMes: Record<string, number>;
  totalPorObra: Record<string, number>;
};

// Janela do card "A vencer em 7 dias" e da visão de mesmo nome em Contas: as duas contam as mesmas parcelas.
export function proximosDias(hoje: Date, dias = 7): { de: Date; ate: Date } {
  return { de: startOfDay(hoje), ate: addDays(hoje, dias) };
}

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

export const TIPOS_DOCUMENTO = ["NF", "RECIBO", "FOLHA", "GUIA", "OUTRO"] as const satisfies readonly TipoDocumento[];

export const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  NF: "Nota fiscal",
  RECIBO: "Recibo",
  FOLHA: "Folha de pagamento",
  GUIA: "Guia/imposto",
  OUTRO: "Outro",
};

export const TIPO_DOCUMENTO_BADGE: Record<TipoDocumento, string> = {
  NF: "NF",
  RECIBO: "Recibo",
  FOLHA: "Folha",
  GUIA: "Guia",
  OUTRO: "Outro",
};

export const FORMA_PAGTO_LABELS: Record<FormaPagto, string> = {
  PIX: "PIX",
  CARTAO: "Cartão",
  DEBITO: "Débito",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  DINHEIRO: "Dinheiro",
};

export const PREFIXO_DOCUMENTO: Record<Exclude<TipoDocumento, "NF">, string> = {
  RECIBO: "REC",
  FOLHA: "FOL",
  GUIA: "GUIA",
  OUTRO: "DOC",
};

export function exigeNumero(tipo: TipoDocumento): tipo is "NF" {
  return tipo === "NF";
}

export function parseTipoDocumento(valor: string | undefined): TipoDocumento | undefined {
  return TIPOS_DOCUMENTO.find((t) => t === valor);
}

// Maior número + 1 (não a contagem): excluir um do meio não repete número em uso.
// Por fornecedor porque a unicidade no banco é (fornecedorId, numero).
export function gerarNumeroDocumento(
  tipo: Exclude<TipoDocumento, "NF">,
  numerosDoFornecedor: string[],
): string {
  const prefixo = PREFIXO_DOCUMENTO[tipo];
  const padrao = new RegExp(`^${prefixo}-(\\d+)$`);
  let maior = 0;
  for (const numero of numerosDoFornecedor) {
    const m = padrao.exec(numero.trim());
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  }
  return `${prefixo}-${String(maior + 1).padStart(4, "0")}`;
}

export type SituacaoFluxo = "aberta" | "paga" | "todas";

export function parseSituacaoFluxo(valor: string | undefined): SituacaoFluxo {
  return valor === "aberta" || valor === "paga" ? valor : "todas";
}
