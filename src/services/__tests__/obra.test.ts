import { describe, it, expect } from "vitest";
import { avancoPonderado, validarAvanco } from "../obra";

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
