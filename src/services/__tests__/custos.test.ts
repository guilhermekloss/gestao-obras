import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const medicaoFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { notaFiscal: { findMany }, medicao: { findMany: medicaoFindMany } } }));

const {
  acumular,
  avancoPorEtapa,
  chaveMes,
  realizadoPorEtapaTodas,
  realizadoPorMes,
  realizadoPorObra,
  ultimoAvancoPorEtapa,
} = await import("../custos");

const nota = (
  dataCompra: Date,
  itens: number[],
  rateios: { obraId: string; etapaId: string | null; fracaoBp: number }[],
) => ({ dataCompra, itens: itens.map((totalCents) => ({ totalCents })), rateios });

beforeEach(() => {
  findMany.mockReset();
  medicaoFindMany.mockReset();
});

// todos leem a mesma lista (notasParaAnalise): sem where, com o select da união dos consumidores
function esperaLeituraUnica() {
  expect(findMany).toHaveBeenCalledTimes(1);
  const [args] = findMany.mock.calls[0];
  expect(args).not.toHaveProperty("where");
  expect(args.select).toMatchObject({
    dataCompra: true,
    itens: { select: { totalCents: true } },
    rateios: { select: { obraId: true, etapaId: true, fracaoBp: true } },
  });
}

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
    esperaLeituraUnica();
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
    esperaLeituraUnica();
  });

  it("rateio sem etapa não altera o valor do outro rateio da mesma nota, nem a ordem das chaves", async () => {
    findMany.mockResolvedValue([
      nota(new Date(2026, 9, 1), [333], [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
      nota(new Date(2026, 9, 1), [333], [
        { obraId: "o1", etapaId: null, fracaoBp: 5_000 },
        { obraId: "o1", etapaId: "e2", fracaoBp: 5_000 },
      ]),
      nota(new Date(2026, 9, 2), [100], [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }]),
    ]);
    const mapa = await realizadoPorEtapaTodas();
    // 333 × 50% = 166,5 → 167, como na consulta antiga que só trazia o rateio com etapa
    expect([...mapa.entries()]).toEqual([
      ["e2", 167],
      ["e1", 100],
    ]);
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
    esperaLeituraUnica();
  });

  it("descarta as notas antes de `desde`; a do instante exato entra (gte)", async () => {
    const desde = new Date(2026, 8, 1);
    findMany.mockResolvedValue([
      nota(new Date(2026, 7, 31, 23, 59, 59, 999), [9_000], [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
      nota(new Date(desde), [1_000], [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }]),
      nota(new Date(2026, 8, 2), [500], [{ obraId: "o2", etapaId: null, fracaoBp: 10_000 }]),
    ]);
    const porMes = await realizadoPorMes(desde);
    expect([...porMes.keys()]).toEqual(["2026-09"]);
    expect([...porMes.get("2026-09")!.entries()]).toEqual([
      ["o1", 1_000],
      ["o2", 500],
    ]);
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

describe("avancoPorEtapa sem obra", () => {
  it("usa todas as medições em ordem de data e id (medicoesTodas)", async () => {
    medicaoFindMany.mockResolvedValue([
      { etapaId: "e1", data: new Date(2026, 9, 1), percentBp: 3_000 },
      { etapaId: "e2", data: new Date(2026, 9, 2), percentBp: 10_000 },
      { etapaId: "e1", data: new Date(2026, 9, 3), percentBp: 2_500 },
    ]);
    const mapa = await avancoPorEtapa();
    expect([...mapa.entries()]).toEqual([
      ["e1", 2_500],
      ["e2", 10_000],
    ]);
    expect(medicaoFindMany).toHaveBeenCalledWith({
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { etapaId: true, data: true, percentBp: true },
    });
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
