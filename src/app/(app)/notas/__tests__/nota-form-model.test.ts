import { describe, expect, it } from "vitest";
import {
  dividirIgualmenteForm,
  gerarParcelasForm,
  montarPayload,
  parseQtde,
  situacaoParcelasPagas,
  somaItensForm,
  somaParcelasForm,
  somaRateioForm,
  tipoItemSugerido,
  totalItemForm,
  type ItemForm,
  type NotaFormValues,
  type ParcelaForm,
  type RateioForm,
} from "../nota-form-model";

const ITEM: ItemForm = {
  descricao: "Cimento",
  tipo: "MATERIAL",
  qtde: "40",
  unidade: "SC",
  unit: "30,00",
  desconto: "",
};

describe("parseQtde", () => {
  it("aceita vírgula decimal", () => {
    expect(parseQtde("2,5")).toBe(2.5);
  });
  it("trata inválido como 0 (tolera digitação parcial)", () => {
    expect(parseQtde("")).toBe(0);
    expect(parseQtde("abc")).toBe(0);
  });
});

describe("totalItemForm / somaItensForm", () => {
  it("calcula o total de um item (qtde × unitário − desconto)", () => {
    expect(totalItemForm(ITEM)).toBe(120000); // 40 × R$30,00 = R$1.200,00
  });

  it("soma vários itens, mesma fórmula usada no servidor", () => {
    const itens: ItemForm[] = [ITEM, { ...ITEM, qtde: "1", unit: "200,00" }];
    expect(somaItensForm(itens)).toBe(120000 + 20000);
  });
});

describe("somaRateioForm", () => {
  it("soma os percentuais em bp via validarRateio", () => {
    const rateios: RateioForm[] = [
      { obraId: "a", etapaId: "", percent: "60" },
      { obraId: "b", etapaId: "", percent: "40" },
    ];
    expect(somaRateioForm(rateios)).toBe(10000);
  });

  it("não soma 100% quando incompleto", () => {
    const rateios: RateioForm[] = [{ obraId: "a", etapaId: "", percent: "60" }];
    expect(somaRateioForm(rateios)).toBe(6000);
  });
});

describe("somaParcelasForm", () => {
  it("soma as parcelas via validarParcelas (round-trip com diferencaCents)", () => {
    const parcelas: ParcelaForm[] = [
      { numero: 1, valor: "600,00", vencimento: "2026-01-20" },
      { numero: 2, valor: "600,00", vencimento: "2026-02-20" },
    ];
    expect(somaParcelasForm(parcelas, 120000)).toBe(120000);
  });

  it("reflete divergência da soma real", () => {
    const parcelas: ParcelaForm[] = [{ numero: 1, valor: "500,00", vencimento: "2026-01-20" }];
    expect(somaParcelasForm(parcelas, 120000)).toBe(50000);
  });
});

describe("gerarParcelasForm", () => {
  it("retorna null quando o total ainda não foi informado", () => {
    expect(gerarParcelasForm({ totalCents: 0, numParcelas: "1", formaPagto: "PIX", dataCompra: "2026-01-15" })).toBeNull();
  });

  it("gera parcelas PIX à vista na data da compra", () => {
    const parcelas = gerarParcelasForm({
      totalCents: 120000,
      numParcelas: "3", // ignorado — PIX é sempre 1x
      formaPagto: "PIX",
      dataCompra: "2026-01-15",
    });
    expect(parcelas).toEqual([{ numero: 1, valor: "1200,00", vencimento: "2026-01-15" }]);
  });

  it("gera parcelas de cartão no dia 20 do mês seguinte, mantendo o total", () => {
    const parcelas = gerarParcelasForm({
      totalCents: 120000,
      numParcelas: "3",
      formaPagto: "CARTAO",
      dataCompra: "2026-01-15",
    });
    expect(parcelas).toHaveLength(3);
    expect(parcelas![0].vencimento).toBe("2026-02-20");
    const somaCents = parcelas!.reduce((a, p) => a + Math.round(parseFloat(p.valor.replace(",", ".")) * 100), 0);
    expect(somaCents).toBe(120000);
  });
});

describe("dividirIgualmenteForm", () => {
  it("retorna null com menos de 2 obras", () => {
    const rateios: RateioForm[] = [{ obraId: "a", etapaId: "", percent: "100" }];
    expect(dividirIgualmenteForm(rateios)).toBeNull();
  });

  it("divide 100% entre as obras, resto na primeira", () => {
    const rateios: RateioForm[] = [
      { obraId: "a", etapaId: "", percent: "" },
      { obraId: "b", etapaId: "", percent: "" },
      { obraId: "c", etapaId: "", percent: "" },
    ];
    const divididos = dividirIgualmenteForm(rateios);
    expect(divididos!.map((r) => r.percent)).toEqual(["33,34", "33,33", "33,33"]);
  });

  it("o round-trip bp → string → bp não perde precisão (soma continua 100%)", () => {
    const rateios: RateioForm[] = [
      { obraId: "a", etapaId: "", percent: "" },
      { obraId: "b", etapaId: "", percent: "" },
      { obraId: "c", etapaId: "", percent: "" },
    ];
    const divididos = dividirIgualmenteForm(rateios)!;
    expect(somaRateioForm(divididos)).toBe(10000);
  });
});

