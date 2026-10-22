import { describe, expect, it } from "vitest";
import {
  REGRAS,
  REGRAS_DO_SITE,
  ROTULO_REGRA,
  caminhoDeVarredura,
  contaParaRecidiva,
  duracaoDaRegra,
  limiteDaRegraAtingido,
  regraAtiva,
  type RegraAtiva,
} from "../protecao-ativa";

const agora = new Date("2026-10-23T12:00:00Z");
const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000);
const vezes = (n: number, m = 1) => Array.from({ length: n }, () => minAtras(m));

describe("limiteDaRegraAtingido", () => {
  it.each((Object.keys(REGRAS) as RegraAtiva[]).filter((r) => r !== "manual"))("%s: bloqueia exatamente no máximo dentro da janela", (regra) => {
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

describe("caminhoDeVarredura", () => {
  it.each([
    "/.env",
    "/app/.env.production",
    "/.git/config",
    "/wp-login.php",
    "/wp-admin/setup-config.php",
    "/xmlrpc.php",
    "/phpmyadmin/index.php",
    "/index.php",
    "/cgi-bin/luci",
    "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
    "/actuator/health",
    "/backup.sql.gz",
    "/%2eenv",
    "/.aws/credentials",
  ])("%s é robô", (caminho) => {
    expect(caminhoDeVarredura(caminho)).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/dashboard",
    "/obras/abc",
    "/notas/nova",
    "/cronograma/exportar",
    "/convite/abc.def",
    "/usuarios?aba=bloqueios",
    "/environment",
    "/pmanual",
    "/%E0%A4%A",
  ])("%s é do app", (caminho) => {
    expect(caminhoDeVarredura(caminho)).toBe(false);
  });
});

describe("recidiva e regras do site", () => {
  it("contam para a recidiva só as regras por IP, menos a própria recidiva", () => {
    expect(["login-ip", "convite", "sefaz", "varredura", "manual"].every(contaParaRecidiva)).toBe(true);
    expect(["login-email", "upload", "arquivos", "assistente", "leitura", "recidiva", "x"].some(contaParaRecidiva)).toBe(false);
  });

  it("varredura, recidiva e manual tiram o IP do site; o resto vale só no ponto da falha", () => {
    expect([...REGRAS_DO_SITE].sort()).toEqual(["manual", "recidiva", "varredura"]);
    for (const r of REGRAS_DO_SITE) expect(REGRAS[r].chave).toBe("ip");
  });

  it("bloqueio manual nunca dispara por contagem", () => {
    expect(limiteDaRegraAtingido("manual", Array.from({ length: 1000 }, () => minAtras(0)), agora)).toBe(false);
  });

  it("recidiva dura 24 h e 7 dias na repetição", () => {
    expect(duracaoDaRegra("recidiva", 0)).toBe(24 * 60 * 60_000);
    expect(duracaoDaRegra("recidiva", 4)).toBe(7 * 24 * 60 * 60_000);
  });
});
