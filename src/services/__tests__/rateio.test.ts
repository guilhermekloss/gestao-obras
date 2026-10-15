import { describe, it, expect } from "vitest";
import {
  validarRateio,
  dividirIgualmente,
  calcularTotalItem,
  custoRateado,
  BP_TOTAL,
} from "../rateio";

describe("validarRateio", () => {
  it("aceita rateio que soma 100%", () => {
    expect(validarRateio([{ fracaoBp: 6000 }, { fracaoBp: 4000 }]).ok).toBe(true);
  });

  it("rejeita rateio que não soma 100%", () => {
    const r = validarRateio([{ fracaoBp: 5000 }, { fracaoBp: 4000 }]);
    expect(r.ok).toBe(false);
    expect(r.somaBp).toBe(9000);
  });

  it("aceita 100% em uma única obra", () => {
    expect(validarRateio([{ fracaoBp: BP_TOTAL }]).ok).toBe(true);
  });
});

describe("dividirIgualmente", () => {
  it("2 obras → 50/50", () => {
    expect(dividirIgualmente(2)).toEqual([5000, 5000]);
  });

  it("3 obras → 33,34 / 33,33 / 33,33 somando 100%", () => {
    const bps = dividirIgualmente(3);
    expect(bps).toEqual([3334, 3333, 3333]);
    expect(bps.reduce((a, b) => a + b, 0)).toBe(BP_TOTAL);
  });

  it("6 obras somam 100% (caso real dos 6 lotes)", () => {
    expect(dividirIgualmente(6).reduce((a, b) => a + b, 0)).toBe(BP_TOTAL);
  });
});

describe("calcularTotalItem", () => {
  it("qtde × unitário − desconto", () => {
    expect(calcularTotalItem(10, 2550, 500)).toBe(25000);
  });

  it("qtde fracionada arredonda corretamente", () => {
    expect(calcularTotalItem(2.5, 333)).toBe(833);
  });
});

describe("custoRateado", () => {
  it("50% de R$ 100,00 = R$ 50,00", () => {
    expect(custoRateado(10000, 5000)).toBe(5000);
  });

  it("rateio de 1/3 arredonda para centavo mais próximo", () => {
    expect(custoRateado(10000, 3333)).toBe(3333);
  });
});
