import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputParaData } from "@/lib/format";

// o prisma padrão só é usado pelo crédito do fornecedor (regime em cache e classificações em memória)
const padrao = vi.hoisted(() => ({
  empresa: { findUnique: vi.fn(async (_: object) => ({ regimeIbsCbs: "REGULAR" }) as { regimeIbsCbs: string } | null) },
  classificacaoTributaria: { findMany: vi.fn(async (_: object) => [] as object[]) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: padrao }));
const { calcularCreditoDoFornecedor, carregarCrtPorFornecedor, carregarCustoEfetivoDoMaterial } = await import("../custo-efetivo-db");
const { esquecerClassificacoes } = await import("../classificacao-db");

const classe = {
  codigo: "000001",
  inicioVigencia: new Date("2026-01-01T00:00:00Z"),
  fimVigencia: null,
};

const item = (extra: object = {}) => ({
  id: "i",
  descricao: "CIMENTO",
  qtde: { toString: () => "10" },
  unidade: "UN",
  totalCents: 10_000,
  cClassTrib: "000001",
  cbsCents: 1_000,
  ibsUfCents: 0,
  ibsMunCents: 0,
  nota: { id: "n1", dataCompra: inputParaData("2027-03-10"), crtEmitente: "3", fornecedor: { id: "f1", nome: "Alfa" }, itens: [] },
  ...extra,
});

function banco(itens: object[] = [item()], regime: string | null = "REGULAR") {
  return {
    itemNota: { findMany: vi.fn(async (_: object) => itens) },
    empresa: { findUnique: vi.fn(async (_: object) => (regime ? { regimeIbsCbs: regime } : null)) },
    $queryRaw: vi.fn(async (_: unknown) => [{ fornecedorId: "f1", crtEmitente: "1" }]),
    classificacaoTributaria: { findMany: vi.fn(async (_: object) => [linhaClasse]) },
  };
}
const linhaClasse = { ...classe, cst: "000", descricaoCst: "", descricao: "", tipoAliquota: "", nomenclatura: null, pRedCbs: null, pRedIbs: null, apropriaCreditoCbs: true, apropriaCreditoIbs: true, creditoPresumidoAdquirente: false };
const agora = inputParaData("2027-06-15");

describe("carregarCustoEfetivoDoMaterial", () => {
  it("faz uma consulta por tabela, sem N+1, e calcula o efetivo", async () => {
    const db = banco([item(), item({ id: "j", nota: { id: "n2", dataCompra: inputParaData("2027-04-10"), crtEmitente: null, fornecedor: { id: "f2", nome: "Beta" }, itens: [] } })]);
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: db as never });
    expect(db.itemNota.findMany).toHaveBeenCalledTimes(1);
    expect(db.empresa.findUnique).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.classificacaoTributaria.findMany).toHaveBeenCalledTimes(1);
    expect(db.itemNota.findMany.mock.calls[0][0]).toMatchObject({ where: { materialId: "m1" } });
    expect(r).toMatchObject({ regimeEmpresa: "REGULAR", meses: 12, desde: "2026-06-15" });
    // o CRT vem da consulta de notas (f1 = Simples); f2 sem CRT no mapa fica não identificado
    const regimes = Object.fromEntries(r.grupos[0].fornecedores.map((f) => [f.fornecedorId, f.regime]));
    expect(regimes).toEqual({ f1: "SIMPLES", f2: "NAO_IDENTIFICADO" });
    expect(r.grupos[0].fornecedores.find((f) => f.fornecedorId === "f1")).toMatchObject({ creditoUnitCents: 100, efetivoUnitCents: 900 });
  });

  it("nota com IBS/CBS por fora (linha acessória na nota): bruto = total + destacado e efetivo = total", async () => {
    const nota = { id: "n1", dataCompra: inputParaData("2027-03-10"), crtEmitente: "3", fornecedor: { id: "f1", nome: "Alfa" }, itens: [{ id: "x" }] };
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: banco([item({ nota })]) as never });
    expect(r.grupos[0].fornecedores[0]).toMatchObject({ gastoCents: 11_000, brutoUnitCents: 1_100, creditoUnitCents: 100, efetivoUnitCents: 1_000 });
  });

  it("sem empresa cadastrada vale NAO_INFORMADO (sem crédito)", async () => {
    const db = banco([item()], null);
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: db as never });
    expect(r.regimeEmpresa).toBe("NAO_INFORMADO");
    expect(r.grupos[0].modo).toBe("SEM_CREDITO_REGIME");
    // fora do regime regular a classificação não pesa: nem é lida
    expect(db.classificacaoTributaria.findMany).not.toHaveBeenCalled();
  });

  it("compras só de 2026 (período de teste): sem leitura de classificações", async () => {
    const db = banco([item({ nota: { id: "n1", dataCompra: inputParaData("2026-10-10"), crtEmitente: "3", fornecedor: { id: "f1", nome: "Alfa" }, itens: [] } })]);
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: db as never });
    expect(r.grupos[0].modo).toBe("NOMINAL_PERIODO_TESTE");
    expect(db.classificacaoTributaria.findMany).not.toHaveBeenCalled();
  });

  it("material sem compras: grupos vazios e sem consultar CRT", async () => {
    const db = banco([]);
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: db as never });
    expect(r.grupos).toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.classificacaoTributaria.findMany).not.toHaveBeenCalled();
  });
});

