/**
 * Lógica pura do formulário de NF: codec string↔centavos/bp, totais e
 * geração de parcelas/rateio. Extraído de `nota-form.tsx` para ser testável
 * sem renderizar React — o componente só monta esses dados e reage a eventos.
 *
 * As regras agregadas (rateio soma 100%, parcelas fecham com o total) sempre
 * delegam para `services/rateio` e `services/parcelas`: o formulário nunca
 * reimplementa a regra, só formata a mesma resposta que o servidor usa.
 */
import type { FormaPagto, TipoDocumento, TipoItem } from "@prisma/client";
import {
  centsParaEditavel,
  dataParaInput,
  inputParaData,
  moedaParaCents,
  percentBpParaEditavel,
  percentEditavelParaBp,
} from "@/lib/format";
import {
  gerarParcelas,
  reconciliarParcelas,
  validarParcelas,
  type ParcelaExistente,
} from "@/services/parcelas";
import { calcularTotalItem, dividirIgualmente, somaItens, validarRateio } from "@/services/rateio";
import type { NotaInput } from "@/schemas/nota";

export type ItemForm = {
  descricao: string;
  tipo: TipoItem;
  qtde: string;
  unidade: string;
  unit: string; // moeda BR
  desconto: string; // moeda BR
};

export type RateioForm = { obraId: string; etapaId: string; percent: string };
export type ParcelaForm = { numero: number; valor: string; vencimento: string };

export type NotaFormValues = {
  fornecedorId: string;
  tipoDocumento: TipoDocumento;
  numero: string;
  dataCompra: string;
  total: string; // moeda BR
  formaPagto: FormaPagto;
  numParcelas: string;
  obs: string;
  anexoUrl: string;
  anexoNome: string;
  itens: ItemForm[];
  rateios: RateioForm[];
  parcelas: ParcelaForm[];
};

export function parseQtde(s: string): number {
  return parseFloat(s.replace(",", ".")) || 0;
}

/** Percentual editável → bp, tolerando campo vazio/parcial durante a digitação. */
function percentFormParaBp(s: string): number {
  return percentEditavelParaBp(s) ?? 0;
}

export function totalItemForm(item: ItemForm): number {
  return calcularTotalItem(parseQtde(item.qtde), moedaParaCents(item.unit), moedaParaCents(item.desconto));
}

/** Soma dos itens do formulário — mesma fórmula que `salvarNota` usa para validar. */
export function somaItensForm(itens: ItemForm[]): number {
  return somaItens(
    itens.map((i) => ({
      qtde: parseQtde(i.qtde),
      unitCents: moedaParaCents(i.unit),
      descontoCents: moedaParaCents(i.desconto),
    })),
  );
}

/** Soma do rateio em bp, via `validarRateio` — mesma regra que bloqueia o salvamento. */
export function somaRateioForm(rateios: RateioForm[]): number {
  return validarRateio(rateios.map((r) => ({ fracaoBp: percentFormParaBp(r.percent) }))).somaBp;
}

/** Soma das parcelas, via `validarParcelas` — mesma regra que bloqueia o salvamento. */
export function somaParcelasForm(parcelas: ParcelaForm[], totalCents: number): number {
  const { diferencaCents } = validarParcelas(
    parcelas.map((p) => ({ valorCents: moedaParaCents(p.valor) })),
    totalCents,
  );
  return totalCents + diferencaCents;
}

/** null quando o total ainda não foi informado — o caller decide como avisar. */
export function gerarParcelasForm(opts: {
  totalCents: number;
  numParcelas: string;
  formaPagto: FormaPagto;
  dataCompra: string;
}): ParcelaForm[] | null {
  if (opts.totalCents <= 0) return null;
  const geradas = gerarParcelas({
    totalCents: opts.totalCents,
    numParcelas: Math.max(1, parseInt(opts.numParcelas) || 1),
    formaPagto: opts.formaPagto,
    dataCompra: inputParaData(opts.dataCompra),
  });
  return geradas.map((p) => ({
    numero: p.numero,
    valor: centsParaEditavel(p.valorCents),
    vencimento: dataParaInput(p.vencimento),
  }));
}

