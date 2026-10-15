import { describe, expect, it } from "vitest";
import { SENHA_MINIMA, problemaSenha } from "../senha";

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
    // parte do nome dentro de uma frase longa é aceita
    expect(problemaSenha("a casa da Maria é azul", { nome: "Maria Cavalcanti" })).toBeNull();
  });
});
