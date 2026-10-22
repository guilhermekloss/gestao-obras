import { describe, it, expect } from "vitest";
import {
  agregarCurvasS,
  curvaS,
  desvioBp,
  idp,
  MARGEM_ATENCAO_BP,
  MARGEM_ATRASO_BP,
  ROTULO_SITUACAO,
  variacaoDias,
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
  unirFaixas,
  validarDatasEtapa,
  type EtapaPlano,
  type MedicaoPonto,
} from "../cronograma";

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

  it("conta dias inclusive", () => {
    expect(duracaoEmDias("2026-01-01", "2026-01-31")).toBe(31);
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
    expect(realizadoNaData([FUNDACAO, ESTRUTURA], medicoes, "2026-02-28")).toBe(4000);
  });

  it("ignora a ordem de entrada das medições", () => {
    expect(realizadoNaData([FUNDACAO, ESTRUTURA], [...medicoes].reverse(), "2026-02-28")).toBe(4000);
  });

  it("monta a curva S mensal com realizado nulo no futuro", () => {
    const curva = curvaS([FUNDACAO, ESTRUTURA], medicoes, "2026-02-25");
    expect(curva.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(curva[0]).toEqual({ mes: "2026-01", previstoBp: 2500, realizadoBp: 1500 });
    expect(curva[1].realizadoBp).toBe(4000);
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
  const hoje = "2026-01-16";

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
    // previsto em 16/01: 16 de 31 dias = 5161
    expect(situacaoEtapa(FUNDACAO, 5000, hoje)).toBe("EM_DIA");
    expect(situacaoEtapa(FUNDACAO, 6000, hoje)).toBe("EM_DIA");
  });

  it("atrasada quando o previsto supera o realizado além da margem", () => {
    expect(situacaoEtapa(FUNDACAO, 3000, hoje)).toBe("ATRASADA");
    expect(situacaoEtapa(FUNDACAO, 0, hoje)).toBe("ATRASADA");
  });

  it("atrasada quando o fim previsto passou sem 100%", () => {
    expect(situacaoEtapa(FUNDACAO, 9999, "2026-02-01")).toBe("ATRASADA");
  });
});

describe("situacaoEtapa: Atenção entre 5 e 10 p.p.", () => {
  // previsto exatamente 5000 em 15/01 (15 de 30 dias)
  const ETAPA = { inicioPrevisto: "2026-01-01", fimPrevisto: "2026-01-30" };
  const hoje = "2026-01-15";

  it("as margens são 5 e 10 p.p.", () => {
    expect(MARGEM_ATENCAO_BP).toBe(500);
    expect(MARGEM_ATRASO_BP).toBe(1000);
    expect(previstoEtapaNaData(ETAPA, hoje)).toBe(5000);
  });

  it("exatamente 5 p.p. atrás ainda está em dia", () => {
    expect(situacaoEtapa(ETAPA, 4500, hoje)).toBe("EM_DIA");
  });

  it("um pouco mais de 5 p.p. atrás entra em atenção", () => {
    expect(situacaoEtapa(ETAPA, 4499, hoje)).toBe("ATENCAO");
  });

  it("exatamente 10 p.p. atrás ainda é atenção", () => {
    expect(situacaoEtapa(ETAPA, 4000, hoje)).toBe("ATENCAO");
  });

  it("mais de 10 p.p. atrás é atrasada", () => {
    expect(situacaoEtapa(ETAPA, 3999, hoje)).toBe("ATRASADA");
  });

  it("não começou mas já devia estar entre 5 e 10 p.p.: atenção, não 'não iniciada'", () => {
    // 2 de 30 dias = 667
    expect(situacaoEtapa(ETAPA, 0, "2026-01-02")).toBe("ATENCAO");
    expect(situacaoEtapa(ETAPA, 0, "2026-01-01")).toBe("NAO_INICIADA");
  });

  it("margens configuráveis", () => {
    expect(situacaoEtapa(ETAPA, 4800, hoje, 1000, 100)).toBe("ATENCAO");
  });

  it("tem rótulo", () => {
    expect(ROTULO_SITUACAO.ATENCAO).toBe("Atenção");
  });
});

