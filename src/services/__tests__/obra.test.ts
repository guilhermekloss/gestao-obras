import { describe, it, expect } from "vitest";
import { avancoDaObra, avancoPonderado, orcamentoTotal, validarAvanco } from "../obra";

describe("avancoPonderado", () => {
  it("pondera pelo orçamento da etapa", () => {
    expect(
      avancoPonderado([
        { orcamentoCents: 10_000_000, percentBp: 10000 },
        { orcamentoCents: 30_000_000, percentBp: 0 },
      ]),
    ).toBe(2500);
  });

  it("sem orçamentos usa média simples", () => {
    expect(
      avancoPonderado([
        { orcamentoCents: 0, percentBp: 10000 },
        { orcamentoCents: 0, percentBp: 0 },
      ]),
    ).toBe(5000);
  });

  it("obra sem etapas tem avanço 0", () => {
    expect(avancoPonderado([])).toBe(0);
  });
});

describe("validarAvanco", () => {
  it("aceita avanço crescente dentro de 0–100%", () => {
    expect(validarAvanco(5000, 3000).ok).toBe(true);
  });

  it("rejeita regressão", () => {
    expect(validarAvanco(2000, 3000).ok).toBe(false);
  });

  it("rejeita acima de 100%", () => {
    expect(validarAvanco(10001, 0).ok).toBe(false);
  });
});

describe("orcamentoTotal", () => {
  it("soma o orçamento das etapas; sem etapas é zero", () => {
    expect(orcamentoTotal([{ orcamentoCents: 1_000 }, { orcamentoCents: 2_500 }])).toBe(3_500);
    expect(orcamentoTotal([])).toBe(0);
  });
});

describe("avancoDaObra", () => {
  const etapas = [
    { id: "e1", orcamentoCents: 3_000 },
    { id: "e2", orcamentoCents: 1_000 },
  ];
  it("pondera o último avanço de cada etapa pelo orçamento", () => {
    expect(avancoDaObra(etapas, new Map([["e1", 10_000], ["e2", 0]]))).toBe(7_500);
  });
  it("etapa sem medição conta 0%", () => {
    expect(avancoDaObra(etapas, new Map([["e2", 10_000]]))).toBe(2_500);
  });
});
