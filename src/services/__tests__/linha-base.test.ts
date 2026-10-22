import { describe, expect, it } from "vitest";
import { previstoNaData } from "../cronograma";
import { planoDaLinhaBase, validarFotoDaLinhaBase } from "../linha-base";

describe("planoDaLinhaBase", () => {
  const linha = {
    id: "lb1",
    etapas: [
      { etapaId: "fund", nome: "Fundação", inicio: "2026-01-01", fim: "2026-01-31", orcamentoCents: 100 },
      { etapaId: null, nome: "Etapa excluída", inicio: "2026-02-01", fim: "2026-02-28", orcamentoCents: 300 },
    ],
  };

  it("usa o id da etapa para casar com as medições", () => {
    expect(planoDaLinhaBase(linha)[0]).toEqual({
      id: "fund",
      orcamentoCents: 100,
      inicioPrevisto: "2026-01-01",
      fimPrevisto: "2026-01-31",
    });
  });

  it("etapa excluída continua pesando no previsto, com id próprio", () => {
    const plano = planoDaLinhaBase(linha);
    expect(plano[1].id).toBe("lb1:1");
    // fim de janeiro: só a fundação (25% do peso) completa
    expect(previstoNaData(plano, "2026-01-31")).toBe(2500);
  });
});

describe("validarFotoDaLinhaBase", () => {
  it("exige pelo menos uma etapa com início e fim", () => {
    expect(validarFotoDaLinhaBase([]).ok).toBe(false);
    expect(validarFotoDaLinhaBase([{ inicioPrevisto: null, fimPrevisto: null }]).erro).toMatch(/pelo menos uma etapa/);
    expect(validarFotoDaLinhaBase([{ inicioPrevisto: new Date(), fimPrevisto: null }]).ok).toBe(false);
  });

  it("aceita quando há etapa datada, mesmo com outras sem datas", () => {
    expect(
      validarFotoDaLinhaBase([
        { inicioPrevisto: null, fimPrevisto: null },
        { inicioPrevisto: "2026-01-01", fimPrevisto: "2026-01-31" },
      ]).ok,
    ).toBe(true);
  });
});
