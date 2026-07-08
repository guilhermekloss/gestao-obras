import { describe, it, expect } from "vitest";
import { fluxoMensal } from "../financeiro";

describe("fluxoMensal", () => {
  it("distribui parcelas por mês e obra conforme o rateio", () => {
    const fluxo = fluxoMensal([
      {
        valorCents: 10000,
        vencimento: new Date(2026, 0, 20),
        rateios: [
          { obraId: "L03", fracaoBp: 6000 },
          { obraId: "L19", fracaoBp: 4000 },
        ],
      },
      {
        valorCents: 5000,
        vencimento: new Date(2026, 1, 20),
        rateios: [{ obraId: "L03", fracaoBp: 10000 }],
      },
    ]);

    expect(fluxo.meses).toEqual(["2026-01", "2026-02"]);
    expect(fluxo.valores["2026-01"]["L03"]).toBe(6000);
    expect(fluxo.valores["2026-01"]["L19"]).toBe(4000);
    expect(fluxo.valores["2026-02"]["L03"]).toBe(5000);
    expect(fluxo.totalPorObra["L03"]).toBe(11000);
    expect(fluxo.totalPorMes["2026-01"]).toBe(10000);
  });

  it("lida com lista vazia", () => {
    const fluxo = fluxoMensal([]);
    expect(fluxo.meses).toEqual([]);
    expect(fluxo.obras).toEqual([]);
  });
});
