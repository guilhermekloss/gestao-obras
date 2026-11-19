import { describe, expect, it } from "vitest";
import { inputParaData } from "@/lib/format";
import { DESCRICAO_IBS_CBS_POR_FORA } from "../../nfe-xml";
import type { ClassificacaoParaCredito } from "../credito";
import {
  creditoDasCompras,
  crtMaisRecente,
  custoEfetivoPorFornecedor,
  inicioDoPeriodo,
  normalizarUnidade,
  regimeDoCrt,
  type CompraParaCusto,
  type ContextoCustoEfetivo,
} from "../custo-efetivo";

const classe: ClassificacaoParaCredito = {
  codigo: "000001",
  inicioVigencia: "2026-01-01",
  fimVigencia: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
};
const agora = inputParaData("2027-06-15");
const ctx = (extra: Partial<ContextoCustoEfetivo> = {}): ContextoCustoEfetivo => ({
  regimeEmpresa: "REGULAR",
  classificacoes: [classe],
  agora,
  ...extra,
});

let seq = 0;
function compra(extra: Partial<CompraParaCusto> & { creditoCents?: number } = {}): CompraParaCusto {
  const { creditoCents = 0, ...resto } = extra;
  return {
    notaId: `n${++seq}`,
    fornecedorId: "f1",
    fornecedorNome: "Alfa",
    unidade: "UN",
    qtde: 10,
    totalCents: 10_000,
    dataEmissao: "2027-03-10",
    crtEmitente: "3",
    item: { cClassTrib: creditoCents ? "000001" : null, cbsCents: creditoCents, ibsUfCents: 0, ibsMunCents: 0 },
    ...resto,
  };
}

describe("inicioDoPeriodo", () => {
  it("volta N meses e vira o ano", () => {
    expect(inicioDoPeriodo(inputParaData("2027-06-15"), 12)).toBe("2026-06-15");
    expect(inicioDoPeriodo(inputParaData("2027-01-10"), 12)).toBe("2026-01-10");
    expect(inicioDoPeriodo(inputParaData("2027-02-10"), 24)).toBe("2025-02-10");
  });

  it("dia 31 cai no último dia do mês menor, inclusive bissexto", () => {
    expect(inicioDoPeriodo(inputParaData("2027-03-31"), 1)).toBe("2027-02-28");
    expect(inicioDoPeriodo(inputParaData("2028-03-31"), 1)).toBe("2028-02-29");
    expect(inicioDoPeriodo(inputParaData("2027-12-31"), 6)).toBe("2027-06-30");
  });
});

describe("regimeDoCrt e normalizarUnidade", () => {
  it("CRT 1 e 2 são Simples, 3 normal, 4 MEI; o resto é não identificado", () => {
    expect(["1", "2", "3", "4"].map(regimeDoCrt)).toEqual(["SIMPLES", "SIMPLES", "NORMAL", "MEI"]);
    expect([null, undefined, "", "9"].map(regimeDoCrt)).toEqual(Array(4).fill("NAO_IDENTIFICADO"));
  });

  it("m², M2. e m2 são a mesma unidade; vazio vira UN", () => {
    expect(["m²", " M2. ", "m2"].map(normalizarUnidade)).toEqual(["M2", "M2", "M2"]);
    expect(normalizarUnidade("  ")).toBe("UN");
  });
});

describe("crtMaisRecente", () => {
  it("vale a nota mais recente que tem CRT válido; sem nenhuma, nulo", () => {
    expect(
      crtMaisRecente([
        { dataEmissao: "2027-01-01", crtEmitente: "1" },
        { dataEmissao: "2027-05-01", crtEmitente: "3" },
        { dataEmissao: "2027-06-01", crtEmitente: null },
        { dataEmissao: "2027-07-01", crtEmitente: "7" },
      ]),
    ).toBe("3");
    expect(crtMaisRecente([])).toBeNull();
  });
});

