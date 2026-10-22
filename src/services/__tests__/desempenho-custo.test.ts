import { describe, expect, it } from "vitest";
import {
  desembolsoMensal,
  desempenhoCusto,
  idc,
  realizadoMensalDaObra,
  tendencia,
  totalDesempenho,
  valorAgregado,
} from "../desempenho-custo";

describe("valorAgregado", () => {
  it("é o orçado vezes o físico, em centavos inteiros", () => {
    expect(valorAgregado(100_000, 2_500)).toBe(25_000);
    expect(valorAgregado(100_001, 3_333)).toBe(33_330); // 33.330,33 arredonda
    expect(valorAgregado(100_000, 0)).toBe(0);
    expect(valorAgregado(0, 5_000)).toBe(0);
  });
});

describe("idc", () => {
  it("valor agregado ÷ realizado, em base 10000", () => {
    expect(idc(50_000, 50_000)).toBe(10_000);
    expect(idc(40_000, 50_000)).toBe(8_000);
    expect(idc(60_000, 40_000)).toBe(15_000);
  });

  it("é null sem realizado (nada gasto, não há índice)", () => {
    expect(idc(10_000, 0)).toBeNull();
    expect(idc(0, 0)).toBeNull();
  });

  it("realizado com físico zero dá 0, não null", () => {
    expect(idc(0, 1_000)).toBe(0);
  });
});

describe("tendencia", () => {
  it("sem físico: o maior entre orçado e realizado", () => {
    expect(tendencia(100_000, 20_000, 0)).toBe(100_000);
    expect(tendencia(100_000, 130_000, 0)).toBe(130_000);
    expect(tendencia(0, 0, 0)).toBe(0);
  });

  it("com físico: realizado projetado para 100% do físico", () => {
    expect(tendencia(100_000, 30_000, 2_500)).toBe(120_000);
    expect(tendencia(100_000, 50_000, 10_000)).toBe(50_000);
    expect(tendencia(100_000, 10_000, 3_000)).toBe(33_333);
  });

  it("com físico e nada gasto, a projeção é zero (segue a fórmula)", () => {
    expect(tendencia(100_000, 0, 5_000)).toBe(0);
  });
});

describe("desempenhoCusto", () => {
  it("monta VA, IDC, tendência e variação de uma etapa", () => {
    expect(desempenhoCusto({ orcamentoCents: 100_000, realizadoCents: 30_000, fisicoBp: 2_500 })).toEqual({
      orcamentoCents: 100_000,
      realizadoCents: 30_000,
      fisicoBp: 2_500,
      valorAgregadoCents: 25_000,
      idcBp: 8_333,
      tendenciaCents: 120_000,
      variacaoCents: -20_000,
    });
  });

  it("etapa abaixo do custo previsto: variação positiva", () => {
    const d = desempenhoCusto({ orcamentoCents: 100_000, realizadoCents: 40_000, fisicoBp: 5_000 });
    expect(d.idcBp).toBe(12_500);
    expect(d.tendenciaCents).toBe(80_000);
    expect(d.variacaoCents).toBe(20_000);
  });

  it("sem físico nem realizado: tendência é o orçado, variação zero, IDC null", () => {
    const d = desempenhoCusto({ orcamentoCents: 50_000, realizadoCents: 0, fisicoBp: 0 });
    expect(d).toMatchObject({ valorAgregadoCents: 0, idcBp: null, tendenciaCents: 50_000, variacaoCents: 0 });
  });
});

describe("totalDesempenho", () => {
  it("soma as etapas, pondera o físico pelo orçado e recalcula o IDC sobre os totais", () => {
    const total = totalDesempenho([
      desempenhoCusto({ orcamentoCents: 100_000, realizadoCents: 30_000, fisicoBp: 2_500 }),
      desempenhoCusto({ orcamentoCents: 300_000, realizadoCents: 0, fisicoBp: 0 }),
      // realizado sem etapa: sem orçado e sem físico, entra pela tendência = realizado
      desempenhoCusto({ orcamentoCents: 0, realizadoCents: 5_000, fisicoBp: 0 }),
    ]);
    expect(total).toEqual({
      orcamentoCents: 400_000,
      realizadoCents: 35_000,
      fisicoBp: 625,
      valorAgregadoCents: 25_000,
      idcBp: 7_143,
      tendenciaCents: 425_000,
      variacaoCents: -25_000,
    });
  });

  it("lista vazia dá tudo zero e IDC null", () => {
    expect(totalDesempenho([])).toMatchObject({ orcamentoCents: 0, fisicoBp: 0, idcBp: null, tendenciaCents: 0 });
  });
});

