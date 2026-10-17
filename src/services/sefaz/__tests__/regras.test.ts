import { describe, expect, it } from "vitest";
import {
  ESPERA_APOS_FALHA_MS,
  ESPERA_BLOQUEIO_MS,
  ESPERA_FIM_DA_FILA_MS,
  avaliarResposta,
  cienciaAceita,
  compararNsu,
  normalizarNsu,
  podeConsultar,
} from "../regras";

const AGORA = new Date("2026-10-17T13:00:00Z");
const depois = (ms: number) => new Date(AGORA.getTime() + ms);

describe("normalizarNsu / compararNsu", () => {
  it("completa com zeros até 15 dígitos e ignora o que não é dígito", () => {
    expect(normalizarNsu("123")).toBe("000000000000123");
    expect(normalizarNsu(" 000000000000123 ")).toBe("000000000000123");
    expect(normalizarNsu(undefined)).toBe("000000000000000");
    expect(normalizarNsu("")).toBe("000000000000000");
  });

  it("compara pelo valor, não pelo texto", () => {
    expect(compararNsu("9", "000000000000010")).toBe(-1);
    expect(compararNsu("000000000000010", "10")).toBe(0);
    expect(compararNsu("999999999999999", "1")).toBe(1);
  });
});

describe("podeConsultar", () => {
  it("libera quando não há janela nem bloqueio", () => {
    expect(podeConsultar({ proximaConsultaEm: null, bloqueadoAte: null }, AGORA)).toEqual({ pode: true });
  });

  it("libera quando a janela já passou", () => {
    const passado = new Date(AGORA.getTime() - 1);
    expect(podeConsultar({ proximaConsultaEm: passado, bloqueadoAte: passado }, AGORA)).toEqual({ pode: true });
  });

  it("segura até o fim da janela de 1 h", () => {
    const ate = depois(10 * 60 * 1000);
    expect(podeConsultar({ proximaConsultaEm: ate, bloqueadoAte: null }, AGORA)).toEqual({
      pode: false,
      motivo: "AGUARDANDO",
      ate,
    });
  });

  it("bloqueio tem precedência sobre a janela", () => {
    const janela = depois(5 * 60 * 1000);
    const bloqueio = depois(30 * 60 * 1000);
    expect(podeConsultar({ proximaConsultaEm: janela, bloqueadoAte: bloqueio }, AGORA)).toEqual({
      pode: false,
      motivo: "BLOQUEADO",
      ate: bloqueio,
    });
  });

  it("no instante exato do fim da janela já pode", () => {
    expect(podeConsultar({ proximaConsultaEm: AGORA, bloqueadoAte: AGORA }, AGORA).pode).toBe(true);
  });
});

describe("avaliarResposta", () => {
  it("138 com fila restante: avança e continua no mesmo ciclo", () => {
    expect(avaliarResposta({ cStat: "138", ultNsu: "50", maxNsu: "120" }, AGORA)).toEqual({
      avancar: true,
      continuar: true,
      proximaConsultaEm: null,
      bloqueadoAte: null,
      desfecho: "OK",
    });
  });

  it("138 chegando ao fim da fila (ultNSU == maxNSU): avança e espera 1 h", () => {
    expect(avaliarResposta({ cStat: "138", ultNsu: "120", maxNsu: "000000000000120" }, AGORA)).toEqual({
      avancar: true,
      continuar: false,
      proximaConsultaEm: depois(ESPERA_FIM_DA_FILA_MS),
      bloqueadoAte: null,
      desfecho: "OK",
    });
  });

  it("137 (nada novo): guarda o NSU devolvido e espera 1 h", () => {
    const a = avaliarResposta({ cStat: "137", ultNsu: "120", maxNsu: "120" }, AGORA);
    expect(a.avancar).toBe(true);
    expect(a.continuar).toBe(false);
    expect(a.proximaConsultaEm).toEqual(depois(ESPERA_FIM_DA_FILA_MS));
    expect(a.desfecho).toBe("OK");
  });

  it("656 (consumo indevido): não mexe no NSU e espera o bloqueio passar", () => {
    expect(avaliarResposta({ cStat: "656", ultNsu: "0", maxNsu: "0" }, AGORA)).toEqual({
      avancar: false,
      continuar: false,
      proximaConsultaEm: depois(ESPERA_BLOQUEIO_MS),
      bloqueadoAte: depois(ESPERA_BLOQUEIO_MS),
      desfecho: "BLOQUEADA",
    });
  });

  it("outra rejeição: não avança e não insiste antes de 1 h", () => {
    expect(avaliarResposta({ cStat: "593", ultNsu: "0", maxNsu: "0" }, AGORA)).toEqual({
      avancar: false,
      continuar: false,
      proximaConsultaEm: depois(ESPERA_FIM_DA_FILA_MS),
      bloqueadoAte: null,
      desfecho: "REJEITADA",
    });
  });

  it("depois de uma falha espera só 10 min (não é regra da Sefaz, é para não insistir)", () => {
    expect(ESPERA_APOS_FALHA_MS).toBe(10 * 60 * 1000);
  });

  it("as esperas passam de 1 h (a regra é 1 h cheia)", () => {
    expect(ESPERA_FIM_DA_FILA_MS).toBeGreaterThan(60 * 60 * 1000);
    expect(ESPERA_BLOQUEIO_MS).toBeGreaterThan(60 * 60 * 1000);
  });
});

describe("cienciaAceita", () => {
  it("135, 136 e 573 contam como Ciência feita", () => {
    expect(["135", "136", "573"].every(cienciaAceita)).toBe(true);
  });

  it("rejeições não contam", () => {
    expect(["596", "494", "128", ""].some(cienciaAceita)).toBe(false);
  });
});