describe("montarPayload", () => {
  const valores: NotaFormValues = {
    fornecedorId: "forn-1",
    tipoDocumento: "NF",
    numero: "100",
    dataCompra: "2026-01-15",
    total: "1200,00",
    formaPagto: "PIX",
    numParcelas: "1",
    obs: "",
    anexoUrl: "",
    anexoNome: "",
    itens: [ITEM],
    rateios: [{ obraId: "obra-1", etapaId: "", percent: "100" }],
    parcelas: [{ numero: 1, valor: "1200,00", vencimento: "2026-01-15" }],
  };

  it("monta o payload no formato NotaInput, convertendo os campos BR", () => {
    const payload = montarPayload(valores, undefined, false);
    expect(payload).toMatchObject({
      id: undefined,
      fornecedorId: "forn-1",
      numero: "100",
      totalCents: 120000,
      itens: [{ descricao: "Cimento", qtde: 40, unitCents: 3000, descontoCents: 0 }],
      rateios: [{ obraId: "obra-1", etapaId: undefined, fracaoBp: 10000 }],
      parcelas: [{ numero: 1, valorCents: 120000, vencimento: "2026-01-15" }],
      forcar: false,
    });
  });

  it("inclui o id e forcar=true ao reenviar após um aviso", () => {
    const payload = montarPayload(valores, "nota-1", true);
    expect(payload.id).toBe("nota-1");
    expect(payload.forcar).toBe(true);
  });

  it("etapaId vazio vira undefined (não bloqueado a uma etapa)", () => {
    const payload = montarPayload(
      { ...valores, rateios: [{ obraId: "obra-1", etapaId: "etapa-x", percent: "100" }] },
      undefined,
      false,
    );
    expect(payload.rateios[0].etapaId).toBe("etapa-x");
  });

  it("envia o tipo de documento e o número sem espaços nas pontas", () => {
    const payload = montarPayload({ ...valores, tipoDocumento: "RECIBO", numero: "  " }, undefined, false);
    expect(payload.tipoDocumento).toBe("RECIBO");
    expect(payload.numero).toBe("");
  });
});

describe("tipoItemSugerido", () => {
  it("guia vira encargo; recibo e folha viram serviço; NF e outro, material", () => {
    expect(tipoItemSugerido("GUIA")).toBe("ENCARGO");
    expect(tipoItemSugerido("RECIBO")).toBe("SERVICO");
    expect(tipoItemSugerido("FOLHA")).toBe("SERVICO");
    expect(tipoItemSugerido("NF")).toBe("MATERIAL");
    expect(tipoItemSugerido("OUTRO")).toBe("MATERIAL");
  });
});

describe("situacaoParcelasPagas", () => {
  const pagaEm = new Date(2026, 1, 10);
  const existentes = [
    { numero: 1, valorCents: 50000, vencimento: "2026-02-15", status: "PAGA" as const, pagaEm },
    { numero: 2, valorCents: 50000, vencimento: "2026-03-15", status: "PAGA" as const, pagaEm },
    { numero: 3, valorCents: 50000, vencimento: "2026-04-15", status: "ABERTA" as const, pagaEm: null },
  ];
  const parcela = (numero: number, valor: string, vencimento: string): ParcelaForm => ({ numero, valor, vencimento });

  it("marca como paga a parcela sem mudança e como 'reabre' a paga alterada", () => {
    const { porNumero, pagasRemovidas } = situacaoParcelasPagas(existentes, [
      parcela(1, "500,00", "2026-02-15"),
      parcela(2, "600,00", "2026-03-15"),
      parcela(3, "400,00", "2026-04-15"),
    ]);
    expect(porNumero.get(1)).toBe("paga");
    expect(porNumero.get(2)).toBe("reabre");
    expect(porNumero.has(3)).toBe(false); // aberta não aparece
    expect(pagasRemovidas).toEqual([]);
  });

  it("lista as pagas removidas", () => {
    const { pagasRemovidas } = situacaoParcelasPagas(existentes, [parcela(1, "1500,00", "2026-02-15")]);
    expect(pagasRemovidas).toEqual([2]);
  });

  it("sem parcelas pagas (ou lançamento novo) não marca nada", () => {
    const { porNumero } = situacaoParcelasPagas([], [parcela(1, "500,00", "2026-02-15")]);
    expect(porNumero.size).toBe(0);
  });
});
