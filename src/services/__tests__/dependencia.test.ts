import { describe, it, expect } from "vitest";
import { pontuar, nivelDe, recenciaDeDias, PESOS } from "../dependencia";

describe("recenciaDeDias", () => {
  it("compra recente vale nota cheia", () => {
    expect(recenciaDeDias(0)).toBe(1);
    expect(recenciaDeDias(90)).toBe(1);
  });

  it("compra antiga zera", () => {
    expect(recenciaDeDias(365)).toBe(0);
    expect(recenciaDeDias(1000)).toBe(0);
  });

  it("decai linearmente entre 90 e 365 dias", () => {
    expect(recenciaDeDias(227.5)).toBeCloseTo(0.5, 5);
  });
});

describe("nivelDe", () => {
  it("classifica em faixas ALTA/MEDIA/BAIXA", () => {
    expect(nivelDe(80)).toBe("ALTA");
    expect(nivelDe(66)).toBe("ALTA");
    expect(nivelDe(50)).toBe("MEDIA");
    expect(nivelDe(33)).toBe("MEDIA");
    expect(nivelDe(10)).toBe("BAIXA");
  });
});

describe("pontuar", () => {
  it("fornecedor sem peso nenhum → score 0", () => {
    const p = pontuar({ shareGasto: 0, exclusividade: 0, recencia: 0, alcance: 0 });
    expect(p.score).toBe(0);
    expect(p.nivel).toBe("BAIXA");
  });

  it("fornecedor máximo em todos os fatores → score 100", () => {
    const p = pontuar({ shareGasto: 1, exclusividade: 1, recencia: 1, alcance: 1 });
    expect(p.score).toBe(100);
    expect(p.nivel).toBe("ALTA");
  });

  it("concentração satura no teto de 40% do gasto", () => {
    const teto = pontuar({ shareGasto: 0.4, exclusividade: 0, recencia: 0, alcance: 0 });
    const acima = pontuar({ shareGasto: 0.9, exclusividade: 0, recencia: 0, alcance: 0 });
    expect(teto.componentes.concentracao).toBeCloseTo(PESOS.concentracao, 5);
    expect(acima.componentes.concentracao).toBeCloseTo(PESOS.concentracao, 5);
  });

  it("distribui os pontos conforme os pesos", () => {
    const p = pontuar({ shareGasto: 0.2, exclusividade: 0.5, recencia: 1, alcance: 0.5 });
    expect(p.componentes.concentracao).toBeCloseTo(20, 5);
    expect(p.componentes.exclusividade).toBeCloseTo(15, 5);
    expect(p.componentes.recencia).toBeCloseTo(15, 5);
    expect(p.componentes.alcance).toBeCloseTo(7.5, 5);
    expect(p.score).toBe(58);
  });
});
