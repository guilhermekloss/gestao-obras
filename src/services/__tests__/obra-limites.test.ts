import { describe, expect, it } from "vitest";
import { validarAvanco } from "../obra";

describe("validarAvanco: limites", () => {
  it("aceita 0% e 100% exatos, e permanecer no mesmo valor", () => {
    expect(validarAvanco(0, 0)).toEqual({ ok: true });
    expect(validarAvanco(10000, 5000)).toEqual({ ok: true });
    expect(validarAvanco(3000, 3000)).toEqual({ ok: true });
  });
  it("rejeita fora de 0–100% com a mensagem do intervalo", () => {
    const msg = "Avanço deve estar entre 0% e 100%";
    expect(validarAvanco(-1, 0)).toEqual({ ok: false, erro: msg });
    expect(validarAvanco(10001, 0)).toEqual({ ok: false, erro: msg });
  });
  it("rejeita regressão informando o avanço atual", () => {
    expect(validarAvanco(2999, 3000)).toEqual({ ok: false, erro: "Avanço não pode regredir (atual: 30%)" });
  });
});
