import { describe, it, expect } from "vitest";
import { avancoDaObra, avancoPonderado, orcamentoTotal, validarAvanco, validarAvancoNaSerie } from "../obra";

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

describe("validarAvancoNaSerie", () => {
  const dia = (iso: string) => new Date(`${iso}T12:00:00`);
  const hoje = dia("2026-10-17");
  const serie = [
    { id: "a", data: dia("2026-10-01"), percentBp: 3000 },
    { id: "b", data: dia("2026-10-10"), percentBp: 6000 },
  ];
  const v = (data: string, percentBp: number, ex = serie) =>
    validarAvancoNaSerie({ data, percentBp }, ex, hoje);

  it("aceita qualquer avanço sem medições", () => {
    expect(v("2026-10-05", 4000, []).ok).toBe(true);
  });
  it("rejeita data futura e aceita hoje", () => {
    const r = v("2026-10-18", 7000);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("A data do avanço não pode ser futura.");
    expect(v("2026-10-17", 6000).ok).toBe(true);
  });
  it("aceita retroativo entre vizinhas", () => {
    expect(v("2026-10-05", 4500).ok).toBe(true);
  });
  it("rejeita retroativo maior que a posterior", () => {
    expect(v("2026-10-05", 7000).erro).toBe(
      "Em 10/10/2026 já consta 60%. O avanço de 05/10/2026 não pode ser maior que isso.",
    );
  });
  it("rejeita avanço menor que a anterior", () => {
    expect(v("2026-10-12", 5000).erro).toBe(
      "O avanço não pode ser menor que o já registrado (60% em 10/10/2026).",
    );
    expect(v("2026-10-05", 2000).ok).toBe(false);
  });
  it("na mesma data a última lançada vale", () => {
    expect(v("2026-10-10", 6000).ok).toBe(true);
    expect(v("2026-10-10", 8000).ok).toBe(true);
    expect(v("2026-10-10", 5000).ok).toBe(false);
    // posterior só conta a partir do dia seguinte
    expect(v("2026-10-01", 3500).ok).toBe(true);
  });
  it("limites 0% e 100%", () => {
    expect(v("2026-10-01", 0, []).ok).toBe(true);
    expect(v("2026-10-17", 10000).ok).toBe(true);
    expect(v("2026-10-17", 10001).ok).toBe(false);
    expect(v("2026-10-17", -1).ok).toBe(false);
  });
});
