import { describe, expect, it } from "vitest";
import { extrairCnos, formatarCno } from "../cno";

describe("formatarCno: entrada com outros separadores", () => {
  it("aplica a máscara sobre os dígitos, qualquer que seja o separador", () => {
    expect(formatarCno("90 000 12345 67")).toBe("90.000.12345/67");
  });

  it("sem 12 dígitos, devolve o texto original, não só os dígitos", () => {
    expect(formatarCno("12-3")).toBe("12-3");
  });
});

describe("extrairCnos: ordem entre rotulados e mascarados", () => {
  it("o mascarado sem rótulo que aparece antes vem antes", () => {
    expect(extrairCnos("Obra 90.000.12345/67, CNO 111111111111")).toEqual(["900001234567", "111111111111"]);
  });

  it("o rotulado que aparece antes vem antes, pela posição do número", () => {
    expect(extrairCnos("CNO 111111111111 90.000.12345/67")).toEqual(["111111111111", "900001234567"]);
  });
});
