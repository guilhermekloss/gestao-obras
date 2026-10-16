import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { notaFiscal: { findMany } } }));

const { acumular, chaveMes, realizadoPorEtapaTodas, realizadoPorMes, realizadoPorObra, ultimoAvancoPorEtapa } = await import(
  "../custos"
);

const nota = (
  dataCompra: Date,
  itens: number[],
  rateios: { obraId: string; etapaId: string | null; fracaoBp: number }[],
) => ({ dataCompra, itens: itens.map((totalCents) => ({ totalCents })), rateios });

beforeEach(() => findMany.mockReset());

describe("chaveMes", () => {
  it("formata aaaa-mm no mês local", () => {
    expect(chaveMes(new Date(2026, 0, 31, 23, 59))).toBe("2026-01");
    expect(chaveMes(new Date(2026, 9, 1))).toBe("2026-10");
  });
});

describe("realizadoPorObra", () => {
  it("soma os itens × fração do rateio de cada obra", async () => {
    findMany.mockResolvedValue([
      nota(new Date(2026, 9, 1), [600, 400], [
        { obraId: "o1", etapaId: null, fracaoBp: 5_000 },
        { obraId: "o2", etapaId: null, fracaoBp: 5_000 },
      ]),
      nota(new Date(2026, 9, 2), [1_000], [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }]),
    ]);
    const mapa = await realizadoPorObra();
    expect(mapa.get("o1")).toBe(1_500);
    expect(mapa.get("o2")).toBe(500);
  });
});

describe("realizadoPorEtapaTodas", () => {
  it("acumula por etapaId e descarta rateios sem etapa", async () => {
    findMany.mockResolvedValue([
      nota(new Date(2026, 9, 1), [1_000], [
        { obraId: "o1", etapaId: "e1", fracaoBp: 7_000 },
        { obraId: "o2", etapaId: null, fracaoBp: 3_000 },
      ]),
      nota(new Date(2026, 9, 2), [500], [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }]),
    ]);
    const mapa = await realizadoPorEtapaTodas();
    expect([...mapa.entries()]).toEqual([["e1", 1_200]]);
  });
});

describe("realizadoPorMes", () => {
  it("agrupa por mês da compra e obra", async () => {
    findMany.mockResolvedValue([
      nota(new Date(2026, 8, 30), [1_000], [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
      nota(new Date(2026, 9, 1), [2_000], [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
      nota(new Date(2026, 9, 5), [300], [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
    ]);
    const porMes = await realizadoPorMes(new Date(2026, 8, 1));
    expect(porMes.get("2026-09")?.get("o1")).toBe(1_000);
    expect(porMes.get("2026-10")?.get("o1")).toBe(2_300);
  });
});

describe("ultimoAvancoPorEtapa", () => {
  it("a última medição de cada etapa vale, mesmo se for menor que a anterior", () => {
    const mapa = ultimoAvancoPorEtapa([
      { etapaId: "e1", percentBp: 2_000 },
      { etapaId: "e2", percentBp: 5_000 },
      { etapaId: "e1", percentBp: 4_000 },
    ]);
    expect(mapa.get("e1")).toBe(4_000);
    expect(mapa.get("e2")).toBe(5_000);
  });
});

describe("acumular", () => {
  it("soma os itens da nota e só então rateia: o arredondamento é por nota", () => {
    // dois itens de 1 centavo a 50%: por item daria 1 + 1 = 2; por nota é round(2 × 0,5) = 1
    const mapa = acumular(
      [{ itens: [{ totalCents: 1 }, { totalCents: 1 }], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 5_000 }, { obraId: "o2", etapaId: null, fracaoBp: 5_000 }] }],
      (_nota, r) => r.obraId,
    );
    expect(mapa.get("o1")).toBe(1);
    expect(mapa.get("o2")).toBe(1);
  });
});