describe("desembolsoMensal", () => {
  const hoje = "2026-03-10";

  it("distribui o orçado em linha reta pelos dias e fecha no total", () => {
    // 1/jan a 31/mar = 90 dias: fim de jan = 31/90 = 34,44%, fim de fev = 59/90 = 65,56% (bp arredondado)
    const { pontos, semDatasCents } = desembolsoMensal(
      [{ orcamentoCents: 90_000, inicio: "2026-01-01", fim: "2026-03-31" }],
      new Map(),
      hoje,
    );
    expect(semDatasCents).toBe(0);
    expect(pontos.map((p) => [p.mes, p.previstoCents, p.previstoAcumCents])).toEqual([
      ["2026-01", 30_996, 30_996],
      ["2026-02", 28_008, 59_004],
      ["2026-03", 30_996, 90_000],
    ]);
  });

  it("soma etapas que se sobrepõem e junta o realizado do mês, acumulando até o mês corrente", () => {
    const { pontos } = desembolsoMensal(
      [
        { orcamentoCents: 10_000, inicio: "2026-02-01", fim: "2026-02-28" },
        { orcamentoCents: 20_000, inicio: "2026-02-01", fim: "2026-05-31" },
      ],
      new Map([
        ["2026-01", 1_000],
        ["2026-02", 4_000],
        ["2026-03", 500],
      ]),
      hoje,
    );
    expect(pontos.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(pontos[0]).toEqual({ mes: "2026-01", previstoCents: 0, previstoAcumCents: 0, realizadoCents: 1_000, realizadoAcumCents: 1_000 });
    expect(pontos[1]).toMatchObject({ previstoAcumCents: 10_000 + Math.round((20_000 * 2_333) / 10_000), realizadoAcumCents: 5_000 });
    expect(pontos[2]).toMatchObject({ realizadoCents: 500, realizadoAcumCents: 5_500 });
    // meses depois do corrente não têm realizado
    expect(pontos[3]).toMatchObject({ realizadoCents: null, realizadoAcumCents: null });
    expect(pontos[4].previstoAcumCents).toBe(30_000);
    expect(pontos.reduce((a, p) => a + p.previstoCents, 0)).toBe(30_000);
  });

  it("etapas sem datas (ou com fim antes do início) ficam fora do previsto e somam em semDatasCents", () => {
    const { pontos, semDatasCents } = desembolsoMensal(
      [
        { orcamentoCents: 5_000, inicio: null, fim: null },
        { orcamentoCents: 7_000, inicio: "2026-02-01", fim: null },
        { orcamentoCents: 3_000, inicio: "2026-03-10", fim: "2026-03-01" },
        { orcamentoCents: 10_000, inicio: "2026-02-01", fim: "2026-02-28" },
      ],
      new Map(),
      hoje,
    );
    expect(semDatasCents).toBe(15_000);
    expect(pontos).toHaveLength(1);
    expect(pontos[0]).toMatchObject({ mes: "2026-02", previstoCents: 10_000 });
  });

  it("sem datas e sem gasto não há pontos", () => {
    expect(desembolsoMensal([{ orcamentoCents: 5_000, inicio: null, fim: null }], new Map(), hoje)).toEqual({
      pontos: [],
      semDatasCents: 5_000,
    });
  });

  it("só realizado (sem datas) ainda desenha os meses do gasto", () => {
    const { pontos } = desembolsoMensal([], new Map([["2026-01", 100], ["2026-03", 200]]), hoje);
    expect(pontos.map((p) => [p.mes, p.previstoCents, p.realizadoCents, p.realizadoAcumCents])).toEqual([
      ["2026-01", 0, 100, 100],
      ["2026-02", 0, 0, 100],
      ["2026-03", 0, 200, 300],
    ]);
  });
});

describe("realizadoMensalDaObra", () => {
  it("tira a coluna de uma obra do mapa mês → obra", () => {
    const porMes = new Map([
      ["2026-01", new Map([["o1", 100], ["o2", 50]])],
      ["2026-02", new Map([["o2", 70]])],
    ]);
    expect([...realizadoMensalDaObra(porMes, "o1")]).toEqual([["2026-01", 100]]);
    expect([...realizadoMensalDaObra(porMes, "o3")]).toEqual([]);
  });
});
