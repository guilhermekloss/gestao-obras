import { beforeEach, describe, expect, it, vi } from "vitest";

const notaFindMany = vi.fn();
const medicaoFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { notaFiscal: { findMany: notaFindMany }, medicao: { findMany: medicaoFindMany } },
}));

const { avancoPorEtapa, realizadoPorEtapa } = await import("../custos");

beforeEach(() => {
  notaFindMany.mockReset();
  medicaoFindMany.mockReset();
});

describe("realizadoPorEtapa", () => {
  it("acumula por etapa da obra, com o rateio sem etapa na chave null", async () => {
    notaFindMany.mockResolvedValue([
      { itens: [{ totalCents: 600 }, { totalCents: 400 }], rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 6_000 }] },
      { itens: [{ totalCents: 500 }], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }] },
      { itens: [{ totalCents: 200 }], rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }] },
    ]);
    const mapa = await realizadoPorEtapa("o1");
    expect([...mapa.entries()]).toEqual([
      ["e1", 800],
      [null, 500],
    ]);
  });
});

describe("avancoPorEtapa", () => {
  it("a última medição devolvida de cada etapa vale", async () => {
    medicaoFindMany.mockResolvedValue([
      { etapaId: "e1", percentBp: 3_000 },
      { etapaId: "e2", percentBp: 10_000 },
      { etapaId: "e1", percentBp: 2_500 },
    ]);
    const mapa = await avancoPorEtapa("o1");
    expect([...mapa.entries()]).toEqual([
      ["e1", 2_500],
      ["e2", 10_000],
    ]);
    expect(medicaoFindMany).toHaveBeenCalledWith({
      where: { etapa: { obraId: "o1" } },
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { etapaId: true, data: true, percentBp: true },
    });
  });

  it("com `ate`, medição datada depois desse dia não conta; no próprio dia conta", async () => {
    medicaoFindMany.mockResolvedValue([
      { etapaId: "e1", data: new Date(2026, 9, 10, 12), percentBp: 3_000 },
      { etapaId: "e1", data: new Date(2026, 9, 20, 12), percentBp: 4_000 },
      { etapaId: "e1", data: new Date(2026, 10, 5, 12), percentBp: 9_000 },
      { etapaId: "e2", data: new Date(2026, 10, 1, 12), percentBp: 5_000 },
    ]);
    const mapa = await avancoPorEtapa("o1", { ate: "2026-10-20" });
    expect([...mapa.entries()]).toEqual([["e1", 4_000]]);
    // sem `ate` segue valendo a última de todas
    expect([...(await avancoPorEtapa("o1")).entries()]).toEqual([
      ["e1", 9_000],
      ["e2", 5_000],
    ]);
  });
});
