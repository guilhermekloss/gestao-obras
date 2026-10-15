import type { FormaPagto, TipoDocumento } from "@prisma/client";
import { custoRateado } from "./rateio";

type ParcelaComRateio = {
  valorCents: number;
  vencimento: Date;
  rateios: { obraId: string; fracaoBp: number }[];
};

type FluxoMensal = {
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

// ---------------------------------------------------------------------------
// Tipo de documento do lançamento (NF, recibo, folha, guia, outro)
// ---------------------------------------------------------------------------

export const TIPOS_DOCUMENTO = ["NF", "RECIBO", "FOLHA", "GUIA", "OUTRO"] as const satisfies readonly TipoDocumento[];

/** Rótulo completo, usado no formulário e nos filtros. */
export const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  NF: "Nota fiscal",
  RECIBO: "Recibo",
  FOLHA: "Folha de pagamento",
  GUIA: "Guia/imposto",
  OUTRO: "Outro",
};

/** Rótulo curto, usado no badge das listagens. */
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

/** Prefixo do número gerado automaticamente para documentos sem numeração própria. */
export const PREFIXO_DOCUMENTO: Record<Exclude<TipoDocumento, "NF">, string> = {
  RECIBO: "REC",
  FOLHA: "FOL",
  GUIA: "GUIA",
  OUTRO: "DOC",
};

/** Só a NF tem número próprio obrigatório; os demais tipos podem ter número gerado. */
export function exigeNumero(tipo: TipoDocumento): tipo is "NF" {
  return tipo === "NF";
}

/** Interpreta um valor de filtro (`?tipo=`): inválido ou vazio vira `undefined` (sem filtro). */
export function parseTipoDocumento(valor: string | undefined): TipoDocumento | undefined {
  return TIPOS_DOCUMENTO.find((t) => t === valor);
}

/**
 * Gera o próximo número de um documento sem numeração própria, no formato
 * `<PREFIXO>-0001`, sequencial por fornecedor e por tipo.
 *
 * `numerosDoFornecedor` são os números já usados pelo mesmo fornecedor (de
 * qualquer tipo; os que não seguem o padrão do prefixo são ignorados). A
 * sequência parte do MAIOR número existente + 1, não da contagem: assim a
 * exclusão de um lançamento no meio da sequência não faz o próximo repetir um
 * número ainda em uso. É por fornecedor porque a unicidade no banco é
 * `(fornecedorId, numero)`: o número gerado nunca colide com outro lançamento.
 */
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
