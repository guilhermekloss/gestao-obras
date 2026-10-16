import { describe, expect, it } from "vitest";
import {
  centsParaEditavel,
  chaveMes,
  rotuloChaveMes,
  dataParaInput,
  formatarMoeda,
  formatarMoedaAbreviada,
  formatarPercentBp,
  formatarTempoRelativo,
  inputParaData,
  moedaParaCents,
  percentBpParaEditavel,
  percentEditavelParaBp,
} from "../format";

describe("formatarMoeda / moedaParaCents", () => {
  it("formata centavos como moeda BR", () => {
    // o espaço depois de "R$" é U+00A0, não espaço comum
    expect(formatarMoeda(123456)).toBe("R$ 1.234,56");
    expect(formatarMoeda(0)).toBe("R$ 0,00");
  });

  it("converte string BR (com separador de milhar) para centavos", () => {
    expect(moedaParaCents("1.234,56")).toBe(123456);
    expect(moedaParaCents("30,00")).toBe(3000);
    expect(moedaParaCents("30")).toBe(3000);
  });

  it("retorna 0 para string inválida ou vazia", () => {
    expect(moedaParaCents("")).toBe(0);
    expect(moedaParaCents("abc")).toBe(0);
  });

  it("centsParaEditavel é o inverso de moedaParaCents (sem separador de milhar)", () => {
    for (const cents of [0, 3000, 123456, 99, 1]) {
      expect(moedaParaCents(centsParaEditavel(cents))).toBe(cents);
    }
    expect(centsParaEditavel(123456)).toBe("1234,56");
    expect(centsParaEditavel(0)).toBe("0,00");
  });
});

describe("formatarPercentBp / percentBpParaEditavel / percentEditavelParaBp", () => {
  it("formata bp para exibição com 1 casa", () => {
    expect(formatarPercentBp(2550)).toBe("25,5%");
    expect(formatarPercentBp(10000)).toBe("100%");
  });

  it("percentBpParaEditavel preserva a precisão total de bp (2 casas)", () => {
    expect(percentBpParaEditavel(3334)).toBe("33,34");
    expect(percentBpParaEditavel(10000)).toBe("100,00");
  });

  it("percentEditavelParaBp é o inverso exato de percentBpParaEditavel", () => {
    for (const bp of [0, 3334, 3333, 10000, 1, 9999]) {
      expect(percentEditavelParaBp(percentBpParaEditavel(bp))).toBe(bp);
    }
  });

  it("percentEditavelParaBp retorna null para entrada inválida", () => {
    expect(percentEditavelParaBp("abc")).toBeNull();
    expect(percentEditavelParaBp("")).toBeNull();
  });

  it("percentEditavelParaBp aceita vírgula decimal", () => {
    expect(percentEditavelParaBp("33,34")).toBe(3334);
    expect(percentEditavelParaBp("100")).toBe(10000);
  });
});

describe("dataParaInput / inputParaData", () => {
  it("dataParaInput usa componentes locais, não UTC", () => {
    const meiaNoiteLocal = new Date(2026, 2, 15, 23, 30);
    expect(dataParaInput(meiaNoiteLocal)).toBe("2026-03-15");
  });

  it("dataParaInput preenche zero à esquerda", () => {
    expect(dataParaInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("inputParaData fixa ao meio-dia local (evita virar de dia ao converter para UTC)", () => {
    const d = inputParaData("2026-01-31");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(12);
  });

  it("dataParaInput e inputParaData fazem round-trip para qualquer fuso do dia", () => {
    for (const iso of ["2026-01-01", "2026-02-28", "2026-12-31"]) {
      expect(dataParaInput(inputParaData(iso))).toBe(iso);
    }
  });
});

describe("formatarTempoRelativo", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  const antes = (ms: number) => new Date(agora.getTime() - ms);
  it("texto curto até 30 dias, depois a data", () => {
    expect(formatarTempoRelativo(antes(10_000), agora)).toBe("agora");
    expect(formatarTempoRelativo(antes(5 * 60_000), agora)).toBe("há 5 min");
    expect(formatarTempoRelativo(antes(3 * 3_600_000), agora)).toBe("há 3 h");
    expect(formatarTempoRelativo(antes(30 * 3_600_000), agora)).toBe("ontem");
    expect(formatarTempoRelativo(antes(4 * 86_400_000), agora)).toBe("há 4 dias");
    expect(formatarTempoRelativo(antes(45 * 86_400_000), agora)).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });
});

describe("chaveMes e rotuloChaveMes", () => {
  it("chaveMes usa o mês local, com zero à esquerda", () => {
    expect(chaveMes(new Date(2026, 0, 31, 23, 59))).toBe("2026-01");
    expect(chaveMes(new Date(2026, 9, 1))).toBe("2026-10");
  });
  it("rotuloChaveMes abrevia o mês e o ano", () => {
    expect(rotuloChaveMes("2026-10")).toBe("out/26");
    expect(rotuloChaveMes("2027-01")).toBe("jan/27");
  });
});

describe("formatarMoedaAbreviada", () => {
  it("abrevia em mil e mi, com no máximo uma casa decimal", () => {
    expect(formatarMoedaAbreviada(0)).toBe("R$\u00a00");
    expect(formatarMoedaAbreviada(85_000)).toBe("R$\u00a0850");
    expect(formatarMoedaAbreviada(4_820_000)).toBe("R$\u00a048,2\u00a0mil");
    expect(formatarMoedaAbreviada(12_000_000)).toBe("R$\u00a0120\u00a0mil");
    expect(formatarMoedaAbreviada(130_000_000)).toBe("R$\u00a01,3\u00a0mi");
  });

  it("troca de unidade exatamente em R$ 1.000 e R$ 1.000.000", () => {
    expect(formatarMoedaAbreviada(99_900)).toBe("R$\u00a0999");
    expect(formatarMoedaAbreviada(100_000)).toBe("R$\u00a01\u00a0mil");
    expect(formatarMoedaAbreviada(100_000_000)).toBe("R$\u00a01\u00a0mi");
  });

  it("mantém o sinal de valores negativos", () => {
    expect(formatarMoedaAbreviada(-4_820_000)).toBe("-R$\u00a048,2\u00a0mil");
  });
});
