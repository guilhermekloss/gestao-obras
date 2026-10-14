import { describe, it, expect } from "vitest";
import {
  agregarCurvasS,
  curvaS,
  diaDoBanco,
  diaParaBanco,
  diaValido,
  duracaoEmDias,
  escalaGantt,
  faixaDaCurvaS,
  mesesEntre,
  pesosDasEtapas,
  posicaoNoGantt,
  previstoEtapaNaData,
  previstoNaData,
  realizadoNaData,
  situacaoEtapa,
  somarDias,
  unirFaixas,
  validarDatasEtapa,
  type EtapaPlano,
  type MedicaoPonto,
} from "../cronograma";

// Fundação (R$ 100k) em janeiro; Estrutura (R$ 300k) de fevereiro a março.
const FUNDACAO: EtapaPlano = {
  id: "fund",
  orcamentoCents: 10_000_000,
  inicioPrevisto: "2026-01-01",
  fimPrevisto: "2026-01-31",
};
const ESTRUTURA: EtapaPlano = {
  id: "estr",
  orcamentoCents: 30_000_000,
  inicioPrevisto: "2026-02-01",
  fimPrevisto: "2026-03-31",
};

describe("datas", () => {
  it("converte coluna @db.Date sem deslocar o dia", () => {
    expect(diaDoBanco(new Date("2026-03-01T00:00:00Z"))).toBe("2026-03-01");
    expect(diaDoBanco(diaParaBanco("2026-12-31"))).toBe("2026-12-31");
  });

  it("valida dias de calendário", () => {
    expect(diaValido("2026-02-28")).toBe(true);
    expect(diaValido("2026-02-30")).toBe(false);
    expect(diaValido("28/02/2026")).toBe(false);
  });

  it("lista meses atravessando o ano", () => {
    expect(mesesEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("conta dias inclusive e soma dias", () => {
    expect(duracaoEmDias("2026-01-01", "2026-01-31")).toBe(31);
    expect(somarDias("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("validarDatasEtapa", () => {
  it("aceita datas vazias, parciais e em ordem", () => {
    expect(validarDatasEtapa(null, null).ok).toBe(true);
    expect(validarDatasEtapa("2026-01-01", null).ok).toBe(true);
    expect(validarDatasEtapa("2026-01-01", "2026-01-01").ok).toBe(true);
  });

  it("rejeita fim anterior ao início", () => {
    const r = validarDatasEtapa("2026-02-01", "2026-01-31");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/anterior/);
  });

  it("rejeita data inválida", () => {
    expect(validarDatasEtapa("2026-13-01", null).ok).toBe(false);
  });
});

describe("previsto", () => {
  it("distribui a etapa linearmente pelos dias", () => {
    expect(previstoEtapaNaData(FUNDACAO, "2025-12-31")).toBe(0);
    expect(previstoEtapaNaData(FUNDACAO, "2026-01-01")).toBe(Math.round(10000 / 31));
    expect(previstoEtapaNaData(FUNDACAO, "2026-01-31")).toBe(10000);
    expect(previstoEtapaNaData(FUNDACAO, "2026-06-01")).toBe(10000);
  });

  it("etapa sem datas não avança", () => {
    expect(previstoEtapaNaData({ inicioPrevisto: null, fimPrevisto: "2026-01-31" }, "2026-02-01")).toBe(0);
  });

  it("pondera a obra pelo orçamento", () => {
    // fim de janeiro: Fundação 100% × 1/4 do peso
    expect(previstoNaData([FUNDACAO, ESTRUTURA], "2026-01-31")).toBe(2500);
    expect(previstoNaData([FUNDACAO, ESTRUTURA], "2026-03-31")).toBe(10000);
  });

  it("sem orçamento usa pesos iguais", () => {
    const a = { ...FUNDACAO, orcamentoCents: 0 };
    const b = { ...ESTRUTURA, orcamentoCents: 0 };
    expect(previstoNaData([a, b], "2026-01-31")).toBe(5000);
  });

  it("etapa sem datas pesa mas não avança", () => {
    const semDatas: EtapaPlano = { id: "x", orcamentoCents: 10_000_000, inicioPrevisto: null, fimPrevisto: null };
    expect(previstoNaData([FUNDACAO, semDatas], "2026-12-31")).toBe(5000);
  });
});

describe("realizado", () => {
  const medicoes: MedicaoPonto[] = [
    { etapaId: "fund", data: "2026-01-20", percentBp: 6000 },
    { etapaId: "fund", data: "2026-02-05", percentBp: 10000 },
    { etapaId: "estr", data: "2026-02-20", percentBp: 2000 },
  ];

  it("usa a última medição até a data", () => {
    expect(realizadoNaData([FUNDACAO, ESTRUTURA], medicoes, "2026-01-31")).toBe(1500);
    // fev: fund 100% (peso 1/4) + estr 20% (peso 3/4) = 25% + 15%
    expect(realizadoNaData([FUNDACAO, ESTRUTURA], medicoes, "2026-02-28")).toBe(4000);
  });

  it("ignora a ordem de entrada das medições", () => {
    expect(realizadoNaData([FUNDACAO, ESTRUTURA], [...medicoes].reverse(), "2026-02-28")).toBe(4000);
  });

  it("monta a curva S mensal com realizado nulo no futuro", () => {
    const curva = curvaS([FUNDACAO, ESTRUTURA], medicoes, "2026-02-25");
    expect(curva.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(curva[0]).toEqual({ mes: "2026-01", previstoBp: 2500, realizadoBp: 1500 });
    expect(curva[1].realizadoBp).toBe(4000); // mês corrente: até hoje
    expect(curva[2]).toEqual({ mes: "2026-03", previstoBp: 10000, realizadoBp: null });
  });

  it("sem datas não há curva", () => {
    const semDatas = { ...FUNDACAO, inicioPrevisto: null, fimPrevisto: null };
    expect(faixaDaCurvaS([semDatas], medicoes, "2026-02-25")).toBeNull();
    expect(curvaS([semDatas], medicoes, "2026-02-25")).toEqual([]);
  });
});

describe("faixaDaCurvaS", () => {
  it("estende até hoje enquanto a obra não termina", () => {
    expect(faixaDaCurvaS([FUNDACAO, ESTRUTURA], [], "2026-06-10")).toEqual({ de: "2026-01", ate: "2026-06" });
  });

  it("não estende quando a obra já chegou a 100%", () => {
    const medicoes: MedicaoPonto[] = [
      { etapaId: "fund", data: "2026-01-30", percentBp: 10000 },
      { etapaId: "estr", data: "2026-04-10", percentBp: 10000 },
    ];
    expect(faixaDaCurvaS([FUNDACAO, ESTRUTURA], medicoes, "2026-09-10")).toEqual({
      de: "2026-01",
      ate: "2026-04",
    });
  });

  it("começa na primeira medição se anterior ao plano", () => {
    const medicoes: MedicaoPonto[] = [{ etapaId: "fund", data: "2025-12-15", percentBp: 1000 }];
    expect(faixaDaCurvaS([FUNDACAO], medicoes, "2026-01-10")?.de).toBe("2025-12");
  });

  it("plano futuro não estende para trás", () => {
    expect(faixaDaCurvaS([FUNDACAO], [], "2025-06-01")).toEqual({ de: "2026-01", ate: "2026-01" });
  });
});

describe("agregarCurvasS", () => {
  it("pondera as obras pelo orçamento total", () => {
    const faixa = unirFaixas([{ de: "2026-01", ate: "2026-02" }, null, { de: "2026-02", ate: "2026-03" }]);
    expect(faixa).toEqual({ de: "2026-01", ate: "2026-03" });

    const agregada = agregarCurvasS([
      {
        orcamentoCents: 100,
        curva: [
          { mes: "2026-01", previstoBp: 10000, realizadoBp: 8000 },
          { mes: "2026-02", previstoBp: 10000, realizadoBp: null },
        ],
      },
      {
        orcamentoCents: 300,
        curva: [
          { mes: "2026-01", previstoBp: 0, realizadoBp: 0 },
          { mes: "2026-02", previstoBp: 5000, realizadoBp: null },
        ],
      },
    ]);
    expect(agregada).toEqual([
      { mes: "2026-01", previstoBp: 2500, realizadoBp: 2000 },
      { mes: "2026-02", previstoBp: 6250, realizadoBp: null },
    ]);
  });

  it("sem obras devolve vazio", () => {
    expect(agregarCurvasS([])).toEqual([]);
    expect(unirFaixas([null])).toBeNull();
  });
});

describe("situacaoEtapa", () => {
  const hoje = "2026-01-16"; // metade da Fundação (~52% previsto)

  it("concluída vence tudo, mesmo sem datas", () => {
    expect(situacaoEtapa({ inicioPrevisto: null, fimPrevisto: null }, 10000, hoje)).toBe("CONCLUIDA");
  });

  it("sem datas", () => {
    expect(situacaoEtapa({ inicioPrevisto: "2026-01-01", fimPrevisto: null }, 5000, hoje)).toBe("SEM_DATAS");
  });

  it("não iniciada antes do início", () => {
    expect(situacaoEtapa(ESTRUTURA, 0, hoje)).toBe("NAO_INICIADA");
  });

  it("em dia dentro da margem", () => {
    expect(situacaoEtapa(FUNDACAO, 4500, hoje)).toBe("EM_DIA");
  });

  it("atrasada quando o previsto supera o realizado além da margem", () => {
    expect(situacaoEtapa(FUNDACAO, 3000, hoje)).toBe("ATRASADA");
    expect(situacaoEtapa(FUNDACAO, 0, hoje)).toBe("ATRASADA");
  });

  it("atrasada quando o fim previsto passou sem 100%", () => {
    expect(situacaoEtapa(FUNDACAO, 9999, "2026-02-01")).toBe("ATRASADA");
  });
});

describe("Gantt", () => {
  it("monta o eixo em meses inteiros com o marcador de hoje", () => {
    const escala = escalaGantt([FUNDACAO, ESTRUTURA], "2026-02-15")!;
    expect(escala.inicio).toBe("2026-01-01");
    expect(escala.fim).toBe("2026-03-31");
    expect(escala.totalDias).toBe(90);
    expect(escala.meses.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(escala.meses[0].larguraPct).toBeCloseTo((31 / 90) * 100);
    expect(escala.hojePct).toBeCloseTo(((31 + 14.5) / 90) * 100);
  });

  it("estende o eixo até hoje quando a obra passou do plano", () => {
    const escala = escalaGantt([FUNDACAO], "2026-03-10")!;
    expect(escala.fim).toBe("2026-03-31");
    expect(escala.hojePct).not.toBeNull();
  });

  it("esconde o hoje quando muito fora do plano", () => {
    expect(escalaGantt([FUNDACAO], "2025-06-01")!.hojePct).toBeNull();
    expect(escalaGantt([FUNDACAO], "2028-06-01")!.fim).toBe("2026-01-31");
  });

  it("posiciona a barra da etapa", () => {
    const escala = escalaGantt([FUNDACAO, ESTRUTURA], "2026-02-15")!;
    const pos = posicaoNoGantt(escala, "2026-02-01", "2026-03-31");
    expect(pos.esquerdaPct).toBeCloseTo((31 / 90) * 100);
    expect(pos.larguraPct).toBeCloseTo((59 / 90) * 100);
  });

  it("sem datas não há eixo", () => {
    expect(escalaGantt([{ inicioPrevisto: null, fimPrevisto: null }], "2026-01-01")).toBeNull();
  });
});

describe("pesosDasEtapas", () => {
  it("pesa pelo orçamento ou igualmente", () => {
    expect(pesosDasEtapas([FUNDACAO, ESTRUTURA])).toEqual(new Map([["fund", 2500], ["estr", 7500]]));
    expect(
      pesosDasEtapas([
        { id: "a", orcamentoCents: 0 },
        { id: "b", orcamentoCents: 0 },
      ]),
    ).toEqual(new Map([["a", 5000], ["b", 5000]]));
  });
});
