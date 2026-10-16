import { describe, expect, it } from "vitest";
import { JANELA_MS, MAX_FALHAS_EMAIL, MAX_FALHAS_IP, ipDoCliente, situacaoLogin } from "../protecao-login";

const agora = new Date("2026-10-15T12:00:00Z");
const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000);
const falha = (m: number) => ({ sucesso: false, criadoEm: minAtras(m) });
const sucesso = (m: number) => ({ sucesso: true, criadoEm: minAtras(m) });

describe("situacaoLogin (e-mail): bordas da janela e do último sucesso", () => {
  it("falha exatamente na borda da janela de 15 min já não conta", () => {
    expect(situacaoLogin([falha(1), falha(2), falha(3), falha(4), falha(15)], [], agora).bloqueado).toBe(false);
  });

  it("falhas depois de um login certo voltam a contar", () => {
    const r = situacaoLogin([sucesso(10), falha(5), falha(4), falha(3), falha(2), falha(1)], [], agora);
    expect(r).toEqual({ bloqueado: true, motivo: "email", liberaEm: new Date(minAtras(5).getTime() + JANELA_MS) });
  });

  it("falhas anteriores ao login certo não contam, mesmo sendo muitas", () => {
    const antigas = [14, 13, 12, 11, 10, 9].map(falha);
    expect(situacaoLogin([...antigas, sucesso(5)], [], agora).bloqueado).toBe(false);
  });

  it("falha no mesmo instante do login certo não conta", () => {
    const r = situacaoLogin([sucesso(5), falha(5), falha(4), falha(3), falha(2), falha(1)], [], agora);
    expect(r.bloqueado).toBe(false);
  });

  it(`a liberação é a (${MAX_FALHAS_EMAIL}ª) falha mais recente + janela, mesmo com tentativas fora de ordem`, () => {
    const r = situacaoLogin([falha(1), falha(9), falha(3), falha(7), falha(5), falha(2)], [], agora);
    expect(r).toEqual({ bloqueado: true, motivo: "email", liberaEm: new Date(minAtras(7).getTime() + JANELA_MS) });
  });
});

describe("situacaoLogin (IP)", () => {
  const segundosAtras = (s: number) => new Date(agora.getTime() - s * 1000);

  it("falha exatamente na borda da janela não conta para o IP", () => {
    const falhas = [...Array.from({ length: MAX_FALHAS_IP - 1 }, (_, i) => segundosAtras(i + 1)), minAtras(15)];
    expect(situacaoLogin([], falhas, agora).bloqueado).toBe(false);
  });

  it("falhas fora da janela não somam com as recentes", () => {
    const falhas = [...Array.from({ length: MAX_FALHAS_IP - 1 }, (_, i) => segundosAtras(i + 1)), minAtras(16)];
    expect(situacaoLogin([], falhas, agora).bloqueado).toBe(false);
  });

  it("libera quando a falha que fecha a conta sai da janela, mesmo com a lista fora de ordem", () => {
    const falhas = Array.from({ length: MAX_FALHAS_IP + 1 }, (_, i) => segundosAtras((i + 1) * 20));
    expect(situacaoLogin([], falhas, agora)).toEqual({
      bloqueado: true,
      motivo: "ip",
      liberaEm: new Date(segundosAtras(MAX_FALHAS_IP * 20).getTime() + JANELA_MS),
    });
  });

  it("o bloqueio por e-mail tem prioridade sobre o de IP", () => {
    const ips = Array.from({ length: MAX_FALHAS_IP }, (_, i) => segundosAtras(i + 1));
    const emails = [1, 2, 3, 4, 5].map(falha);
    expect(situacaoLogin(emails, ips, agora)).toMatchObject({ bloqueado: true, motivo: "email" });
  });
});

describe("ipDoCliente: casos de borda", () => {
  it("ignora entradas vazias no fim da lista", () => {
    expect(ipDoCliente("1.1.1.1,  ")).toBe("1.1.1.1");
  });
  it("tira espaços em volta", () => {
    expect(ipDoCliente("6.6.6.6 ,   200.1.2.3  ")).toBe("200.1.2.3");
  });
  it("limita a 64 caracteres", () => {
    expect(ipDoCliente("x".repeat(100))).toBe("x".repeat(64));
  });
  it("saltos maiores que a lista usam o primeiro IP", () => {
    expect(ipDoCliente("1.1.1.1, 2.2.2.2", 5)).toBe("1.1.1.1");
  });
  it("saltos menores que 1 contam como 1", () => {
    expect(ipDoCliente("1.1.1.1, 2.2.2.2", 0)).toBe("2.2.2.2");
  });
});