describe("custoEfetivoPorFornecedor", () => {
  it("o mais barato na nota pode ser o mais caro depois do crédito", () => {
    const [g] = custoEfetivoPorFornecedor(
      [
        // Simples: R$ 9,00/un, sem destaque
        compra({ fornecedorId: "s", fornecedorNome: "Simples SA", crtEmitente: "1", totalCents: 9_000 }),
        // Normal: R$ 10,00/un com R$ 2,00/un de crédito => 8,00
        compra({ fornecedorId: "n", fornecedorNome: "Normal SA", crtEmitente: "3", totalCents: 10_000, creditoCents: 2_000 }),
      ],
      ctx(),
    );
    expect(g.modo).toBe("EFETIVO");
    expect(g.fornecedores.map((f) => f.fornecedorId)).toEqual(["n", "s"]);
    expect(g.fornecedores[0]).toMatchObject({ regime: "NORMAL", brutoUnitCents: 1_000, creditoUnitCents: 200, efetivoUnitCents: 800 });
    expect(g.fornecedores[1]).toMatchObject({ regime: "SIMPLES", brutoUnitCents: 900, creditoUnitCents: 0, efetivoUnitCents: 900 });
    expect(g).toMatchObject({ maisBaratoBrutoId: "s", maisBaratoEfetivoId: "n", inversao: true, diferencaUnitCents: 100 });
  });

  it("sem inversão quando o mais barato no bruto continua o mais barato", () => {
    const [g] = custoEfetivoPorFornecedor(
      [compra({ fornecedorId: "a", totalCents: 8_000, creditoCents: 100 }), compra({ fornecedorId: "b", totalCents: 10_000, creditoCents: 500 })],
      ctx(),
    );
    expect(g).toMatchObject({ inversao: false, diferencaUnitCents: 0, maisBaratoBrutoId: "a", maisBaratoEfetivoId: "a" });
  });

  it("empate no bruto desempata pelo efetivo e não conta como inversão", () => {
    const [g] = custoEfetivoPorFornecedor(
      [compra({ fornecedorId: "a", fornecedorNome: "A", totalCents: 10_000 }), compra({ fornecedorId: "b", fornecedorNome: "B", totalCents: 10_000, creditoCents: 1_000 })],
      ctx(),
    );
    expect(g.fornecedores.map((f) => f.fornecedorId)).toEqual(["b", "a"]);
    expect(g.inversao).toBe(false);
  });

  it("empate total ordena por nome", () => {
    const [g] = custoEfetivoPorFornecedor(
      [compra({ fornecedorId: "z", fornecedorNome: "Zeta" }), compra({ fornecedorId: "a", fornecedorNome: "Alfa" })],
      ctx(),
    );
    expect(g.fornecedores.map((f) => f.fornecedorNome)).toEqual(["Alfa", "Zeta"]);
    expect(g.inversao).toBe(false);
  });

  it("preço médio é ponderado pela quantidade, não a média dos unitários", () => {
    const [g] = custoEfetivoPorFornecedor(
      [
        compra({ qtde: 1, totalCents: 1_000 }), // R$ 10,00/un
        compra({ qtde: 99, totalCents: 49_500 }), // R$ 5,00/un
      ],
      ctx(),
    );
    expect(g.fornecedores[0]).toMatchObject({ compras: 2, qtde: 100, gastoCents: 50_500, brutoUnitCents: 505 });
  });

  it("unidades diferentes ficam em grupos separados, o de mais compras primeiro", () => {
    const grupos = custoEfetivoPorFornecedor(
      [compra({ unidade: "M2" }), compra({ unidade: "UN" }), compra({ unidade: "un." }), compra({ unidade: "UN" })],
      ctx(),
    );
    expect(grupos.map((g) => [g.unidade, g.fornecedores[0].compras])).toEqual([
      ["UN", 3],
      ["M2", 1],
    ]);
  });

  it("antes de 2027 não há crédito e a comparação é nominal", () => {
    const [g] = custoEfetivoPorFornecedor(
      [
        compra({ fornecedorId: "s", dataEmissao: "2026-12-31", totalCents: 9_000 }),
        compra({ fornecedorId: "n", dataEmissao: "2026-11-01", totalCents: 10_000, creditoCents: 2_000 }),
      ],
      ctx({ agora: inputParaData("2026-12-31") }),
    );
    expect(g.modo).toBe("NOMINAL_PERIODO_TESTE");
    expect(g.fornecedores.every((f) => f.creditoUnitCents === 0 && f.efetivoUnitCents === f.brutoUnitCents)).toBe(true);
    expect(g.inversao).toBe(false);
    expect(g.fornecedores.find((f) => f.fornecedorId === "n")?.comprasAntesDoCredito).toBe(1);
  });

  it("uma compra de 2027 basta para o grupo voltar ao modo efetivo; 01/01/2027 já credita", () => {
    const [g] = custoEfetivoPorFornecedor(
      [compra({ dataEmissao: "2026-12-31" }), compra({ dataEmissao: "2027-01-01", creditoCents: 1_000 })],
      ctx(),
    );
    expect(g.modo).toBe("EFETIVO");
    expect(g.fornecedores[0]).toMatchObject({ compras: 2, comprasAntesDoCredito: 1, creditoCents: 1_000 });
  });

  it.each(["SIMPLES_NACIONAL", "NAO_INFORMADO"] as const)("empresa %s: efetivo igual ao bruto, sem inversão", (regimeEmpresa) => {
    const [g] = custoEfetivoPorFornecedor(
      [compra({ fornecedorId: "s", totalCents: 9_000 }), compra({ fornecedorId: "n", totalCents: 10_000, creditoCents: 2_000 })],
      ctx({ regimeEmpresa }),
    );
    expect(g.modo).toBe("SEM_CREDITO_REGIME");
    expect(g.fornecedores.map((f) => f.fornecedorId)).toEqual(["s", "n"]);
    expect(g.fornecedores.every((f) => f.creditoCents === 0 && f.efetivoUnitCents === f.brutoUnitCents)).toBe(true);
    expect(g.inversao).toBe(false);
  });

  it("fornecedor sem CRT (nota antiga ou manual) é não identificado", () => {
    const [g] = custoEfetivoPorFornecedor([compra({ crtEmitente: null })], ctx());
    expect(g.fornecedores[0]).toMatchObject({ regime: "NAO_IDENTIFICADO", crt: null });
  });

  it("o regime vem da nota mais recente com CRT; o mapa do banco prevalece sobre o período", () => {
    const compras = [
      compra({ dataEmissao: "2027-02-01", crtEmitente: "1" }),
      compra({ dataEmissao: "2027-05-01", crtEmitente: "3" }),
      compra({ dataEmissao: "2027-06-01", crtEmitente: null }),
    ];
    expect(custoEfetivoPorFornecedor(compras, ctx())[0].fornecedores[0].regime).toBe("NORMAL");
    expect(custoEfetivoPorFornecedor(compras, ctx({ crtPorFornecedor: new Map([["f1", "4"]]) }))[0].fornecedores[0].regime).toBe("MEI");
    expect(custoEfetivoPorFornecedor(compras, ctx({ crtPorFornecedor: new Map([["f1", null]]) }))[0].fornecedores[0].regime).toBe("NAO_IDENTIFICADO");
  });

  it("período: a compra do primeiro dia entra e a do dia anterior não", () => {
    const grupos = custoEfetivoPorFornecedor(
      [compra({ dataEmissao: "2026-06-15" }), compra({ dataEmissao: "2026-06-14", fornecedorId: "velho" })],
      ctx({ meses: 12 }),
    );
    expect(grupos[0].fornecedores.map((f) => f.fornecedorId)).toEqual(["f1"]);
    expect(custoEfetivoPorFornecedor([compra({ dataEmissao: "2026-06-14" })], ctx({ meses: 12 }))).toEqual([]);
    expect(custoEfetivoPorFornecedor([compra({ dataEmissao: "2026-06-14" })], ctx({ meses: 24 }))).toHaveLength(1);
  });

  it("sem compras, lista vazia; quantidade zero ou negativa é ignorada", () => {
    expect(custoEfetivoPorFornecedor([], ctx())).toEqual([]);
    expect(custoEfetivoPorFornecedor([compra({ qtde: 0 }), compra({ qtde: -1 })], ctx())).toEqual([]);
  });

  it("crédito maior que o total nunca gera custo negativo", () => {
    const [g] = custoEfetivoPorFornecedor([compra({ totalCents: 1_000, creditoCents: 5_000 })], ctx());
    expect(g.fornecedores[0]).toMatchObject({ efetivoUnitCents: 0, creditoUnitCents: 100, creditoCents: 1_000 });
  });

  it("classificação desconhecida zera o crédito e é contada para a tela avisar", () => {
    const [g] = custoEfetivoPorFornecedor([compra({ creditoCents: 1_000 })], ctx({ classificacoes: [] }));
    expect(g.fornecedores[0]).toMatchObject({ creditoCents: 0, itensClassificacaoPendente: 1 });
  });

  it("crédito igual ao bruto no arredondamento: efetivo = bruto − crédito por unidade", () => {
    const [g] = custoEfetivoPorFornecedor([compra({ qtde: 3, totalCents: 1_000, creditoCents: 100 })], ctx());
    const f = g.fornecedores[0];
    expect(f.brutoUnitCents - f.creditoUnitCents).toBe(f.efetivoUnitCents);
    expect(f).toMatchObject({ brutoUnitCents: 333, efetivoUnitCents: 300 });
  });

  it("conta notas distintas, não itens, e guarda a última compra", () => {
    const [g] = custoEfetivoPorFornecedor(
      [compra({ notaId: "x", dataEmissao: "2027-02-01" }), compra({ notaId: "x", dataEmissao: "2027-02-01" }), compra({ notaId: "y", dataEmissao: "2027-04-01" })],
      ctx(),
    );
    expect(g.fornecedores[0]).toMatchObject({ compras: 2, ultimaCompra: "2027-04-01" });
  });
});

