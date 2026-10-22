import { describe, expect, it } from "vitest";
import { REGRAS, ROTULO_REGRA, duracaoDaRegra, limiteDaRegraAtingido, regraAtiva, type RegraAtiva } from "../protecao-ativa";

const agora = new Date("2026-10-23T12:00:00Z");
const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000);
const vezes = (n: number, m = 1) => Array.from({ length: n }, () => minAtras(m));

describe("limiteDaRegraAtingido", () => {
  it.each(Object.keys(REGRAS) as RegraAtiva[])("%s: bloqueia exatamente no máximo dentro da janela", (regra) => {
    const { max } = REGRAS[regra];
    expect(limiteDaRegraAtingido(regra, vezes(max - 1), agora)).toBe(false);
    expect(limiteDaRegraAtingido(regra, vezes(max), agora)).toBe(true);
  });

  it("ocorrência na borda da janela ou antes dela não conta", () => {
    const janelaMin = REGRAS.convite.janelaMs / 60_000;
    const max = REGRAS.convite.max;
    expect(limiteDaRegraAtingido("convite", [...vezes(max - 1), minAtras(janelaMin)], agora)).toBe(false);
    expect(limiteDaRegraAtingido("convite", [...vezes(max - 1), minAtras(janelaMin - 0.01)], agora)).toBe(true);
  });

  it("o que veio antes do último bloqueio (ou da liberação) não conta de novo", () => {
    const max = REGRAS.upload.max;
    expect(limiteDaRegraAtingido("upload", vezes(max, 3), agora, minAtras(2))).toBe(false);
    expect(limiteDaRegraAtingido("upload", [...vezes(max - 1, 3), minAtras(1)], agora, minAtras(4))).toBe(true);
    expect(limiteDaRegraAtingido("upload", vezes(max, 3), agora, minAtras(3))).toBe(false);
  });
});

describe("duracaoDaRegra", () => {
  it("cresce na reincidência e para no último prazo", () => {
    expect([0, 1, 2, 3, 9].map((n) => duracaoDaRegra("convite", n) / 60_000)).toEqual([15, 60, 360, 1440, 1440]);
    expect(duracaoDaRegra("convite", -1)).toBe(15 * 60_000);
  });

  it("limites de uso (IA, OCR) não crescem: é custo, não ataque", () => {
    for (const regra of ["assistente", "leitura"] as const) {
      expect(REGRAS[regra].tipo).toBe("uso");
      expect(duracaoDaRegra(regra, 5)).toBe(duracaoDaRegra(regra, 0));
    }
  });
});

describe("regraAtiva e ROTULO_REGRA", () => {
  it("só aceita regras declaradas, sem herdar do protótipo", () => {
    expect(regraAtiva("upload")).toBe(true);
    expect(regraAtiva("login-email")).toBe(false);
    expect(regraAtiva("toString")).toBe(false);
  });

  it("tem rótulo para toda regra, inclusive as de login", () => {
    for (const regra of [...Object.keys(REGRAS), "login-email", "login-ip"]) expect(ROTULO_REGRA[regra]).toBeTruthy();
  });
});
