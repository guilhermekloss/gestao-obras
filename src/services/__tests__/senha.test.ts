import { describe, expect, it } from "vitest";
import { SENHA_MINIMA, problemaSenha, requisitosSenha } from "../senha";

describe("problemaSenha", () => {
  it("aceita frase longa", () => {
    expect(problemaSenha("tijolo-e-cimento")).toBeNull();
    expect(problemaSenha("Concreto armado 2026!", { email: "joao@obra.com", nome: "João Silva" })).toBeNull();
  });
  it(`exige no mínimo ${SENHA_MINIMA} caracteres`, () => {
    expect(problemaSenha("curta123")).toMatch(/mínimo/);
  });
  it("recusa mais de 72 bytes (limite do bcrypt), contando acentos como 2 bytes", () => {
    expect(problemaSenha("ab1".repeat(24))).toBeNull();
    expect(problemaSenha("ab1".repeat(24) + "x")).toMatch(/máximo/);
    expect(problemaSenha("é".repeat(37))).toMatch(/máximo/);
  });
  it("recusa caractere repetido e senhas comuns, com ou sem acento e maiúsculas", () => {
    expect(problemaSenha("aaaaaaaaaaaa")).toMatch(/repetido/);
    expect(problemaSenha("1234567890")).toMatch(/comum/);
    expect(problemaSenha("Gestão de Obras")).toMatch(/comum/);
    expect(problemaSenha("Admin@12345")).toMatch(/comum/);
  });
  it("recusa senha com o e-mail ou igual ao nome", () => {
    expect(problemaSenha("joaosilva2026", { email: "joaosilva@obra.com" })).toMatch(/e-mail/);
    expect(problemaSenha("Cavalcanti", { nome: "Maria Cavalcanti" })).toMatch(/nome/);
    expect(problemaSenha("a casa da Maria é azul", { nome: "Maria Cavalcanti" })).toBeNull();
  });
});

describe("requisitosSenha", () => {
  const status = (senha: string, contexto = {}) =>
    Object.fromEntries(requisitosSenha(senha, contexto).map((r) => [r.chave, r.ok]));

  it("nada marcado com o campo vazio", () => {
    expect(status("")).toEqual({ tamanho: false, comum: false, pessoal: false });
  });
  it("marca cada regra conforme a senha digitada", () => {
    expect(status("curta")).toEqual({ tamanho: false, comum: true, pessoal: true });
    expect(status("1234567890")).toEqual({ tamanho: true, comum: false, pessoal: true });
    expect(status("joaosilva2026", { email: "joaosilva@obra.com" })).toEqual({ tamanho: true, comum: true, pessoal: false });
    expect(status("tijolo azul na janela")).toEqual({ tamanho: true, comum: true, pessoal: true });
  });
  it("concorda com problemaSenha", () => {
    for (const senha of ["", "curta", "1234567890", "aaaaaaaaaaaa", "Gestão de Obras", "tijolo azul na janela", "ab1".repeat(25)]) {
      const tudoOk = requisitosSenha(senha, { email: "maria@obra.com", nome: "Maria Souza" }).every((r) => r.ok);
      expect(tudoOk, senha).toBe(problemaSenha(senha, { email: "maria@obra.com", nome: "Maria Souza" }) === null);
    }
  });
});
