import { describe, expect, it } from "vitest";
import {
  formatarData,
  formatarDataCurta,
  formatarMesAno,
  formatarPercentBp,
  formatarTempoRelativo,
  moedaParaCents,
} from "../format";

describe("moedaParaCents: ignora símbolos e preserva o sinal", () => {
  it("remove R$ e espaços", () => {
    expect(moedaParaCents("R$ 1.234,56")).toBe(123456);
    expect(moedaParaCents(" 7,5 ")).toBe(750);
  });
  it("mantém o sinal negativo", () => {
    expect(moedaParaCents("-10,50")).toBe(-1050);
  });
});

describe("formatos de data em pt-BR", () => {
  const d = new Date(2026, 2, 5, 12);
  it("formatarData", () => expect(formatarData(d)).toBe("05/03/2026"));
  it("formatarDataCurta", () => expect(formatarDataCurta(d)).toBe("05/03"));
  it("formatarMesAno", () => expect(formatarMesAno(d)).toBe("mar/26"));
  it("aceita string ISO", () => expect(formatarData("2026-03-05T12:00:00")).toBe("05/03/2026"));
});

describe("formatarPercentBp limita a uma casa decimal", () => {
  it("arredonda 33,34% para 33,3%", () => {
    expect(formatarPercentBp(3334)).toBe("33,3%");
    expect(formatarPercentBp(3366)).toBe("33,7%");
  });
});

describe("formatarTempoRelativo: limites de cada faixa", () => {
  const agora = new Date(2026, 5, 15, 12, 0, 0);
  const atras = (ms: number) => new Date(agora.getTime() - ms);
  const MIN = 60_000;
  const H = 60 * MIN;
  const DIA = 24 * H;

  it("menos de 1 minuto é 'agora'; 1 minuto já é 'há 1 min'", () => {
    expect(formatarTempoRelativo(atras(59_000), agora)).toBe("agora");
    expect(formatarTempoRelativo(atras(MIN), agora)).toBe("há 1 min");
  });
  it("59 min ainda é em minutos; 60 min vira horas", () => {
    expect(formatarTempoRelativo(atras(59 * MIN), agora)).toBe("há 59 min");
    expect(formatarTempoRelativo(atras(60 * MIN), agora)).toBe("há 1 h");
  });
  it("23 h ainda é em horas; 24 h vira 'ontem'", () => {
    expect(formatarTempoRelativo(atras(23 * H + 59 * MIN), agora)).toBe("há 23 h");
    expect(formatarTempoRelativo(atras(DIA), agora)).toBe("ontem");
  });
  it("de 2 a 30 dias em dias; acima disso, a data", () => {
    expect(formatarTempoRelativo(atras(2 * DIA), agora)).toBe("há 2 dias");
    expect(formatarTempoRelativo(atras(30 * DIA), agora)).toBe("há 30 dias");
    expect(formatarTempoRelativo(atras(31 * DIA), agora)).toBe(formatarData(atras(31 * DIA)));
  });
});