describe("calcularCreditoDoFornecedor", () => {
  const itemDaNota = (extra: object = {}) => ({
    descricao: "CIMENTO",
    qtde: { toString: () => "10" },
    unidade: "UN",
    totalCents: 10_000,
    cClassTrib: "000001",
    cbsCents: 1_000,
    ibsUfCents: 0,
    ibsMunCents: 0,
    ...extra,
  });
  const nota = (id: string, dia: string, itens: object[] = [itemDaNota()]) => ({ id, dataCompra: inputParaData(dia), crtEmitente: "3", itens });
  const fornecedor = { id: "f1", nome: "Alfa" };

  beforeEach(() => {
    esquecerClassificacoes();
    padrao.empresa.findUnique.mockClear().mockResolvedValue({ regimeIbsCbs: "REGULAR" });
    padrao.classificacaoTributaria.findMany.mockClear().mockResolvedValue([linhaClasse]);
  });

  it("soma o crédito do período a partir das notas já lidas, sem consultar notas nem itens", async () => {
    const notas = [nota("n1", "2027-03-10"), nota("antiga", "2026-01-10"), nota("n2", "2027-05-10", [itemDaNota(), itemDaNota({ cbsCents: null })])];
    const r = await calcularCreditoDoFornecedor(fornecedor, notas as never, { agora });
    // a nota de antes do período fica fora, como no corte por data da consulta antiga
    expect(r).toMatchObject({ gastoCents: 30_000, creditoCents: 2_000, compras: 2, comprasAntesDoCredito: 0, modo: "EFETIVO", meses: 12, desde: "2026-06-15", regimeEmpresa: "REGULAR" });
    expect(padrao.classificacaoTributaria.findMany).toHaveBeenCalledTimes(1);
  });

  it("nota com IBS/CBS por fora: a linha acessória marca a nota e o crédito é o mesmo da consulta por item", async () => {
    const porFora = itemDaNota({ descricao: "IBS/CBS destacados na nota (cobrados por fora)", totalCents: 1_000, cClassTrib: null, cbsCents: null });
    const r = await calcularCreditoDoFornecedor(fornecedor, [nota("n1", "2027-03-10", [itemDaNota(), porFora])] as never, { agora });
    // bruto do produto = total + destacado; a linha por fora fica em 0
    expect(r).toMatchObject({ gastoCents: 11_000, creditoCents: 1_000 });
  });

  it("fora do regime regular: sem crédito e sem ler classificações", async () => {
    padrao.empresa.findUnique.mockResolvedValue({ regimeIbsCbs: "SIMPLES_NACIONAL" });
    const r = await calcularCreditoDoFornecedor(fornecedor, [nota("n1", "2027-03-10")] as never, { agora });
    expect(r).toMatchObject({ creditoCents: 0, modo: "SEM_CREDITO_REGIME", regimeEmpresa: "SIMPLES_NACIONAL" });
    expect(padrao.classificacaoTributaria.findMany).not.toHaveBeenCalled();
  });
});

describe("carregarCrtPorFornecedor", () => {
  it("uma consulta DISTINCT ON por fornecedor, parametrizada, da nota mais recente; ignora CRT inválido", async () => {
    const db = banco();
    db.$queryRaw.mockResolvedValueOnce([
      { fornecedorId: "f1", crtEmitente: "3" },
      { fornecedorId: "f2", crtEmitente: "9" },
    ]);
    const m = await carregarCrtPorFornecedor(["f1", "f2", "f1"], db as never);
    expect([...m]).toEqual([["f1", "3"]]);
    const sql = db.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.sql).toMatch(/DISTINCT ON \("fornecedorId"\)/);
    expect(sql.sql).toMatch(/ORDER BY "fornecedorId", "dataCompra" DESC, "createdAt" DESC/);
    // os ids vão como parâmetros (sem repetir), nunca no texto da consulta
    expect(sql.values).toEqual(["f1", "f2"]);
    expect(sql.sql).not.toContain("f1");
  });

  it("lista de ids vazia nem consulta", async () => {
    const db = banco();
    expect((await carregarCrtPorFornecedor([], db as never)).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
