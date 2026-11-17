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
  valoresDaLeitura,
  valoresDoHabito,
  type HabitoFornecedor,
  type ItemForm,
  type NotaFormValues,
  type ParcelaForm,
  type RateioForm,
} from "../nota-form-model";
import type { LeituraNormalizada } from "@/services/leitura-documento";

const ITEM: ItemForm = {
  materialId: "",
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
    expect(totalItemForm(ITEM)).toBe(120000);
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
      numParcelas: "3",
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
      itens: [{ materialId: undefined, descricao: "Cimento", qtde: 40, unitCents: 3000, descontoCents: 0 }],
      rateios: [{ obraId: "obra-1", etapaId: undefined, fracaoBp: 10000 }],
      parcelas: [{ numero: 1, valorCents: 120000, vencimento: "2026-01-15" }],
      forcar: false,
    });
  });

  it("leva o material escolhido no item; sem material, o item vai avulso", () => {
    const payload = montarPayload(
      { ...valores, itens: [{ ...ITEM, materialId: "mat-1" }, ITEM] },
      undefined,
      false,
    );
    expect(payload.itens[0].materialId).toBe("mat-1");
    expect(payload.itens[1].materialId).toBeUndefined();
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
    expect(porNumero.has(3)).toBe(false);
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

describe("valoresDaLeitura", () => {
  const leitura: LeituraNormalizada = {
    tipoDocumento: "NF",
    descricaoDocumento: "NF-e (DANFE)",
    fornecedor: { nome: "Casa do Construtor", documento: "11222333000181", documentoLido: "11222333000181", fone: null },
    destinatario: { nome: null, documento: null, documentoLido: null },
    numero: "12345",
    serie: "1",
    chaveNfe: "35260911222333000181550010000123451876543218",
    dataEmissao: "2026-09-15",
    cno: null,
    totalCents: 15050,
    formaPagto: "PIX",
    itens: [
      { descricao: "Cimento", tipo: "MATERIAL", qtde: 3, unidade: "SC", unitCents: 5017, descontoCents: 1, totalCents: 15050 },
    ],
    parcelas: [],
    avisos: [],
  };
  const opts = { fornecedorId: "f1", anexoUrl: "/api/fotos/a.jpg", anexoNome: "nota.jpg", hoje: "2026-10-14" };

  it("liga cada item ao material na mesma ordem; sem lista, os itens ficam avulsos", () => {
    const duas = { ...leitura, itens: [leitura.itens[0], { ...leitura.itens[0], descricao: "Areia" }] };
    const v = valoresDaLeitura(duas, { ...opts, materialIds: ["mat-1", ""] });
    expect(v.itens?.map((i) => i.materialId)).toEqual(["mat-1", ""]);
    expect(valoresDaLeitura(duas, opts).itens?.map((i) => i.materialId)).toEqual(["", ""]);
  });

  it("preenche cabeçalho, itens e anexo; o payload fecha com o total", () => {
    const v = valoresDaLeitura(leitura, opts);
    expect(v).toMatchObject({
      fornecedorId: "f1",
      tipoDocumento: "NF",
      numero: "12345",
      dataCompra: "2026-09-15",
      total: "150,50",
      obs: "Série 1",
      anexoUrl: "/api/fotos/a.jpg",
      anexoNome: "nota.jpg",
      chaveNfe: leitura.chaveNfe,
    });
    expect(v.itens).toEqual([
      { materialId: "", descricao: "Cimento", tipo: "MATERIAL", qtde: "3", unidade: "SC", unit: "50,17", desconto: "0,01" },
    ]);
    expect(somaItensForm(v.itens!)).toBe(15050);
    expect(v.parcelas).toEqual([{ numero: 1, valor: "150,50", vencimento: "2026-09-15" }]);
  });

  it("usa as parcelas lidas quando existem", () => {
    const v = valoresDaLeitura(
      {
        ...leitura,
        formaPagto: "BOLETO",
        parcelas: [
          { numero: 1, valorCents: 7525, vencimento: "2026-10-15" },
          { numero: 2, valorCents: 7525, vencimento: "2026-11-15" },
        ],
      },
      opts,
    );
    expect(v.numParcelas).toBe("2");
    expect(v.parcelas?.map((p) => p.valor)).toEqual(["75,25", "75,25"]);
  });

  it("sem data lida usa hoje; chave só vai no payload de criação", () => {
    const v = valoresDaLeitura({ ...leitura, dataEmissao: null }, opts);
    expect(v.dataCompra).toBe("2026-10-14");
    const valores = { ...(v as NotaFormValues), rateios: [] };
    expect(montarPayload(valores, undefined, false).chaveNfe).toBe(leitura.chaveNfe);
    expect(montarPayload(valores, "nota-1", false).chaveNfe).toBeUndefined();
  });
});

describe("valoresDoHabito", () => {
  const OBRAS = [
    { id: "o1", etapas: [{ id: "e1" }] },
    { id: "o2", etapas: [] },
  ];
  const HABITO: HabitoFornecedor = {
    numero: "1005",
    tipoDocumento: "RECIBO",
    dataCompra: "2026-10-21",
    formaPagto: "BOLETO",
    numParcelas: 2,
    rateios: [
      { obraId: "o1", etapaId: "e1", fracaoBp: 6000 },
      { obraId: "o2", etapaId: "sumiu", fracaoBp: 4000 },
    ],
  };
  const LIVRE = { tipoDocumento: true, pagamento: true, rateio: true };

  it("repete tipo, pagamento e rateio; etapa que não existe mais vira sem etapa", () => {
    expect(valoresDoHabito(HABITO, OBRAS, LIVRE)).toEqual({
      tipoDocumento: "RECIBO",
      formaPagto: "BOLETO",
      numParcelas: "2",
      rateios: [
        { obraId: "o1", etapaId: "e1", percent: "60,00" },
        { obraId: "o2", etapaId: "", percent: "40,00" },
      ],
    });
  });

  it("não passa por cima do que já foi definido", () => {
    expect(valoresDoHabito(HABITO, OBRAS, { tipoDocumento: false, pagamento: false, rateio: false })).toEqual({});
    expect(Object.keys(valoresDoHabito(HABITO, OBRAS, { ...LIVRE, rateio: false }))).toEqual([
      "tipoDocumento",
      "formaPagto",
      "numParcelas",
    ]);
  });

  it("deixa o rateio como está quando uma das obras não está mais disponível", () => {
    expect(valoresDoHabito(HABITO, [OBRAS[0]], LIVRE).rateios).toBeUndefined();
  });

  it("limita as parcelas ao que o formulário oferece", () => {
    expect(valoresDoHabito({ ...HABITO, numParcelas: 12 }, OBRAS, LIVRE).numParcelas).toBe("6");
    expect(valoresDoHabito({ ...HABITO, numParcelas: 0 }, OBRAS, LIVRE).numParcelas).toBe("1");
  });
});
