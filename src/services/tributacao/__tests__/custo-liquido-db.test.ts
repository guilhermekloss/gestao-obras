import { beforeEach, describe, expect, it, vi } from "vitest";

const notaFindMany = vi.fn();
const classificacaoFindMany = vi.fn();
// o regime vem de carregarEmpresa (empresa.ts), que lê por aqui
const empresaFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notaFiscal: { findMany: notaFindMany },
    classificacaoTributaria: { findMany: classificacaoFindMany },
    empresa: { findUnique: empresaFindUnique },
  },
}));

const { carregarContextoCredito, carregarCreditoIbsCbs, carregarModoDoCusto, liquidarItensDasNotas } = await import("../custo-liquido-db");
const { esquecerClassificacoes } = await import("../classificacao-db");

const linhaClassificacao = {
  codigo: "000001",
  inicioVigencia: new Date("2026-01-01T00:00:00Z"),
  fimVigencia: null,
  cst: "000",
  descricaoCst: "Tributação integral",
  descricao: "Situações tributadas integralmente",
  tipoAliquota: "Padrão",
  nomenclatura: null,
  pRedCbs: null,
  pRedIbs: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
  creditoPresumidoFornecedor: false,
  indEstornoCredito: false,
  indCreditoPresumidoOperacao: false,
  creditoOperacaoAntecedente: null,
  indReducao: false,
  indDiferimento: false,
};

const itemDb = { totalCents: 100_000, cClassTrib: "000001", cbsCents: 9_000, ibsUfCents: 1_000, ibsMunCents: 0 };
const notaDb = (dataCompra: Date, rateios: { obraId: string; etapaId: string | null; fracaoBp: number }[]) => ({ dataCompra, itens: [itemDb], rateios });

beforeEach(() => {
  vi.clearAllMocks();
  esquecerClassificacoes();
  empresaFindUnique.mockResolvedValue({ regimeIbsCbs: "REGULAR" });
  classificacaoFindMany.mockResolvedValue([linhaClassificacao]);
});

