import { describe, expect, it } from "vitest";
import { encontrarValores } from "../normalizacao";

const valores = (texto: string) => encontrarValores(texto).map((v) => v.valor);

describe("encontrarValores: o que vem depois do valor", () => {
  it("vírgula, ponto, ponto e vírgula, dois-pontos e espaço depois do valor são pontuação", () => {
    for (const depois of [",", ", referente", ".", ". Referente", ";", ":", " referente", ""]) {
      expect(valores(`importância de R$ 900,00${depois}`)).toEqual([900]);
    }
  });

  it("vários valores separados por vírgula", () => {
    expect(valores("parcelas de R$ 10,00, R$ 20,00, R$ 30,00")).toEqual([10, 20, 30]);
    expect(valores("10,00, 20,00")).toEqual([10, 20]);
  });

  it("vírgula seguida de dígito continua o número: não é valor", () => {
    expect(valores("R$ 10,00,50")).toEqual([]);
    expect(valores("10,00,5")).toEqual([]);
  });

  it("letra ou dígito colado depois do valor não é valor", () => {
    expect(valores("R$ 10,00a")).toEqual([]);
    expect(valores("R$ 10,005")).toEqual([]);
    expect(valores("R$ 10,00X")).toEqual([]);
  });

  it("percentual não é valor", () => {
    expect(valores("alíquota 5,00%")).toEqual([]);
    expect(valores("alíquota 5,00 %")).toEqual([]);
    expect(valores("alíquota 5,00%, valor 8,00")).toEqual([8]);
  });
});
