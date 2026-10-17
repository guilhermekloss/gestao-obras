import { describe, expect, it } from "vitest";
import { lerCertificadoPem } from "../certificado";
import { pfxParaPem, prepararCertificado } from "../pfx";
import { gerarPfxDeTeste } from "./certificado-teste";
import { CNPJ_EMPRESA } from "./respostas";

describe("pfxParaPem", () => {
  it("converte o .pfx com a senha certa em PEM legível (chave + certificado)", async () => {
    const r = await pfxParaPem(gerarPfxDeTeste({ senha: "segredo" }), "segredo");
    if (!r.ok) throw new Error(r.erro);
    expect(lerCertificadoPem(r.pem)).toMatchObject({ ok: true, certificado: { cnpj: CNPJ_EMPRESA } });
  });

  it("abre .pfx com cifras antigas (padrão das ACs brasileiras)", async () => {
    const r = await pfxParaPem(gerarPfxDeTeste({ senha: "segredo", legado: true }), "segredo");
    expect(r.ok).toBe(true);
  });

  it("senha errada ou arquivo que não é .pfx: mensagem clara, sem detalhe do openssl", async () => {
    const errada = await pfxParaPem(gerarPfxDeTeste({ senha: "segredo" }), "outra");
    expect(errada).toEqual({ ok: false, erro: expect.stringMatching(/^Não foi possível abrir o certificado/) });
    expect((await pfxParaPem(Buffer.from("não sou um pfx"), "x")).ok).toBe(false);
    expect((await pfxParaPem(Buffer.alloc(0), "x")).ok).toBe(false);
  });

  it("a senha com caracteres especiais vai inteira (não passa pela linha de comando)", async () => {
    const senha = `a b"c'$d;e`;
    expect((await pfxParaPem(gerarPfxDeTeste({ senha }), senha)).ok).toBe(true);
  });
});

describe("prepararCertificado", () => {
  it("aceita o certificado da própria empresa, inclusive de filial (mesma raiz)", async () => {
    const r = await prepararCertificado(gerarPfxDeTeste({ senha: "s" }), "s", "11.222.333/0002-62");
    if (!r.ok) throw new Error(r.erro);
    expect(r.certificado).toMatchObject({ cnpj: CNPJ_EMPRESA, titular: `CONSTRUTORA TESTE LTDA:${CNPJ_EMPRESA}` });
    expect(r.certificado.pem).toContain("PRIVATE KEY");
  });

  it("recusa certificado de outra empresa", async () => {
    const r = await prepararCertificado(gerarPfxDeTeste({ senha: "s", cnpj: "99888777000166" }), "s", CNPJ_EMPRESA);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("de outra empresa") });
  });

  it("recusa certificado vencido", async () => {
    const r = await prepararCertificado(gerarPfxDeTeste({ senha: "s" }), "s", CNPJ_EMPRESA, new Date(Date.now() + 2 * 365 * 86_400_000));
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/^Este certificado venceu em/) });
  });
});