describe("carregarCreditoIbsCbs", () => {
  it("sem obra: da leitura de notas do dashboard (notasParaAnalise), filtrando em memória as de 2026 em diante com destaque", async () => {
    const semDestaque = { ...itemDb, cbsCents: 0, ibsUfCents: null, ibsMunCents: 0 };
    notaFindMany.mockResolvedValue([
      notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }]),
      notaDb(new Date(2027, 3, 10, 12), [{ obraId: "o2", etapaId: null, fracaoBp: 10_000 }]),
      // fora: antes da reforma, e sem nenhum tributo destacado (o bruto delas não entra no total do crédito)
      notaDb(new Date(2025, 11, 31, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }]),
      { dataCompra: new Date(2027, 4, 10, 12), itens: [semDestaque], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }] },
    ]);
    const r = await carregarCreditoIbsCbs();
    expect(notaFindMany).toHaveBeenCalledTimes(1);
    const arg = notaFindMany.mock.calls[0][0];
    // a mesma consulta do realizado (sem where), com as colunas do crédito nos itens
    expect(arg.where).toBeUndefined();
    expect(arg.select.itens.select).toMatchObject({ totalCents: true, cClassTrib: true, cbsCents: true, ibsUfCents: true, ibsMunCents: true });
    expect(r.total).toMatchObject({ brutoCents: 200_000, creditoCents: 20_000 });
    // a tabela de classificações é lida inteira uma vez e fica em memória (classificacao-db.ts)
    expect(classificacaoFindMany).toHaveBeenCalledTimes(1);
    expect(classificacaoFindMany.mock.calls[0][0]).toMatchObject({ where: undefined });
    await carregarCreditoIbsCbs("o-de-novo");
    expect(classificacaoFindMany).toHaveBeenCalledTimes(1);
  });

  it("devolve crédito por obra e o total", async () => {
    notaFindMany.mockResolvedValue([
      notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 6_000 }, { obraId: "o2", etapaId: null, fracaoBp: 4_000 }]),
    ]);
    const r = await carregarCreditoIbsCbs();
    expect(r.regime).toBe("REGULAR");
    expect(r.porObra.get("o1")).toMatchObject({ brutoCents: 60_000, creditoCents: 6_000, liquidoCents: 54_000 });
    expect(r.porObra.get("o2")).toMatchObject({ creditoCents: 4_000 });
    expect(r.total).toMatchObject({ brutoCents: 100_000, creditoCents: 10_000, liquidoCents: 90_000 });
    expect(r.porEtapa.size).toBe(0);
  });

  it("com obra: da leitura de notasDaObra (a do realizado por etapa) e abre por etapa (null = sem etapa); a obra é a soma", async () => {
    notaFindMany.mockResolvedValue([
      notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o-filtro-1", etapaId: "e1", fracaoBp: 5_000 }]),
      notaDb(new Date(2027, 2, 11, 12), [{ obraId: "o-filtro-1", etapaId: null, fracaoBp: 10_000 }]),
    ]);
    const r = await carregarCreditoIbsCbs("o-filtro-1");
    expect(notaFindMany).toHaveBeenCalledTimes(1);
    const arg = notaFindMany.mock.calls[0][0];
    expect(arg.where.rateios).toEqual({ some: { obraId: "o-filtro-1" } });
    expect(arg.select.rateios.where).toEqual({ obraId: "o-filtro-1" });
    expect(r.porEtapa.get("e1")?.creditoCents).toBe(5_000);
    expect(r.porEtapa.get(null)?.creditoCents).toBe(10_000);
    expect([...r.porObra.keys()]).toEqual(["o-filtro-1"]);
    expect(r.porObra.get("o-filtro-1")).toEqual(r.total);
    expect(r.total).toMatchObject({ brutoCents: 150_000, creditoCents: 15_000, liquidoCents: 135_000 });
  });

  it("com obra e fonte \"todas\": filtra em memória as notas e os rateios da obra, com o mesmo resultado", async () => {
    const notas = [
      notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 3_333 }, { obraId: "o2", etapaId: "x", fracaoBp: 6_667 }]),
      notaDb(new Date(2027, 2, 11, 12), [{ obraId: "o2", etapaId: null, fracaoBp: 10_000 }]),
      notaDb(new Date(2027, 2, 12, 12), [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
    ];
    notaFindMany.mockResolvedValue(notas);
    const todas = await carregarCreditoIbsCbs("o1", "todas");
    expect(notaFindMany.mock.calls[0][0].where).toBeUndefined();
    // o mesmo que a leitura só da obra devolveria
    notaFindMany.mockResolvedValue(notas.filter((n) => n.rateios.some((r) => r.obraId === "o1")).map((n) => ({ ...n, rateios: n.rateios.filter((r) => r.obraId === "o1") })));
    const daObra = await carregarCreditoIbsCbs("o1");
    expect(todas).toEqual(daObra);
    expect(todas.porEtapa.get("e1")).toMatchObject({ brutoCents: 33_330, creditoCents: 3_333 });
    expect(todas.porEtapa.has("x")).toBe(false);
  });

  it("fonte \"destaque\": consulta própria só das notas com destaque, de 2026 em diante", async () => {
    notaFindMany.mockResolvedValue([notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }])]);
    const r = await carregarCreditoIbsCbs(undefined, "destaque");
    const arg = notaFindMany.mock.calls[0][0];
    expect(arg.where.dataCompra).toEqual({ gte: new Date(2026, 0, 1) });
    expect(arg.where.itens.some.OR).toHaveLength(3);
    expect(arg.where.rateios).toBeUndefined();
    expect(arg.select.rateios.where).toBeUndefined();
    expect(r.total.creditoCents).toBe(10_000);

    await carregarCreditoIbsCbs("o2", "destaque");
    const comObra = notaFindMany.mock.calls[1][0];
    expect(comObra.where.rateios).toEqual({ some: { obraId: "o2" } });
    expect(comObra.select.rateios.where).toEqual({ obraId: "o2" });
  });

  it("regime que não creditar nem consulta classificações; o destacado fica na situação do regime", async () => {
    empresaFindUnique.mockResolvedValue({ regimeIbsCbs: "SIMPLES_NACIONAL" });
    notaFindMany.mockResolvedValue([notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o-simples", etapaId: null, fracaoBp: 10_000 }])]);
    const r = await carregarCreditoIbsCbs("o-simples");
    expect(classificacaoFindMany).not.toHaveBeenCalled();
    expect(r.total).toMatchObject({ creditoCents: 0, porSituacao: { REGIME_NAO_REGULAR: 10_000 } });
  });

  it("sem empresa cadastrada vale regime não informado; sem notas, tudo zero e nenhuma consulta de classificação", async () => {
    empresaFindUnique.mockResolvedValue(null);
    notaFindMany.mockResolvedValue([]);
    const r = await carregarCreditoIbsCbs("o-vazia");
    expect(r.regime).toBe("NAO_INFORMADO");
    expect(r.total).toEqual({ brutoCents: 0, destacadoCents: 0, creditoCents: 0, liquidoCents: 0, porSituacao: {} });
    expect(r.porObra.size).toBe(0);
    expect(classificacaoFindMany).not.toHaveBeenCalled();
  });

  it("emissão em 2026 é teste mesmo no regime regular, e a classificação nem é lida", async () => {
    notaFindMany.mockResolvedValue([notaDb(new Date(2026, 5, 10, 12), [{ obraId: "o-teste", etapaId: null, fracaoBp: 10_000 }])]);
    const r = await carregarCreditoIbsCbs("o-teste");
    expect(r.total).toMatchObject({ creditoCents: 0, porSituacao: { PERIODO_TESTE: 10_000 } });
    expect(classificacaoFindMany).not.toHaveBeenCalled();
  });
});

