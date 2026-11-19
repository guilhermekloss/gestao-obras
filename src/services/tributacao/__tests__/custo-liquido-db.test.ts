import { beforeEach, describe, expect, it, vi } from "vitest";

const notaFindMany = vi.fn();
const classificacaoFindMany = vi.fn();
const carregarEmpresa = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { notaFiscal: { findMany: notaFindMany }, classificacaoTributaria: { findMany: classificacaoFindMany } },
}));
vi.mock("../../empresa", () => ({ carregarEmpresa }));

const { carregarContextoCredito, carregarCreditoIbsCbs, liquidarItensDasNotas } = await import("../custo-liquido-db");

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
  carregarEmpresa.mockResolvedValue({ regimeIbsCbs: "REGULAR" });
  classificacaoFindMany.mockResolvedValue([linhaClassificacao]);
});

describe("carregarCreditoIbsCbs", () => {
  it("uma consulta de notas (só com destaque, de 2026 em diante) e uma de classificações, sem N+1", async () => {
    notaFindMany.mockResolvedValue([
      notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }]),
      notaDb(new Date(2027, 3, 10, 12), [{ obraId: "o2", etapaId: null, fracaoBp: 10_000 }]),
    ]);
    await carregarCreditoIbsCbs();
    expect(notaFindMany).toHaveBeenCalledTimes(1);
    expect(classificacaoFindMany).toHaveBeenCalledTimes(1);
    expect(classificacaoFindMany.mock.calls[0][0]).toMatchObject({ where: { codigo: { in: ["000001"] } } });
    const arg = notaFindMany.mock.calls[0][0];
    expect(arg.where.dataCompra).toEqual({ gte: new Date(2026, 0, 1) });
    expect(arg.where.itens.some.OR).toHaveLength(3);
    expect(arg.where.rateios).toBeUndefined();
    expect(arg.select.rateios.where).toBeUndefined();
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

  it("com obra, filtra notas e rateios dela e abre por etapa (null = sem etapa)", async () => {
    notaFindMany.mockResolvedValue([
      notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: "e1", fracaoBp: 5_000 }]),
      notaDb(new Date(2027, 2, 11, 12), [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
    ]);
    const r = await carregarCreditoIbsCbs("o-filtro-1");
    const arg = notaFindMany.mock.calls[0][0];
    expect(arg.where.rateios).toEqual({ some: { obraId: "o-filtro-1" } });
    expect(arg.select.rateios.where).toEqual({ obraId: "o-filtro-1" });
    expect(r.porEtapa.get("e1")?.creditoCents).toBe(5_000);
    expect(r.porEtapa.get(null)?.creditoCents).toBe(10_000);
  });

  it("regime que não creditar nem consulta classificações; o destacado fica na situação do regime", async () => {
    carregarEmpresa.mockResolvedValue({ regimeIbsCbs: "SIMPLES_NACIONAL" });
    notaFindMany.mockResolvedValue([notaDb(new Date(2027, 2, 10, 12), [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }])]);
    const r = await carregarCreditoIbsCbs("o-simples");
    expect(classificacaoFindMany).not.toHaveBeenCalled();
    expect(r.total).toMatchObject({ creditoCents: 0, porSituacao: { REGIME_NAO_REGULAR: 10_000 } });
  });

  it("sem empresa cadastrada vale regime não informado; sem notas, tudo zero e nenhuma consulta de classificação", async () => {
    carregarEmpresa.mockResolvedValue(null);
    notaFindMany.mockResolvedValue([]);
    const r = await carregarCreditoIbsCbs("o-vazia");
    expect(r.regime).toBe("NAO_INFORMADO");
    expect(r.total).toEqual({ brutoCents: 0, destacadoCents: 0, creditoCents: 0, liquidoCents: 0, porSituacao: {} });
    expect(classificacaoFindMany).not.toHaveBeenCalled();
  });

  it("emissão em 2026 é teste mesmo no regime regular", async () => {
    notaFindMany.mockResolvedValue([notaDb(new Date(2026, 5, 10, 12), [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }])]);
    const r = await carregarCreditoIbsCbs("o-teste");
    expect(r.total).toMatchObject({ creditoCents: 0, porSituacao: { PERIODO_TESTE: 10_000 } });
  });
});

describe("carregarContextoCredito", () => {
  it("lê as classificações só dos itens com destaque", async () => {
    await carregarContextoCredito([
      { dataCompra: "2027-01-01", itens: [itemDb, { ...itemDb, cClassTrib: "200025" }, { ...itemDb, cClassTrib: "777777", cbsCents: null, ibsUfCents: null, ibsMunCents: null }] },
    ]);
    const codigos = classificacaoFindMany.mock.calls[0][0].where.codigo.in as string[];
    expect(codigos.sort()).toEqual(["000001", "200025"]);
  });
});

describe("liquidarItensDasNotas", () => {
  it("troca o total do item pelo líquido e mantém o resto da nota", async () => {
    const [n] = await liquidarItensDasNotas([{ dataCompra: new Date(2027, 2, 10, 12), fornecedorId: "f1", itens: [{ ...itemDb }, { ...itemDb, cbsCents: null, ibsUfCents: null }] }]);
    expect(n.fornecedorId).toBe("f1");
    expect(n.itens.map((i) => i.totalCents)).toEqual([90_000, 100_000]);
  });
});
