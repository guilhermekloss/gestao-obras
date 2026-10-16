import { describe, expect, it } from "vitest";
import { normalizarEfetivo, permissaoRdo, validarEfetivo, validarEquipamentos } from "../rdo";

describe("normalizarEfetivo: entradas sujas", () => {
  it("ignora itens que não são objetos, sem estourar", () => {
    expect(normalizarEfetivo([null, undefined, 5, "x", { funcao: "Pedreiro", qtd: 2 }])).toEqual([{ funcao: "Pedreiro", qtd: 2 }]);
  });
  it("aceita quantidade numérica em texto, trunca decimais e descarta zero, negativo e lixo", () => {
    expect(
      normalizarEfetivo([
        { funcao: "A", qtd: "3" },
        { funcao: "B", qtd: 2.9 },
        { funcao: "C", qtd: 0.5 },
        { funcao: "D", qtd: -2 },
        { funcao: "E", qtd: "abc" },
        { funcao: "F", qtd: Infinity },
        { funcao: "G" },
      ]),
    ).toEqual([
      { funcao: "A", qtd: 3 },
      { funcao: "B", qtd: 2 },
    ]);
  });
  it("junta nomes iguais sem acento/caixa/espaços extras, mantendo o primeiro nome", () => {
    expect(
      normalizarEfetivo([
        { funcao: "  Armação ", qtd: 1 },
        { funcao: "armacao", qtd: 2 },
        { funcao: "ARMAÇÃO", qtd: 4 },
      ]),
    ).toEqual([{ funcao: "Armação", qtd: 7 }]);
    expect(normalizarEfetivo([{ funcao: "Meio   Oficial", qtd: 1 }])).toEqual([{ funcao: "Meio Oficial", qtd: 1 }]);
  });
  it("função que não é texto é descartada; entrada que não é lista vira vazio", () => {
    expect(normalizarEfetivo([{ funcao: 5, qtd: 1 }])).toEqual([]);
    expect(normalizarEfetivo("x")).toEqual([]);
    expect(normalizarEfetivo({})).toEqual([]);
  });
});

describe("validarEfetivo / validarEquipamentos: mensagens e limites", () => {
  it("aceita vazio e null", () => {
    expect(validarEfetivo(null)).toEqual({ ok: true, itens: [] });
    expect(validarEquipamentos(undefined)).toEqual({ ok: true, itens: [] });
  });
  it("formato que não é lista", () => {
    expect(validarEfetivo("x")).toEqual({ ok: false, erro: "Efetivo: formato inválido" });
    expect(validarEquipamentos({})).toEqual({ ok: false, erro: "Equipamentos: formato inválido" });
  });
  it("item sem nome", () => {
    const erro = "Efetivo: informe o nome de cada item";
    expect(validarEfetivo([{ qtd: 1 }])).toEqual({ ok: false, erro });
    expect(validarEfetivo([{ funcao: "   ", qtd: 1 }])).toEqual({ ok: false, erro });
    expect(validarEfetivo([{ funcao: 7, qtd: 1 }])).toEqual({ ok: false, erro });
    expect(validarEfetivo([null])).toEqual({ ok: false, erro });
    expect(validarEquipamentos([{ qtd: 1 }])).toEqual({ ok: false, erro: "Equipamentos: informe o nome de cada item" });
  });
  it("quantidade precisa ser inteiro não negativo", () => {
    const erro = 'Efetivo: quantidade de "Pedreiro" deve ser um número inteiro';
    for (const qtd of ["3", 1.5, -1, NaN, null, undefined]) {
      expect(validarEfetivo([{ funcao: "Pedreiro", qtd }])).toEqual({ ok: false, erro });
    }
    expect(validarEquipamentos([{ nome: "Betoneira", qtd: 0.1 }])).toEqual({
      ok: false,
      erro: 'Equipamentos: quantidade de "Betoneira" deve ser um número inteiro',
    });
  });
  it("zero é aceito (e descartado); 999 passa e 1000 não", () => {
    expect(validarEfetivo([{ funcao: "Pedreiro", qtd: 0 }])).toEqual({ ok: true, itens: [] });
    expect(validarEfetivo([{ funcao: "Pedreiro", qtd: 999 }])).toEqual({ ok: true, itens: [{ funcao: "Pedreiro", qtd: 999 }] });
    expect(validarEfetivo([{ funcao: "Pedreiro", qtd: 1000 }])).toEqual({
      ok: false,
      erro: 'Efetivo: quantidade de "Pedreiro" acima de 999',
    });
  });
});

describe("permissaoRdo: mensagens e prazo", () => {
  const criado = new Date("2026-10-01T12:00:00Z");
  const campo = { id: "u1", role: "CAMPO" as const };
  const DIA = 24 * 60 * 60 * 1000;

  it("outro usuário de campo não altera, com a mensagem do autor", () => {
    expect(permissaoRdo(campo, { autorId: "u2", createdAt: criado }, criado)).toEqual({
      ok: false,
      erro: "Só o autor ou o escritório podem alterar este RDO",
    });
  });
  it("autor pode até o fim do 7º dia; depois, mensagem do prazo", () => {
    expect(permissaoRdo(campo, { autorId: "u1", createdAt: criado }, new Date(criado.getTime() + 7 * DIA))).toEqual({ ok: true });
    expect(permissaoRdo(campo, { autorId: "u1", createdAt: criado }, new Date(criado.getTime() + 7 * DIA + 1))).toEqual({
      ok: false,
      erro: "Prazo de 7 dias para alterar o RDO encerrado — peça ao escritório",
    });
  });
  it("escritório e admin sempre podem", () => {
    const antigo = { autorId: "outro", createdAt: new Date("2020-01-01") };
    expect(permissaoRdo({ id: "x", role: "ESCRITORIO" }, antigo, criado)).toEqual({ ok: true });
    expect(permissaoRdo({ id: "x", role: "ADMIN" }, antigo, criado)).toEqual({ ok: true });
  });
});