describe("IBS/CBS por fora", () => {
  // mesmo preço nominal (R$ 100,00 por 10 un) e mesmo CBS de R$ 10,00: no A ele vem por fora, no B embutido
  const a = () => compra({ fornecedorId: "a", fornecedorNome: "A", creditoCents: 1_000, ibsCbsPorFora: true });
  const b = () => compra({ fornecedorId: "b", fornecedorNome: "B", creditoCents: 1_000 });

  it("por fora, o imposto soma ao bruto e o crédito o devolve: efetivo = preço nominal, e o embutido sai mais barato", () => {
    const [g] = custoEfetivoPorFornecedor([a(), b()], ctx());
    const [fa, fb] = ["a", "b"].map((id) => g.fornecedores.find((f) => f.fornecedorId === id)!);
    expect(fa).toMatchObject({ gastoCents: 11_000, creditoCents: 1_000, brutoUnitCents: 1_100, creditoUnitCents: 100, efetivoUnitCents: 1_000 });
    expect(fb).toMatchObject({ gastoCents: 10_000, creditoCents: 1_000, brutoUnitCents: 1_000, creditoUnitCents: 100, efetivoUnitCents: 900 });
    expect(g.maisBaratoEfetivoId).toBe("b");
  });
  it("a linha acessória do imposto não conta no crédito do fornecedor (o valor já está no produto)", () => {
    const acessorio = compra({ fornecedorId: "a", descricao: DESCRICAO_IBS_CBS_POR_FORA, qtde: 1, totalCents: 1_000, ibsCbsPorFora: true });
    expect(creditoDasCompras([{ ...a(), notaId: "n" }, { ...acessorio, notaId: "n" }], ctx())).toMatchObject({ gastoCents: 11_000, creditoCents: 1_000 });
  });
});

