import { describe, expect, it } from "vitest";
import { problemaSenha, requisitosSenha } from "../senha";

const status = (senha: string, contexto = {}) =>
  Object.fromEntries(requisitosSenha(senha, contexto).map((r) => [r.chave, r.ok]));

describe("senha com poucos caracteres distintos", () => {
  it("dois caracteres alternados contam como repetição", () => {
    expect(problemaSenha("abababababab")).toMatch(/repetido/);
    expect(status("abababababab").comum).toBe(false);
  });
  it("três caracteres distintos já passam", () => {
    expect(problemaSenha("abcabcabcabc")).toBeNull();
  });
});

describe("senha contendo o e-mail", () => {
  it("usuário com exatamente 4 caracteres já é considerado", () => {
    expect(problemaSenha("joao-azul-casa", { email: "joao@obra.com" })).toMatch(/e-mail/);
  });
  it("usuário com 3 caracteres é curto demais para valer", () => {
    expect(problemaSenha("banana-verde-2026", { email: "ana@obra.com" })).toBeNull();
  });
});

describe("senha igual ao nome", () => {
  it("nome com pontuação ou números em volta ainda é o nome", () => {
    expect(status("maria1234", { nome: "Maria Souza" }).pessoal).toBe(false);
    expect(status("Souza", { nome: "Maria Souza" }).pessoal).toBe(false);
    expect(problemaSenha("maria-1234-xx", { nome: "Maria Souza" })).toBeNull();
  });
  it("parte do nome com 4 letras conta; com 3 não", () => {
    expect(status("jose", { nome: "Jose Silva" }).pessoal).toBe(false);
    expect(status("ana", { nome: "Ana Souza" }).pessoal).toBe(true);
  });
});

describe("requisitos: rótulos e limite de bytes", () => {
  it("rótulos exibidos ao usuário", () => {
    expect(requisitosSenha("x").map((r) => r.rotulo)).toEqual([
      "De 10 a 72 caracteres",
      "Não é uma senha óbvia (como 1234567890, senha123456 ou letras repetidas)",
      "Não contém o seu e-mail nem é o seu nome",
    ]);
  });
  it("72 bytes ainda cabe; 73 não", () => {
    expect(status("ab1".repeat(24)).tamanho).toBe(true);
    expect(status("ab1".repeat(24) + "x").tamanho).toBe(false);
  });
  it("9 caracteres não bastam; 10 sim", () => {
    expect(status("tijolo-az").tamanho).toBe(false);
    expect(status("tijolo-azu").tamanho).toBe(true);
  });
});
