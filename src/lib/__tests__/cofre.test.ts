import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chaveDoCofre, cifrar, decifrar } from "../cofre";

const CHAVE = randomBytes(32);

describe("cofre", () => {
  it("cifra e decifra; o texto não aparece no cifrado e cada cifragem é diferente", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
    const a = cifrar(pem, CHAVE);
    const b = cifrar(pem, CHAVE);
    expect(decifrar(a, CHAVE)).toBe(pem);
    expect(Buffer.from(a).toString("utf8")).not.toContain("PRIVATE KEY");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("chave errada ou conteúdo adulterado não decifram", () => {
    const c = cifrar("segredo", CHAVE);
    expect(() => decifrar(c, randomBytes(32))).toThrow();
    const adulterado = Buffer.from(c);
    adulterado[adulterado.length - 1] ^= 1;
    expect(() => decifrar(adulterado, CHAVE)).toThrow();
    expect(() => decifrar(Buffer.from([9, 9, 9]), CHAVE)).toThrow("Conteúdo cifrado inválido.");
  });

  it("CHAVE_COFRE em base64 com 32 bytes; em produção ela é obrigatória", () => {
    const b64 = CHAVE.toString("base64");
    expect(chaveDoCofre({ CHAVE_COFRE: b64 }).equals(CHAVE)).toBe(true);
    expect(() => chaveDoCofre({ CHAVE_COFRE: randomBytes(16).toString("base64") })).toThrow("32 bytes");
    expect(() => chaveDoCofre({ NODE_ENV: "production", AUTH_SECRET: "x" })).toThrow("CHAVE_COFRE não configurada.");
  });

  it("fora de produção, sem CHAVE_COFRE, deriva uma chave estável do AUTH_SECRET", () => {
    const a = chaveDoCofre({ NODE_ENV: "test", AUTH_SECRET: "segredo-do-ci" });
    expect(a).toHaveLength(32);
    expect(chaveDoCofre({ NODE_ENV: "test", AUTH_SECRET: "segredo-do-ci" }).equals(a)).toBe(true);
    expect(chaveDoCofre({ NODE_ENV: "test", AUTH_SECRET: "outro" }).equals(a)).toBe(false);
  });
});