describe("creditoDasCompras", () => {
  it("soma o crédito do período e avisa quando é tudo de antes de 2027", () => {
    const r = creditoDasCompras([compra({ creditoCents: 700 }), compra({ creditoCents: 300 }), compra({ dataEmissao: "2025-01-01", creditoCents: 900 })], ctx());
    expect(r).toMatchObject({ creditoCents: 1_000, gastoCents: 20_000, compras: 2, modo: "EFETIVO" });
    expect(creditoDasCompras([compra({ dataEmissao: "2026-12-31", creditoCents: 500 })], ctx({ agora: inputParaData("2026-12-31") }))).toMatchObject({
      creditoCents: 0,
      comprasAntesDoCredito: 1,
      modo: "NOMINAL_PERIODO_TESTE",
    });
  });

  it("sem compras no período: zero, modo efetivo; empresa fora do regular: sem crédito", () => {
    expect(creditoDasCompras([], ctx())).toMatchObject({ creditoCents: 0, compras: 0, modo: "EFETIVO" });
    expect(creditoDasCompras([compra({ creditoCents: 500 })], ctx({ regimeEmpresa: "SIMPLES_NACIONAL" }))).toMatchObject({ creditoCents: 0, modo: "SEM_CREDITO_REGIME" });
  });
});
