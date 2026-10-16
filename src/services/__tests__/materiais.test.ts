import { describe, it, expect } from "vitest";
import {
  chaveMaterial,
  correspondenciaItem,
  errosDeVinculos,
  materialIdDoVinculo,
  vinculoInicial,
  normalizarUnidade,
  palavrasMaterial,
  similaridadeMaterial,
  type ApelidoCatalogo,
  type MaterialCatalogo,
} from "../materiais";

const mat = (id: string, nome: string, unidade = "PC"): MaterialCatalogo => ({
  id,
  nome,
  unidade,
  tipo: "MATERIAL",
  categoria: null,
});

const CATALOGO = [
  mat("cim", "Cimento CP II 50kg Votoran", "SC"),
  mat("ca8", "CA50 8,00mm reto 12m", "BR"),
  mat("ca10", "CA50 10,00mm reto 12m", "BR"),
  mat("tij", "Tijolo 9 furos 14x19x29"),
];

const APELIDOS: ApelidoCatalogo[] = [
  { materialId: "cim", chave: chaveMaterial("CIMENTO 50KG VOTORAN"), descricaoOriginal: "CIMENTO 50KG VOTORAN", fornecedorId: "f1", codigoProduto: null },
  { materialId: "tij", chave: chaveMaterial("TIJOLO 9F"), descricaoOriginal: "TIJOLO 9F", fornecedorId: "f2", codigoProduto: "TJ-09" },
];

describe("chaveMaterial", () => {
  it("ignora acento, caixa, pontuação e espaços repetidos", () => {
    expect(chaveMaterial("  Argamassa  AC-3 20kg, Cinza ")).toBe("ARGAMASSA AC 3 20KG CINZA");
    expect(chaveMaterial("Pé-direito")).toBe("PE DIREITO");
    expect(chaveMaterial("Cimento 50 kg")).toBe("CIMENTO 50KG");
    expect(chaveMaterial("Módulo 10 A / 250 V")).toBe("MODULO 10A 250V");
  });

  it("remove o ruído de tributos aproximados", () => {
    expect(chaveMaterial("TIJOLO 9 FUROS 14X19X29 (TRIB APROX: R$ 414,02)")).toBe("TIJOLO 9 FUROS 14X19X29");
    expect(chaveMaterial("TIJOLO 8 FUROS 11,5X19X29 (TRIB APROX: R$ 428,07")).toBe("TIJOLO 8 FUROS 11 5X19X29");
  });
});

describe("normalizarUnidade", () => {
  it("padroniza sinônimos", () => {
    expect(normalizarUnidade("pç")).toBe("PC");
    expect(normalizarUnidade(" Uni ")).toBe("UN");
    expect(normalizarUnidade("m2")).toBe("M²");
    expect(normalizarUnidade("M³")).toBe("M³");
    expect(normalizarUnidade("lt")).toBe("L");
    expect(normalizarUnidade("UM")).toBe("UN");
    expect(normalizarUnidade("ml")).toBe("M");
    expect(normalizarUnidade("KG")).toBe("KG");
  });
});

describe("similaridade", () => {
  it("palavras genéricas não contam", () => {
    expect(palavrasMaterial("Tubo de PVC para esgoto")).toEqual(["TUBO", "PVC", "ESGOTO"]);
  });

  it("mesma descrição = 1; sem nada em comum = 0; vazio = 0", () => {
    expect(similaridadeMaterial("Cimento 50kg", "CIMENTO 50KG")).toBe(1);
    expect(similaridadeMaterial("Cimento 50kg", "Tijolo furado")).toBe(0);
    expect(similaridadeMaterial("", "Cimento")).toBe(0);
  });

  it("medidas diferentes reduzem a similaridade", () => {
    const igual = similaridadeMaterial("CA50 8,00MM RETO", "CA50 8,00MM RETO 12M");
    const diferente = similaridadeMaterial("CA50 8,00MM RETO", "CA50 10,00MM RETO");
    expect(igual).toBeGreaterThan(diferente);
  });
});

