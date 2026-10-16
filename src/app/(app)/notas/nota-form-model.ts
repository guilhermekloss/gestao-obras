// regras de rateio/parcelas vêm de services/ (as mesmas do servidor): não reimplementar aqui
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
import type { LeituraNormalizada } from "@/services/leitura-documento";

export type ItemForm = {
  /** Material do catálogo ("" = item avulso, sem material). */
  materialId: string;
  descricao: string;
  tipo: TipoItem;
  qtde: string;
  unidade: string;
  unit: string;
  desconto: string;
};

export type RateioForm = { obraId: string; etapaId: string; percent: string };
export type ParcelaForm = { numero: number; valor: string; vencimento: string };

export type NotaFormValues = {
  fornecedorId: string;
  tipoDocumento: TipoDocumento;
  numero: string;
  dataCompra: string;
  total: string;
  formaPagto: FormaPagto;
  numParcelas: string;
  obs: string;
  anexoUrl: string;
  anexoNome: string;
  chaveNfe?: string;
  itens: ItemForm[];
  rateios: RateioForm[];
  parcelas: ParcelaForm[];
};

export function parseQtde(s: string): number {
  return parseFloat(s.replace(",", ".")) || 0;
}

function percentFormParaBp(s: string): number {
  return percentEditavelParaBp(s) ?? 0;
}

export function totalItemForm(item: ItemForm): number {
  return calcularTotalItem(parseQtde(item.qtde), moedaParaCents(item.unit), moedaParaCents(item.desconto));
}

export function somaItensForm(itens: ItemForm[]): number {
  return somaItens(
    itens.map((i) => ({
      qtde: parseQtde(i.qtde),
      unitCents: moedaParaCents(i.unit),
      descontoCents: moedaParaCents(i.desconto),
    })),
  );
}

export function somaRateioForm(rateios: RateioForm[]): number {
  return validarRateio(rateios.map((r) => ({ fracaoBp: percentFormParaBp(r.percent) }))).somaBp;
}

export function somaParcelasForm(parcelas: ParcelaForm[], totalCents: number): number {
  const { diferencaCents } = validarParcelas(
    parcelas.map((p) => ({ valorCents: moedaParaCents(p.valor) })),
    totalCents,
  );
  return totalCents + diferencaCents;
}

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
    chaveNfe: notaId ? undefined : v.chaveNfe || undefined,
    itens: v.itens.map((i) => ({
      materialId: i.materialId || undefined,
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

// parcela paga com valor/vencimento alterado reabre ao salvar (mesma regra de salvarNota)
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

export function valoresDaLeitura(
  leitura: LeituraNormalizada,
  // materialIds: um por item da leitura ("" = sem material), na mesma ordem
  opts: { fornecedorId: string; anexoUrl: string; anexoNome: string; hoje: string; materialIds?: string[] },
): Partial<NotaFormValues> {
  const dataCompra = leitura.dataEmissao ?? opts.hoje;
  const parcelas: ParcelaForm[] =
    leitura.parcelas.length > 0
      ? leitura.parcelas.map((p) => ({
          numero: p.numero,
          valor: centsParaEditavel(p.valorCents),
          vencimento: p.vencimento,
        }))
      : (gerarParcelasForm({
          totalCents: leitura.totalCents,
          numParcelas: "1",
          formaPagto: leitura.formaPagto,
          dataCompra,
        }) ?? []);

  return {
    fornecedorId: opts.fornecedorId,
    tipoDocumento: leitura.tipoDocumento,
    numero: leitura.numero,
    dataCompra,
    total: leitura.totalCents > 0 ? centsParaEditavel(leitura.totalCents) : "",
    formaPagto: leitura.formaPagto,
    numParcelas: String(Math.min(6, Math.max(1, parcelas.length))),
    obs: leitura.serie ? `Série ${leitura.serie}` : "",
    anexoUrl: opts.anexoUrl,
    anexoNome: opts.anexoNome,
    chaveNfe: leitura.chaveNfe ?? "",
    itens: leitura.itens.map((i, idx) => ({
      materialId: opts.materialIds?.[idx] ?? "",
      descricao: i.descricao,
      tipo: i.tipo,
      qtde: String(i.qtde).replace(".", ","),
      unidade: i.unidade,
      unit: centsParaEditavel(i.unitCents),
      desconto: i.descontoCents ? centsParaEditavel(i.descontoCents) : "",
    })),
    parcelas,
  };
}