describe("carregarModoDoCusto (curva ABC)", () => {
  it("fora do regime regular é bruto sem ler nota nenhuma", async () => {
    for (const regimeIbsCbs of ["SIMPLES_NACIONAL", "NAO_INFORMADO"]) {
      empresaFindUnique.mockResolvedValue({ regimeIbsCbs });
      expect(await carregarModoDoCusto("o1", null)).toEqual({ comCredito: false, modo: "BRUTO" });
    }
    expect(notaFindMany).not.toHaveBeenCalled();
    expect(classificacaoFindMany).not.toHaveBeenCalled();
  });

  it("no regime regular lê só as notas com destaque; com crédito o líquido é o padrão e ?custo=bruto volta ao bruto", async () => {
    notaFindMany.mockResolvedValue([notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }])]);
    expect(await carregarModoDoCusto("o1", null)).toEqual({ comCredito: true, modo: "LIQUIDO" });
    expect(notaFindMany.mock.calls[0][0].where.itens.some.OR).toHaveLength(3);
    expect(await carregarModoDoCusto(undefined, "bruto")).toEqual({ comCredito: true, modo: "BRUTO" });
    notaFindMany.mockResolvedValue([]);
    expect(await carregarModoDoCusto(undefined, null)).toEqual({ comCredito: false, modo: "BRUTO" });
  });
});

describe("carregarContextoCredito", () => {
  it("antes de 2027 nem pede classificação (creditoDoItem decide antes)", async () => {
    const ctx = await carregarContextoCredito([{ dataCompra: "2026-12-31", itens: [itemDb] }]);
    expect(classificacaoFindMany).not.toHaveBeenCalled();
    expect((ctx.classificacoes as ReadonlyMap<string, unknown>).size).toBe(0);
  });

  it("lê as classificações só dos itens com destaque", async () => {
    classificacaoFindMany.mockResolvedValue(["000001", "200025", "777777"].map((codigo) => ({ ...linhaClassificacao, codigo })));
    const ctx = await carregarContextoCredito([
      { dataCompra: "2027-01-01", itens: [itemDb, { ...itemDb, cClassTrib: "200025" }, { ...itemDb, cClassTrib: "777777", cbsCents: null, ibsUfCents: null, ibsMunCents: null }] },
    ]);
    const codigos = [...(ctx.classificacoes as ReadonlyMap<string, unknown>).keys()];
    expect(codigos.sort()).toEqual(["000001", "200025"]);
  });
});

describe("liquidarItensDasNotas", () => {
  it("troca o total do item pelo líquido e mantém o resto da nota", async () => {
    const [n] = await liquidarItensDasNotas([{ dataCompra: new Date(2027, 2, 10, 12), fornecedorId: "f1", itens: [{ ...itemDb }, { ...itemDb, cbsCents: null, ibsUfCents: null }] }]);
    expect(n.fornecedorId).toBe("f1");
    expect(n.itens.map((i) => i.totalCents)).toEqual([90_000, 100_000]);
  });

  it("nota com IBS/CBS por fora: o produto fica com total + destacado - crédito e a linha por fora zera", async () => {
    const porFora = { descricao: "IBS/CBS destacados na nota (cobrados por fora)", totalCents: 10_000, cClassTrib: null, cbsCents: null, ibsUfCents: null, ibsMunCents: null };
    const [n] = await liquidarItensDasNotas([{ dataCompra: new Date(2027, 2, 10, 12), itens: [{ ...itemDb }, porFora] }]);
    expect(n.itens.map((i) => i.totalCents)).toEqual([100_000, 0]);
  });
});
