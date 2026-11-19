import { describe, expect, it, vi } from "vitest";
import { inputParaData } from "@/lib/format";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { carregarCreditoDoFornecedor, carregarCrtPorFornecedor, carregarCustoEfetivoDoMaterial } = await import("../custo-efetivo-db");

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
    notaFiscal: { findMany: vi.fn(async (_: object) => [{ fornecedorId: "f1", crtEmitente: "1" }]) },
    classificacaoTributaria: {
      findMany: vi.fn(async (_: object) => [
        { ...classe, cst: "000", descricaoCst: "", descricao: "", tipoAliquota: "", nomenclatura: null, pRedCbs: null, pRedIbs: null, apropriaCreditoCbs: true, apropriaCreditoIbs: true, creditoPresumidoAdquirente: false },
      ]),
    },
  };
}
const agora = inputParaData("2027-06-15");

describe("carregarCustoEfetivoDoMaterial", () => {
  it("faz uma consulta por tabela, sem N+1, e calcula o efetivo", async () => {
    const db = banco([item(), item({ id: "j", nota: { id: "n2", dataCompra: inputParaData("2027-04-10"), crtEmitente: null, fornecedor: { id: "f2", nome: "Beta" }, itens: [] } })]);
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: db as never });
    expect(db.itemNota.findMany).toHaveBeenCalledTimes(1);
    expect(db.empresa.findUnique).toHaveBeenCalledTimes(1);
    expect(db.notaFiscal.findMany).toHaveBeenCalledTimes(1);
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
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: banco([item()], null) as never });
    expect(r.regimeEmpresa).toBe("NAO_INFORMADO");
    expect(r.grupos[0].modo).toBe("SEM_CREDITO_REGIME");
  });

  it("material sem compras: grupos vazios e sem consultar CRT", async () => {
    const db = banco([]);
    const r = await carregarCustoEfetivoDoMaterial("m1", { agora, db: db as never });
    expect(r.grupos).toEqual([]);
    expect(db.notaFiscal.findMany).not.toHaveBeenCalled();
    expect(db.classificacaoTributaria.findMany).not.toHaveBeenCalled();
  });
});

describe("carregarCreditoDoFornecedor", () => {
  it("soma o crédito do período do fornecedor", async () => {
    const db = banco();
    const r = await carregarCreditoDoFornecedor("f1", { agora, db: db as never });
    expect(db.itemNota.findMany.mock.calls[0][0]).toMatchObject({ where: { nota: { fornecedorId: "f1" } } });
    expect(r).toMatchObject({ creditoCents: 1_000, compras: 1, modo: "EFETIVO", meses: 12 });
  });
});

describe("carregarCrtPorFornecedor", () => {
  it("uma consulta, distinta por fornecedor e da nota mais recente; ignora CRT inválido", async () => {
    const db = banco();
    db.notaFiscal.findMany.mockResolvedValueOnce([
      { fornecedorId: "f1", crtEmitente: "3" },
      { fornecedorId: "f2", crtEmitente: "9" },
    ]);
    const m = await carregarCrtPorFornecedor(undefined, db as never);
    expect([...m]).toEqual([["f1", "3"]]);
    expect(db.notaFiscal.findMany.mock.calls[0][0]).toMatchObject({ distinct: ["fornecedorId"], orderBy: [{ dataCompra: "desc" }, { createdAt: "desc" }] });
  });

  it("lista de ids vazia nem consulta", async () => {
    const db = banco();
    expect((await carregarCrtPorFornecedor([], db as never)).size).toBe(0);
    expect(db.notaFiscal.findMany).not.toHaveBeenCalled();
  });
});
