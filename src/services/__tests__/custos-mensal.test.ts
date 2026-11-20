import { beforeEach, describe, expect, it, vi } from "vitest";

const notaFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { notaFiscal: { findMany: notaFindMany }, medicao: { findMany: vi.fn() } } }));

const { realizadoPorMesDaObra } = await import("../custos");

beforeEach(() => notaFindMany.mockReset());

describe("realizadoPorMesDaObra", () => {
  it("soma por mês da compra o custo rateado para a obra", async () => {
    notaFindMany.mockResolvedValue([
      {
        dataCompra: new Date(2026, 9, 5, 12),
        itens: [{ totalCents: 600 }, { totalCents: 400 }],
        rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 6_000 }],
      },
      { dataCompra: new Date(2026, 9, 31, 12), itens: [{ totalCents: 500 }], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }] },
      { dataCompra: new Date(2026, 10, 1, 12), itens: [{ totalCents: 200 }], rateios: [{ obraId: "o1", etapaId: "e2", fracaoBp: 5_000 }] },
    ]);
    const mapa = await realizadoPorMesDaObra("o-mensal");
    expect([...mapa.entries()]).toEqual([
      ["2026-10", 1_100],
      ["2026-11", 100],
    ]);
  });

  it("busca só as notas com rateio na obra, e só os rateios dela", async () => {
    notaFindMany.mockResolvedValue([]);
    expect((await realizadoPorMesDaObra("o-consulta")).size).toBe(0);
    expect(notaFindMany).toHaveBeenCalledWith({
      where: { rateios: { some: { obraId: "o-consulta" } } },
      select: {
        dataCompra: true,
        // as colunas do crédito de IBS/CBS vêm junto: o crédito da obra sai desta mesma leitura (custo-liquido-db)
        itens: { select: { totalCents: true, cClassTrib: true, cbsCents: true, ibsUfCents: true, ibsMunCents: true } },
        rateios: { where: { obraId: "o-consulta" }, select: { obraId: true, etapaId: true, fracaoBp: true } },
      },
    });
  });
});