describe("desvioBp e idp", () => {
  it("desvio é realizado menos previsto", () => {
    expect(desvioBp(5000, 4200)).toBe(-800);
    expect(desvioBp(5000, 6000)).toBe(1000);
    expect(desvioBp(0, 0)).toBe(0);
  });

  it("IDP é a razão em base 10000", () => {
    expect(idp(4600, 5000)).toBe(9200);
    expect(idp(5000, 5000)).toBe(10000);
    expect(idp(6000, 5000)).toBe(12000);
    expect(idp(0, 5000)).toBe(0);
  });

  it("arredonda para o inteiro mais próximo", () => {
    expect(idp(1, 3)).toBe(3333);
    expect(idp(2, 3)).toBe(6667);
  });

  it("sem previsto não há IDP", () => {
    expect(idp(0, 0)).toBeNull();
    expect(idp(3000, 0)).toBeNull();
  });
});

describe("variacaoDias", () => {
  it("positivo quando a data foi para depois da linha de base", () => {
    expect(variacaoDias("2026-02-10", "2026-02-05")).toBe(5);
  });

  it("negativo quando adiantou, zero quando igual", () => {
    expect(variacaoDias("2026-01-30", "2026-02-02")).toBe(-3);
    expect(variacaoDias("2026-02-02", "2026-02-02")).toBe(0);
  });

  it("atravessa o ano e o fevereiro", () => {
    expect(variacaoDias("2026-03-01", "2025-12-31")).toBe(60);
  });

  it("sem uma das datas não há variação", () => {
    expect(variacaoDias(null, "2026-02-02")).toBeNull();
    expect(variacaoDias("2026-02-02", null)).toBeNull();
  });
});

describe("curvaS com linha de base", () => {
  // a estrutura escorregou um mês em relação à linha de base
  const BASE: EtapaPlano[] = [FUNDACAO, ESTRUTURA];
  const ATUAL: EtapaPlano[] = [FUNDACAO, { ...ESTRUTURA, inicioPrevisto: "2026-03-01", fimPrevisto: "2026-04-30" }];
  const medicoes: MedicaoPonto[] = [{ etapaId: "fund", data: "2026-01-31", percentBp: 10000 }];

  it("o previsto vem da linha de base, o realizado das medições", () => {
    const curva = curvaS(ATUAL, medicoes, "2026-02-28", undefined, BASE);
    const fev = curva.find((p) => p.mes === "2026-02")!;
    // base: fundação 100% (peso 25%) + estrutura 28/59 dias (peso 75%)
    expect(fev.previstoBp).toBe(previstoNaData(BASE, "2026-02-28"));
    expect(fev.previstoBp).not.toBe(previstoNaData(ATUAL, "2026-02-28"));
    expect(fev.realizadoBp).toBe(2500);
  });

  it("a faixa cobre as datas atuais e as da base", () => {
    const curva = curvaS(ATUAL, medicoes, "2026-02-28", undefined, BASE);
    expect(curva.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    // em abril a base já terminou
    expect(curva.at(-1)!.previstoBp).toBe(10000);
    // base que começava antes puxa o início da curva
    const baseCedo: EtapaPlano[] = [{ ...FUNDACAO, inicioPrevisto: "2025-12-01" }, ESTRUTURA];
    expect(curvaS(ATUAL, medicoes, "2026-02-28", undefined, baseCedo)[0].mes).toBe("2025-12");
  });

  it("sem base é a curva de sempre", () => {
    expect(curvaS(ATUAL, medicoes, "2026-02-28", undefined, null)).toEqual(curvaS(ATUAL, medicoes, "2026-02-28"));
  });

  it("faixa explícita continua valendo", () => {
    const curva = curvaS(ATUAL, medicoes, "2026-02-28", { de: "2026-01", ate: "2026-02" }, BASE);
    expect(curva.map((p) => p.mes)).toEqual(["2026-01", "2026-02"]);
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

  it("o eixo cobre também as datas da linha de base", () => {
    const base = [{ inicioPrevisto: "2025-12-10", fimPrevisto: "2026-01-20" }];
    const escala = escalaGantt([FUNDACAO], "2026-01-15", base)!;
    expect(escala.inicio).toBe("2025-12-01");
    expect(escala.fim).toBe("2026-01-31");
    expect(escala.meses.map((m) => m.mes)).toEqual(["2025-12", "2026-01"]);
  });

  it("linha de base que termina depois estende o fim", () => {
    const escala = escalaGantt([FUNDACAO], "2026-01-15", [{ inicioPrevisto: "2026-01-01", fimPrevisto: "2026-03-05" }])!;
    expect(escala.fim).toBe("2026-03-31");
  });

  it("só a linha de base com datas já monta o eixo", () => {
    const semDatas = { inicioPrevisto: null, fimPrevisto: null };
    expect(escalaGantt([semDatas], "2026-01-15", [FUNDACAO])!.inicio).toBe("2026-01-01");
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
