import { describe, expect, it } from "vitest";
import {
  chaveMaterial,
  correspondenciaItem,
  errosDeVinculos,
  similaridadeMaterial,
  type ApelidoCatalogo,
  type MaterialCatalogo,
} from "../materiais";

const mat = (id: string, nome: string, unidade = "UN"): MaterialCatalogo => ({ id, nome, unidade, tipo: "MATERIAL", categoria: null });
const apelido = (materialId: string, texto: string, fornecedorId: string | null = null, codigoProduto: string | null = null): ApelidoCatalogo => ({
  materialId,
  chave: chaveMaterial(texto),
  descricaoOriginal: texto,
  fornecedorId,
  codigoProduto,
});

describe("chaveMaterial: ruído de tributos", () => {
  it("remove o trecho de tributos mesmo com espaço depois do parêntese", () => {
    expect(chaveMaterial("TIJOLO 9 FUROS ( TRIB APROX R$ 1,00)")).toBe("TIJOLO 9 FUROS");
  });

  it("o trecho removido vira separador entre as palavras vizinhas", () => {
    expect(chaveMaterial("TIJOLO(TRIB X)FUROS")).toBe("TIJOLO FUROS");
  });
});

describe("similaridadeMaterial: penalidade por medida", () => {
  it("cada lado com uma medida que o outro não tem: Dice × 0,85", () => {
    // 3 de 4 palavras em comum → 0,75 × 0,85
    expect(similaridadeMaterial("CA50 8,00MM RETO", "CA50 10,00MM RETO")).toBeCloseTo(0.6375, 10);
    // 2 de 3 → 0,667 × 0,85
    expect(similaridadeMaterial("Tubo PVC 25mm", "Tubo PVC 32mm")).toBeCloseTo((2 / 3) * 0.85, 10);
  });

  it("medida só de um lado não é conflito", () => {
    expect(similaridadeMaterial("Tubo PVC 25mm", "Tubo PVC")).toBe(0.8);
    expect(similaridadeMaterial("Tubo PVC", "Tubo PVC 25mm")).toBe(0.8);
  });

  it("palavras sem número diferentes não contam como medida", () => {
    expect(similaridadeMaterial("Tubo PVC 25mm branco", "Tubo PVC 25mm esgoto")).toBe(0.75);
  });
});

describe("correspondenciaItem: ligação exata", () => {
  it("devolve a ligação sem candidatos, por código, apelido e nome", () => {
    const catalogo = [mat("cim", "Cimento CP II"), mat("tij", "Tijolo 9 furos")];
    const apelidos = [apelido("cim", "CIMENTO VOTORAN"), apelido("tij", "TIJOLO 9F", "f1", "TJ-09")];
    const base = { catalogo, apelidos, fornecedorId: "f1" };
    expect(correspondenciaItem({ descricao: "x", codigo: "TJ-09" }, base)).toEqual({ exato: catalogo[1], origem: "codigo", candidatos: [] });
    expect(correspondenciaItem({ descricao: "Cimento Votoran" }, base)).toEqual({ exato: catalogo[0], origem: "texto", candidatos: [] });
    expect(correspondenciaItem({ descricao: "cimento cp ii" }, base)).toEqual({ exato: catalogo[0], origem: "nome", candidatos: [] });
  });

  it("ignora espaços em volta do código do produto", () => {
    const catalogo = [mat("tij", "Tijolo 9 furos")];
    const base = { catalogo, apelidos: [apelido("tij", "TIJOLO 9F", "f1", "TJ-09")], fornecedorId: "f1" };
    expect(correspondenciaItem({ descricao: "x", codigo: "  TJ-09 " }, base).origem).toBe("codigo");
  });

  it("código só liga quando o apelido tem fornecedor e código", () => {
    const catalogo = [mat("tij", "Tijolo 9 furos")];
    const base = { catalogo, apelidos: [apelido("tij", "TIJOLO 9F", "f1", null)], fornecedorId: "f1" };
    expect(correspondenciaItem({ descricao: "x", codigo: "TJ-09" }, base, 0).exato).toBeNull();
  });
});

describe("correspondenciaItem: candidatos", () => {
  it("entra a partir de 0,5 de similaridade, ordenado por similaridade e depois por nome", () => {
    const catalogo = [mat("grossa", "Areia grossa"), mat("fina", "Areia fina"), mat("lavada", "Areia media lavada"), mat("brita", "Brita 1")];
    const r = correspondenciaItem({ descricao: "Areia media" }, { catalogo, apelidos: [] });
    expect(r.candidatos.map((c) => [c.material.id, c.similaridade])).toEqual([
      ["lavada", 0.8],
      ["fina", 0.5],
      ["grossa", 0.5],
    ]);
  });

  it("usa a melhor similaridade entre o nome e todos os apelidos do material", () => {
    const catalogo = [mat("cim", "Cimento CP II")];
    const apelidos = [apelido("cim", "CIMENTO SACO"), apelido("cim", "CIMENTO VOTORAN 50KG")];
    const r = correspondenciaItem({ descricao: "Cimento Votoran 50kg saco" }, { catalogo, apelidos });
    expect(r.exato).toBeNull();
    expect(r.candidatos).toEqual([{ material: catalogo[0], similaridade: 6 / 7 }]);
  });
});

describe("errosDeVinculos: linhas sem decisão", () => {
  it("linha sem vínculo definido não gera erro", () => {
    expect(errosDeVinculos([undefined, { modo: "nenhum" }])).toEqual([]);
  });

  it("novo material com unidade em branco", () => {
    expect(errosDeVinculos([{ modo: "novo", nome: "Areia", unidade: "  " }])).toEqual([
      "Itens: informe a unidade do novo material da linha 1.",
    ]);
  });
});
