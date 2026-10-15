import { describe, expect, it } from "vitest";
import { JANELA_MS, MAX_FALHAS_EMAIL, MAX_FALHAS_IP, chaveEmail, ipDoCliente, situacaoLogin } from "../protecao-login";

const agora = new Date("2026-10-15T12:00:00Z");
const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000);
const falha = (m: number) => ({ sucesso: false, criadoEm: minAtras(m) });
const sucesso = (m: number) => ({ sucesso: true, criadoEm: minAtras(m) });

describe("situacaoLogin", () => {
  it("libera abaixo do limite", () => {
    expect(situacaoLogin([falha(1), falha(2), falha(3), falha(4)], [], agora)).toEqual({ bloqueado: false });
  });

  it(`bloqueia o e-mail na ${MAX_FALHAS_EMAIL}ª falha da janela até a mais antiga sair dela`, () => {
    const r = situacaoLogin([falha(1), falha(2), falha(3), falha(4), falha(10)], [], agora);
    expect(r).toEqual({ bloqueado: true, motivo: "email", liberaEm: new Date(minAtras(10).getTime() + JANELA_MS) });
  });

  it("falhas fora da janela não contam", () => {
    expect(situacaoLogin([falha(1), falha(2), falha(3), falha(4), falha(16)], [], agora).bloqueado).toBe(false);
  });

  it("login certo zera a contagem", () => {
    expect(situacaoLogin([falha(1), falha(2), sucesso(3), falha(4), falha(5), falha(6)], [], agora).bloqueado).toBe(false);
  });

  it(`bloqueia o IP com ${MAX_FALHAS_IP} falhas na janela`, () => {
    const falhasIp = Array.from({ length: MAX_FALHAS_IP }, (_, i) => minAtras(i % 14));
    expect(situacaoLogin([], falhasIp, agora)).toMatchObject({ bloqueado: true, motivo: "ip" });
    expect(situacaoLogin([], falhasIp.slice(1), agora).bloqueado).toBe(false);
  });
});

describe("ipDoCliente", () => {
  it("usa o último IP (o que o Cloud Run acrescentou), ignorando o forjado pelo cliente", () => {
    expect(ipDoCliente("6.6.6.6, 200.1.2.3")).toBe("200.1.2.3");
    expect(ipDoCliente("200.1.2.3")).toBe("200.1.2.3");
  });
  it("com Load Balancer na frente, volta um salto", () => {
    expect(ipDoCliente("6.6.6.6, 200.1.2.3, 34.1.1.1", 2)).toBe("200.1.2.3");
  });
  it("sem cabeçalho, null", () => {
    expect(ipDoCliente(null)).toBeNull();
    expect(ipDoCliente(" , ")).toBeNull();
  });
});

describe("chaveEmail", () => {
  it("normaliza e limita", () => {
    expect(chaveEmail("  Joao@Obra.COM ")).toBe("joao@obra.com");
    expect(chaveEmail("a".repeat(500))).toHaveLength(254);
  });
});
