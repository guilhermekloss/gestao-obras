import { describe, expect, it } from "vitest";
import {
  DURACOES_BLOQUEIO_MS,
  MAX_FALHAS_EMAIL,
  MAX_FALHAS_IP,
  chaveEmail,
  duracaoDoBloqueio,
  faixasDeIp,
  ipConfiavel,
  ipDoCliente,
  ipValido,
  limiteAtingido,
  situacaoDoBloqueio,
} from "../protecao-login";

const agora = new Date("2026-10-15T12:00:00Z");
const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000);
const falha = (m: number) => ({ sucesso: false, criadoEm: minAtras(m) });
const sucesso = (m: number) => ({ sucesso: true, criadoEm: minAtras(m) });

describe("limiteAtingido", () => {
  it("libera abaixo do limite", () => {
    expect(limiteAtingido([falha(1), falha(2), falha(3), falha(4)], [], agora)).toBeNull();
  });

  it(`bloqueia o e-mail na ${MAX_FALHAS_EMAIL}ª falha da janela`, () => {
    const r = limiteAtingido([falha(1), falha(2), falha(3), falha(4), falha(10)], [], agora);
    expect(r).toBe("email");
  });

  it("falhas fora da janela não contam", () => {
    expect(limiteAtingido([falha(1), falha(2), falha(3), falha(4), falha(16)], [], agora)).toBeNull();
  });

  it("login certo zera a contagem", () => {
    expect(limiteAtingido([falha(1), falha(2), sucesso(3), falha(4), falha(5), falha(6)], [], agora)).toBeNull();
  });

  it(`bloqueia o IP com ${MAX_FALHAS_IP} falhas na janela`, () => {
    const falhasIp = Array.from({ length: MAX_FALHAS_IP }, (_, i) => minAtras(i % 14));
    expect(limiteAtingido([], falhasIp, agora)).toBe("ip");
    expect(limiteAtingido([], falhasIp.slice(1), agora)).toBeNull();
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

describe("limiteAtingido: corte no último bloqueio", () => {
  const cinco = [1, 2, 3, 4, 5].map(falha);

  it("falhas anteriores ao último bloqueio (ou à liberação) não contam de novo", () => {
    expect(limiteAtingido(cinco, [], agora, { email: minAtras(3) })).toBeNull();
    expect(limiteAtingido([...cinco, falha(0.5)], [], agora, { email: minAtras(5.5) })).toBe("email");
  });

  it("o corte de um não afeta o outro", () => {
    const ips = Array.from({ length: MAX_FALHAS_IP }, (_, i) => minAtras(i % 14));
    expect(limiteAtingido([], ips, agora, { email: minAtras(1) })).toBe("ip");
    expect(limiteAtingido(cinco, [], agora, { ip: minAtras(1) })).toBe("email");
    expect(limiteAtingido([], ips, agora, { ip: minAtras(1) })).toBeNull();
  });
});

describe("duracaoDoBloqueio", () => {
  it("cresce a cada reincidência e para no teto", () => {
    expect([0, 1, 2, 3, 9].map((n) => duracaoDoBloqueio("ip", n) / 60_000)).toEqual([15, 60, 360, 1440, 1440]);
    expect([0, 1, 2, 3, 9].map((n) => duracaoDoBloqueio("email", n) / 60_000)).toEqual([15, 30, 60, 60, 60]);
  });

  it("o primeiro bloqueio dura a janela de contagem e o e-mail nunca passa de 1 hora", () => {
    expect(duracaoDoBloqueio("email", 0)).toBe(15 * 60_000);
    expect(Math.max(...DURACOES_BLOQUEIO_MS.email)).toBe(60 * 60_000);
    expect(duracaoDoBloqueio("ip", -1)).toBe(15 * 60_000);
  });
});

describe("ipConfiavel", () => {
  const faixas = faixasDeIp("200.1.2.3, 189.10.0.0/16 2804:14c::/32,::1");

  it("aceita IP exato e faixas IPv4", () => {
    expect(ipConfiavel("200.1.2.3", faixas)).toBe(true);
    expect(ipConfiavel("200.1.2.4", faixas)).toBe(false);
    expect(ipConfiavel("189.10.255.1", faixas)).toBe(true);
    expect(ipConfiavel("189.11.0.1", faixas)).toBe(false);
  });

  it("aceita IPv6, inclusive abreviado", () => {
    expect(ipConfiavel("2804:14c:5b:1::abcd", faixas)).toBe(true);
    expect(ipConfiavel("2804:14d::1", faixas)).toBe(false);
    expect(ipConfiavel("0:0:0:0:0:0:0:1", faixas)).toBe(true);
  });

  it("IPv4 e IPv6 não se misturam e entrada inválida não libera", () => {
    expect(ipConfiavel("::ffff:200.1.2.3", faixas)).toBe(false);
    expect(ipConfiavel(null, faixas)).toBe(false);
    expect(ipConfiavel("lixo", faixas)).toBe(false);
    expect(ipConfiavel("200.1.2.3", [])).toBe(false);
  });
});

describe("faixasDeIp", () => {
  it("ignora entradas inválidas", () => {
    expect(faixasDeIp("")).toEqual([]);
    expect(faixasDeIp("999.1.1.1, 1.2.3.4/33, 1.2.3.4/x, 1::2::3, 1.2.3.4/8/9, 12345::")).toEqual([]);
  });

  it("prefixo 0 aceita qualquer IP da mesma família", () => {
    const todos = faixasDeIp("0.0.0.0/0");
    expect(ipConfiavel("8.8.8.8", todos)).toBe(true);
    expect(ipConfiavel("::1", todos)).toBe(false);
  });

  it("IPv6 com IPv4 no fim", () => {
    expect(ipConfiavel("::ffff:10.0.0.9", faixasDeIp("::ffff:10.0.0.0/120"))).toBe(true);
    expect(ipConfiavel("::ffff:10.0.1.9", faixasDeIp("::ffff:10.0.0.0/120"))).toBe(false);
  });
});

describe("situacaoDoBloqueio", () => {
  it("liberado vence o prazo; sem liberação, compara o fim com agora", () => {
    expect(situacaoDoBloqueio({ ate: minAtras(-5), liberadoEm: minAtras(1) }, agora)).toBe("liberado");
    expect(situacaoDoBloqueio({ ate: minAtras(-5), liberadoEm: null }, agora)).toBe("ativo");
    expect(situacaoDoBloqueio({ ate: agora, liberadoEm: null }, agora)).toBe("expirado");
  });
});

describe("ipValido", () => {
  it("aceita IPv4 e IPv6 e recusa faixa, nome e lixo", () => {
    expect(["203.0.113.7", "2804:14c::1", "::1"].every(ipValido)).toBe(true);
    expect(["203.0.113.0/24", "exemplo.com", "1.2.3", "256.1.1.1", ""].some(ipValido)).toBe(false);
  });
});
