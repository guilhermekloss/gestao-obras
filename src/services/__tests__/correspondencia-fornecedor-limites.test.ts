import { describe, expect, it } from "vitest";
import {
  correspondenciaFornecedor,
  destinatarioEhEmpresa,
  lerCnpjsEmpresa,
  similaridadeNomes,
  type FornecedorCadastro,
} from "../correspondencia-fornecedor";

// 3 de 5 palavras em comum de cada lado → Dice 0,6 (limiar sem documento); 3 de 4 → 0,75 (limiar com outro documento)
const NOME_A5 = "Alfa Beta Gama Delta Epsilon";
const NOME_B5 = "Alfa Beta Gama Zeta Teta";
const NOME_A4 = "Alfa Beta Gama Delta";
const NOME_B4 = "Alfa Beta Gama Zeta";
const CNPJ_OUTRO = "11444777000161";

describe("similaridadeNomes: nome contido no outro", () => {
  it("nome curto contido no longo vale 0,8 se tiver ao menos uma palavra de 4 letras", () => {
    expect(similaridadeNomes("Aço Forte", "Aço Forte Distribuidora Materiais Construção")).toBe(0.8);
    expect(similaridadeNomes("Casa", "Casa Materiais Construção Pinheiro")).toBe(0.8);
  });

  it("só palavras curtas não bastam para o bônus", () => {
    expect(similaridadeNomes("Aço", "Aço Forte Distribuidora")).toBe(0.5);
  });

  it("contido é todas as palavras do menor, não só algumas", () => {
    expect(similaridadeNomes("Aço Forte Pinheiro", "Forte Materiais Construção Xyz")).toBeCloseTo(2 / 7, 10);
  });
});

describe("correspondenciaFornecedor: limiares", () => {
  it("nome do cadastro com similaridade exata de 0,6 não é divergente", () => {
    const cadastro = [{ id: "1", nome: NOME_B5, cnpj: CNPJ_OUTRO }];
    expect(correspondenciaFornecedor({ nome: NOME_A5, documento: CNPJ_OUTRO }, cadastro)).toEqual({
      exato: cadastro[0],
      nomeDivergente: false,
      candidatos: [],
    });
  });

  it("cadastro sem documento: similaridade exata de 0,6 já é candidato", () => {
    const cadastro = [{ id: "1", nome: NOME_B5, cnpj: null }];
    expect(correspondenciaFornecedor({ nome: NOME_A5, documento: CNPJ_OUTRO }, cadastro).candidatos).toEqual([
      { id: "1", nome: NOME_B5, cnpj: null, motivo: "NOME_SEM_DOCUMENTO", similaridade: 0.6 },
    ]);
  });

  it("documento lido diferente do cadastro: exige 0,75 (0,6 não basta)", () => {
    const cadastro = [
      { id: "1", nome: NOME_B4, cnpj: "11222333000181" },
      { id: "2", nome: NOME_B5, cnpj: "12345678000195" },
    ];
    expect(correspondenciaFornecedor({ nome: NOME_A4, documento: CNPJ_OUTRO }, cadastro).candidatos).toEqual([
      { ...cadastro[0], motivo: "NOME_DOCUMENTO_DIFERENTE", similaridade: 0.75 },
    ]);
    expect(correspondenciaFornecedor({ nome: NOME_A5, documento: CNPJ_OUTRO }, [cadastro[1]]).candidatos).toEqual([]);
  });

  it("sem documento lido, cadastro com CNPJ entra a partir de 0,6", () => {
    const cadastro = [{ id: "2", nome: NOME_B5, cnpj: "12345678000195" }];
    expect(correspondenciaFornecedor({ nome: NOME_A5, documento: null }, cadastro).candidatos).toEqual([
      { ...cadastro[0], motivo: "NOME_DOCUMENTO_DIFERENTE", similaridade: 0.6 },
    ]);
  });
});

describe("correspondenciaFornecedor: mesma empresa só entre CNPJs", () => {
  const cadastro: FornecedorCadastro[] = [{ id: "1", nome: "Aço Forte", cnpj: "11.222.333/0001-81" }];

  it("CPF lido que começa com a raiz de um CNPJ não é filial", () => {
    expect(correspondenciaFornecedor({ nome: "Madeireira Pinheiro", documento: "11222333000" }, cadastro).candidatos).toEqual([]);
  });

  it("CPF no cadastro não vira filial de um CNPJ lido com o mesmo começo", () => {
    const comCpf = [{ id: "1", nome: "João Pereira", cnpj: "529.982.247-25" }];
    expect(correspondenciaFornecedor({ nome: "Madeireira Pinheiro", documento: "52998224000100" }, comCpf).candidatos).toEqual([]);
  });
});

describe("correspondenciaFornecedor: ordem e limite dos candidatos", () => {
  const cadastro: FornecedorCadastro[] = [
    { id: "doc-diferente", nome: "Alfa Beta Gama Delta", cnpj: "12345678000195" },
    { id: "sem-doc-06", nome: NOME_B5, cnpj: null },
    { id: "sem-doc-1", nome: "Alfa Beta Gama Delta Epsilon", cnpj: null },
    { id: "filial", nome: "Outro Nome Qualquer", cnpj: "11444777000242" },
  ];

  it("filial primeiro, depois sem documento por similaridade, por último documento diferente", () => {
    const r = correspondenciaFornecedor({ nome: NOME_A5, documento: CNPJ_OUTRO }, cadastro);
    expect(r.candidatos.map((c) => [c.id, c.motivo])).toEqual([
      ["filial", "MESMA_EMPRESA"],
      ["sem-doc-1", "NOME_SEM_DOCUMENTO"],
      ["sem-doc-06", "NOME_SEM_DOCUMENTO"],
      ["doc-diferente", "NOME_DOCUMENTO_DIFERENTE"],
    ]);
  });

  it("devolve no máximo `limite` candidatos, os melhores", () => {
    const r = correspondenciaFornecedor({ nome: NOME_A5, documento: CNPJ_OUTRO }, cadastro, 2);
    expect(r.candidatos.map((c) => c.id)).toEqual(["filial", "sem-doc-1"]);
  });
});

describe("destinatarioEhEmpresa e lerCnpjsEmpresa", () => {
  it("lê CNPJs separados por vírgula, ponto e vírgula, espaço ou quebra de linha", () => {
    expect(lerCnpjsEmpresa("12.345.678/0001-95,  98.765.432/0001-98;\n11222333000181")).toEqual([
      "12345678000195",
      "98765432000198",
      "11222333000181",
    ]);
  });

  it("raiz igual só vale entre dois CNPJs", () => {
    expect(destinatarioEhEmpresa("12345678909", ["12345678000195"])).toBe(false);
    expect(destinatarioEhEmpresa("12345678000195", ["12345678909"])).toBe(false);
  });

  it("documento idêntico a um item da lista é da empresa, mesmo CPF", () => {
    expect(destinatarioEhEmpresa("529.982.247-25", ["52998224725"])).toBe(true);
  });

  it("ignora itens vazios da lista", () => {
    expect(destinatarioEhEmpresa("12345678000195", ["", "---"])).toBeNull();
  });
});
