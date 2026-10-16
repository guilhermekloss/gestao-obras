import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { notaFiscal: { findMany }, obra: { count } } }));

const { calcularDependencia, pontuar } = await import("../dependencia");

const nota = (
  fornecedorId: string,
  dataCompra: Date,
  totalCents: number,
  obras: string[],
  itens: { descricao: string; tipo: "MATERIAL" | "MAO_DE_OBRA"; totalCents: number }[],
) => ({ fornecedorId, dataCompra, totalCents, rateios: obras.map((obraId) => ({ obraId })), itens });

const agora = new Date(2026, 9, 15, 12);

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
});

describe("calcularDependencia", () => {
  const notas = [
    // fora de ordem de propósito: a última compra de A é a de outubro
    nota("A", new Date(2026, 9, 10), 500, ["o1"], [{ descricao: "cimento cp ii", tipo: "MATERIAL", totalCents: 500 }]),
    nota("A", new Date(2026, 8, 1), 1000, ["o1", "o2"], [
      { descricao: "Cimento CP II ", tipo: "MATERIAL", totalCents: 600 },
      { descricao: "  AREIA   média", tipo: "MATERIAL", totalCents: 400 },
    ]),
    nota("B", new Date(2026, 7, 1), 500, ["o3"], [
      { descricao: "areia média", tipo: "MATERIAL", totalCents: 300 },
      { descricao: "Empreitada de reboco", tipo: "MAO_DE_OBRA", totalCents: 200 },
    ]),
  ];

  it("consolida gasto, notas, obras, tipos e última compra por fornecedor", async () => {
    findMany.mockResolvedValue(notas);
    count.mockResolvedValue(4);
    const r = await calcularDependencia(agora);

    expect([...r.keys()].sort()).toEqual(["A", "B"]);
    const a = r.get("A")!;
    expect(a).toMatchObject({ fornecedorId: "A", gastoCents: 1500, numNotas: 2, obrasAtendidas: 2, tipos: ["MATERIAL"] });
    expect(a.ultimaCompra).toEqual(new Date(2026, 9, 10));
    const b = r.get("B")!;
    expect(b).toMatchObject({ fornecedorId: "B", gastoCents: 500, numNotas: 1, obrasAtendidas: 1 });
    expect(b.tipos.sort()).toEqual(["MAO_DE_OBRA", "MATERIAL"]);
    expect(b.ultimaCompra).toEqual(new Date(2026, 7, 1));
  });

  it("descrição vendida por um só fornecedor é exclusiva (ignorando caixa e espaços)", async () => {
    findMany.mockResolvedValue(notas);
    count.mockResolvedValue(4);
    const r = await calcularDependencia(agora);

    const a = r.get("A")!;
    expect([...a.descricoesExclusivas]).toEqual(["cimento cp ii"]);
    expect(a.gastoExclusivoCents).toBe(1100);
    const b = r.get("B")!;
    expect([...b.descricoesExclusivas]).toEqual(["empreitada de reboco"]);
    expect(b.gastoExclusivoCents).toBe(200);
  });

  it("fatores: participação no gasto, exclusividade, recência e alcance; pontuação coerente", async () => {
    findMany.mockResolvedValue(notas);
    count.mockResolvedValue(4);
    const r = await calcularDependencia(agora);

    const a = r.get("A")!;
    expect(a.fatores).toEqual({ shareGasto: 0.75, exclusividade: 1100 / 1500, recencia: 1, alcance: 0.5 });
    expect(a.score).toBe(pontuar(a.fatores).score);
    expect(a.componentes).toEqual(pontuar(a.fatores).componentes);
    const b = r.get("B")!;
    expect(b.fatores).toEqual({ shareGasto: 0.25, exclusividade: 0.4, recencia: 1, alcance: 0.25 });
    expect(b.nivel).toBe(pontuar(b.fatores).nivel);
  });

  it("recência cai com o tempo desde a última compra", async () => {
    findMany.mockResolvedValue([
      nota("A", new Date(2026, 9, 14), 100, ["o1"], [{ descricao: "x", tipo: "MATERIAL", totalCents: 100 }]),
      nota("B", new Date(2025, 0, 1), 100, ["o1"], [{ descricao: "y", tipo: "MATERIAL", totalCents: 100 }]),
    ]);
    count.mockResolvedValue(1);
    const r = await calcularDependencia(agora);
    expect(r.get("A")!.fatores.recencia).toBe(1);
    expect(r.get("B")!.fatores.recencia).toBe(0);
  });

  it("sem obras cadastradas o alcance é zero; sem gasto a participação é zero", async () => {
    findMany.mockResolvedValue([
      nota("A", new Date(2026, 9, 1), 0, ["o1"], [{ descricao: "brinde", tipo: "MATERIAL", totalCents: 0 }]),
    ]);
    count.mockResolvedValue(0);
    const a = (await calcularDependencia(agora)).get("A")!;
    expect(a.fatores.alcance).toBe(0);
    expect(a.fatores.shareGasto).toBe(0);
    expect(a.fatores.exclusividade).toBe(0);
  });

  it("sem notas devolve mapa vazio", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(3);
    expect((await calcularDependencia(agora)).size).toBe(0);
  });
});
