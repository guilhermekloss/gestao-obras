import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chavesDoCofre, cifrar, decifrar } from "../cofre";

const CHAVE = randomBytes(32);
const COM_COFRE = { 1: CHAVE };

describe("cofre", () => {
  it("cifra e decifra; o texto não aparece no cifrado e cada cifragem é diferente", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
    const a = cifrar(pem, COM_COFRE);
    const b = cifrar(pem, COM_COFRE);
    expect(decifrar(a, COM_COFRE)).toBe(pem);
    expect(Buffer.from(a).toString("utf8")).not.toContain("PRIVATE KEY");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("chave errada ou conteúdo adulterado não decifram", () => {
    const c = cifrar("segredo", COM_COFRE);
    expect(() => decifrar(c, { 1: randomBytes(32) })).toThrow();
    const adulterado = Buffer.from(c);
    adulterado[adulterado.length - 1] ^= 1;
    expect(() => decifrar(adulterado, COM_COFRE)).toThrow();
    expect(() => decifrar(Buffer.from([9, 9, 9]), COM_COFRE)).toThrow("Conteúdo cifrado inválido.");
  });

  it("sem CHAVE_COFRE, cifra com a chave derivada do AUTH_SECRET (também em produção)", () => {
    const env = { NODE_ENV: "production", AUTH_SECRET: "segredo-da-instalacao" };
    const c = cifrar("certificado", chavesDoCofre(env));
    expect(c[0]).toBe(2);
    expect(decifrar(c, chavesDoCofre(env))).toBe("certificado");
  });

  it("criar a CHAVE_COFRE depois não perde o que já foi cifrado com a chave derivada", () => {
    const antes = { AUTH_SECRET: "segredo-da-instalacao" };
    const depois = { ...antes, CHAVE_COFRE: CHAVE.toString("base64") };
    const antigo = cifrar("certificado antigo", chavesDoCofre(antes));
    const novo = cifrar("certificado novo", chavesDoCofre(depois));
    expect(novo[0]).toBe(1);
    expect(decifrar(antigo, chavesDoCofre(depois))).toBe("certificado antigo");
    expect(decifrar(novo, chavesDoCofre(depois))).toBe("certificado novo");
  });

  it("trocar o AUTH_SECRET torna ilegível o que dependia dele", () => {
    const c = cifrar("x", chavesDoCofre({ AUTH_SECRET: "um" }));
    expect(() => decifrar(c, chavesDoCofre({ AUTH_SECRET: "outro" }))).toThrow();
  });

  it("CHAVE_COFRE precisa ter 32 bytes; sem chave nenhuma, não cifra", () => {
    expect(() => chavesDoCofre({ CHAVE_COFRE: randomBytes(16).toString("base64") })).toThrow("32 bytes");
    expect(() => cifrar("x", chavesDoCofre({}))).toThrow("Sem chave para cifrar");
    expect(() => decifrar(cifrar("x", COM_COFRE), {})).toThrow("CHAVE_COFRE não configurada.");
  });
});