describe("correspondenciaItem", () => {
  const base = { catalogo: CATALOGO, apelidos: APELIDOS, fornecedorId: "f1" };

  it("liga pelo apelido de texto", () => {
    const r = correspondenciaItem({ descricao: "Cimento 50 KG votoran" }, base);
    expect(r.exato?.id).toBe("cim");
    expect(r.origem).toBe("texto");
  });

  it("liga pelo nome do material", () => {
    const r = correspondenciaItem({ descricao: "tijolo 9 FUROS 14x19x29" }, base);
    expect(r.exato?.id).toBe("tij");
    expect(r.origem).toBe("nome");
  });

  it("o código do produto do mesmo fornecedor vale mais que o texto", () => {
    const r = correspondenciaItem(
      { descricao: "CIMENTO 50KG VOTORAN", codigo: "TJ-09" },
      { ...base, fornecedorId: "f2" },
    );
    expect(r.exato?.id).toBe("tij");
    expect(r.origem).toBe("codigo");
  });

  it("código de outro fornecedor é ignorado", () => {
    const r = correspondenciaItem({ descricao: "algo sem relação", codigo: "TJ-09" }, base);
    expect(r.exato).toBeNull();
  });

  it("sem ligação exata, sugere candidatos parecidos, do mais ao menos parecido", () => {
    const r = correspondenciaItem({ descricao: "CA50 8,00MM RETO 12,0M FX 2000KG" }, base);
    expect(r.exato).toBeNull();
    expect(r.candidatos[0].material.id).toBe("ca8");
    expect(r.candidatos.map((c) => c.material.id)).not.toContain("tij");
  });

  it("sem nada parecido, não sugere nada", () => {
    const r = correspondenciaItem({ descricao: "Porcelanato retificado 84x84" }, base);
    expect(r).toEqual({ exato: null, origem: null, candidatos: [] });
  });

  it("respeita o limite de candidatos", () => {
    const muitos = Array.from({ length: 10 }, (_, i) => mat(`m${i}`, `Cimento Votoran lote ${i} 50kg`));
    const r = correspondenciaItem({ descricao: "Cimento Votoran 50kg" }, { catalogo: muitos, apelidos: [] }, 3);
    expect(r.candidatos).toHaveLength(3);
  });
});

describe("vínculo na leitura de nota", () => {
  const base = { catalogo: CATALOGO, apelidos: APELIDOS, fornecedorId: "f1" };

  it("só a ligação exata é automática", () => {
    const exato = correspondenciaItem({ descricao: "CIMENTO 50KG VOTORAN" }, base);
    expect(vinculoInicial(exato, "MATERIAL")).toEqual({ modo: "existente", id: "cim", automatico: true });
  });

  it("sem ligação exata fica pendente, com os candidatos para o usuário decidir", () => {
    const parecido = correspondenciaItem({ descricao: "CA50 8,00MM RETO 12,0M FX 2000KG" }, base);
    const v = vinculoInicial(parecido, "MATERIAL");
    expect(v.modo).toBe("pendente");
    expect(v.modo === "pendente" && v.candidatos[0]).toMatchObject({ id: "ca8", nome: "CA50 8,00mm reto 12m" });
    expect(vinculoInicial(undefined, "MATERIAL")).toEqual({ modo: "pendente", candidatos: [] });
  });

  it("frete, serviço e encargo não pedem material", () => {
    const parecido = correspondenciaItem({ descricao: "FRETE" }, base);
    for (const tipo of ["FRETE", "SERVICO", "ENCARGO"] as const) {
      expect(vinculoInicial(parecido, tipo)).toEqual({ modo: "nenhum" });
    }
  });

  it("materialIdDoVinculo só devolve id para ligação existente", () => {
    expect(materialIdDoVinculo({ modo: "existente", id: "x", automatico: false })).toBe("x");
    expect(materialIdDoVinculo({ modo: "novo", nome: "A", unidade: "PC" })).toBe("");
    expect(materialIdDoVinculo({ modo: "pendente", candidatos: [] })).toBe("");
    expect(materialIdDoVinculo(undefined)).toBe("");
  });

  it("pendente e novo incompleto bloqueiam; as demais escolhas passam", () => {
    expect(
      errosDeVinculos([
        { modo: "nenhum" },
        { modo: "existente", id: "x", automatico: true },
        { modo: "pendente", candidatos: [] },
        { modo: "novo", nome: " ", unidade: "PC" },
        { modo: "novo", nome: "Tubo", unidade: "" },
        { modo: "novo", nome: "Tubo", unidade: "M" },
      ]),
    ).toEqual([
      "Itens: a linha 3 precisa de um material — ligue a um existente, cadastre como novo ou deixe avulso.",
      "Itens: informe o nome do novo material da linha 4.",
      "Itens: informe a unidade do novo material da linha 5.",
    ]);
  });
});