/** null quando há menos de 2 obras no rateio — o caller decide como avisar. */
export function dividirIgualmenteForm(rateios: RateioForm[]): RateioForm[] | null {
  if (rateios.length < 2) return null;
  const bps = dividirIgualmente(rateios.length);
  return rateios.map((r, i) => ({ ...r, percent: percentBpParaEditavel(bps[i]) }));
}

export function montarPayload(
  v: NotaFormValues,
  notaId: string | undefined,
  forcar: boolean,
): NotaInput {
  return {
    id: notaId,
    fornecedorId: v.fornecedorId,
    tipoDocumento: v.tipoDocumento,
    numero: v.numero.trim(),
    dataCompra: v.dataCompra,
    totalCents: moedaParaCents(v.total),
    formaPagto: v.formaPagto,
    obs: v.obs || undefined,
    anexoUrl: v.anexoUrl || undefined,
    anexoNome: v.anexoNome || undefined,
    itens: v.itens.map((i) => ({
      descricao: i.descricao,
      tipo: i.tipo,
      qtde: parseQtde(i.qtde),
      unidade: i.unidade,
      unitCents: moedaParaCents(i.unit),
      descontoCents: moedaParaCents(i.desconto),
    })),
    rateios: v.rateios.map((r) => ({
      obraId: r.obraId,
      etapaId: r.etapaId || undefined,
      fracaoBp: percentFormParaBp(r.percent),
    })),
    parcelas: v.parcelas.map((p) => ({
      numero: p.numero,
      valorCents: moedaParaCents(p.valor),
      vencimento: p.vencimento,
    })),
    forcar,
  };
}

/**
 * Tipo de item sugerido para as linhas em branco ao trocar o tipo de
 * documento: guia é imposto/taxa (encargo); recibo e folha costumam ser mão
 * de obra (serviço); NF e outro voltam ao padrão (material).
 */
export function tipoItemSugerido(tipo: TipoDocumento): TipoItem {
  switch (tipo) {
    case "GUIA":
      return "ENCARGO";
    case "RECIBO":
    case "FOLHA":
      return "SERVICO";
    default:
      return "MATERIAL";
  }
}

/**
 * Situação de cada parcela do formulário de edição em relação ao pagamento
 * já registrado, pela mesma regra que `salvarNota` aplica
 * (`reconciliarParcelas`):
 * - `paga`: continua paga ao salvar;
 * - `reabre`: estava paga, mas valor/vencimento mudou → volta a ficar em aberto.
 * Parcelas sem pagamento não aparecem no mapa. As pagas que o usuário
 * removeu vêm em `pagasRemovidas`.
 */
export function situacaoParcelasPagas(
  existentes: ParcelaExistente[],
  parcelas: ParcelaForm[],
): { porNumero: Map<number, "paga" | "reabre">; pagasRemovidas: number[] } {
  const porNumero = new Map<number, "paga" | "reabre">();
  if (!existentes.some((p) => p.status === "PAGA")) return { porNumero, pagasRemovidas: [] };

  let r;
  try {
    r = reconciliarParcelas(
      existentes,
      parcelas.map((p) => ({ numero: p.numero, valorCents: moedaParaCents(p.valor), vencimento: p.vencimento })),
    );
  } catch {
    return { porNumero, pagasRemovidas: [] }; // números repetidos: o servidor recusa ao salvar
  }
  for (const p of r.parcelas) if (p.status === "PAGA") porNumero.set(p.numero, "paga");
  const pagasRemovidas: number[] = [];
  for (const a of r.pagasAfetadas) {
    if (a.motivo === "alterada") porNumero.set(a.numero, "reabre");
    else pagasRemovidas.push(a.numero);
  }
  return { porNumero, pagasRemovidas };
}
