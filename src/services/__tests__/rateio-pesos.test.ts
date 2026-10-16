import { describe, expect, it } from "vitest";
import { BP_TOTAL, distribuirBpPorPeso, somaItens } from "../rateio";

describe("distribuirBpPorPeso", () => {
  it("divide proporcionalmente aos pesos", () => {
    expect(distribuirBpPorPeso([1, 1])).toEqual([5000, 5000]);
    expect(distribuirBpPorPeso([3, 1])).toEqual([7500, 2500]);
    expect(distribuirBpPorPeso([200, 600, 200])).toEqual([2000, 6000, 2000]);
  });
  it("sempre soma 100%, com o resto do arredondamento na primeira obra", () => {
    expect(distribuirBpPorPeso([1, 1, 1])).toEqual([3334, 3333, 3333]);
    const f = distribuirBpPorPeso([123, 457, 89, 1]);
    expect(f.reduce((a, b) => a + b, 0)).toBe(BP_TOTAL);
  });
  it("quando o arredondamento passa de 100%, a primeira obra cede a diferença", () => {
    // 1/6 arredonda para 1667 duas vezes e 4/6 para 6667: soma 10001, a primeira fica com 1666
    expect(distribuirBpPorPeso([1, 1, 4])).toEqual([1666, 1667, 6667]);
    expect(distribuirBpPorPeso([2, 1])).toEqual([6667, 3333]);
  });
  it("uma obra só fica com tudo", () => {
    expect(distribuirBpPorPeso([42])).toEqual([BP_TOTAL]);
  });
  it("recusa lista vazia, com mensagem", () => {
    expect(() => distribuirBpPorPeso([])).toThrow("Distribuição exige ao menos 1 peso");
  });
});

describe("somaItens", () => {
  it("soma o total de cada item (quantidade × unitário − desconto)", () => {
    expect(
      somaItens([
        { qtde: 2, unitCents: 1000 },
        { qtde: 1.5, unitCents: 1001, descontoCents: 100 },
        { qtde: 1, unitCents: 500, descontoCents: 0 },
      ]),
    ).toBe(2000 + (Math.round(1.5 * 1001) - 100) + 500);
  });
  it("lista vazia soma zero", () => {
    expect(somaItens([])).toBe(0);
  });
});
