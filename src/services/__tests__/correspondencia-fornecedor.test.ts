import { describe, it, expect } from "vitest";
import {
  correspondenciaFornecedor,
  destinatarioEhEmpresa,
  lerCnpjsEmpresa,
  normalizarDocumentoCadastro,
  palavrasDoNome,
  similaridadeNomes,
  type FornecedorCadastro,
} from "../correspondencia-fornecedor";

const CADASTRO: FornecedorCadastro[] = [
  { id: "1", nome: "Casa do Construtor", cnpj: null },
  { id: "2", nome: "Aço Forte Distribuidora Ltda", cnpj: "11.222.333/0001-81" },
  { id: "3", nome: "Elétrica Silva", cnpj: "12345678000195" },
  { id: "4", nome: "João Pereira (pedreiro)", cnpj: "529.982.247-25" },
  { id: "5", nome: "Areial Bom Jesus", cnpj: null },
];

describe("nomes", () => {
  it("ignora acento, caixa e sufixo societário", () => {
    expect(palavrasDoNome("AÇO FORTE Distribuidora LTDA - ME")).toEqual(["aco", "forte", "distribuidora"]);
  });

  it("similaridade", () => {
    expect(similaridadeNomes("Aço Forte Distribuidora Ltda", "ACO FORTE DISTRIBUIDORA")).toBe(1);
    expect(similaridadeNomes("Casa do Construtor", "Casa do Construtor Materiais de Construção Ltda")).toBeGreaterThanOrEqual(0.8);
    expect(similaridadeNomes("Elétrica Silva", "Hidráulica Souza")).toBe(0);
    expect(similaridadeNomes("Ltda", "ME")).toBe(0);
  });
});

describe("correspondenciaFornecedor", () => {
  it("acha pelo CNPJ com ou sem máscara", () => {
    const r = correspondenciaFornecedor({ nome: "ACO FORTE DISTRIBUIDORA", documento: "11222333000181" }, CADASTRO);
    expect(r.exato?.id).toBe("2");
    expect(r.nomeDivergente).toBe(false);
    expect(r.candidatos).toEqual([]);
  });

  it("acha CPF mascarado e avisa quando o nome do cadastro é outro", () => {
    const r = correspondenciaFornecedor({ nome: "José da Costa", documento: "52998224725" }, CADASTRO);
    expect(r.exato?.id).toBe("4");
    expect(r.nomeDivergente).toBe(true);
  });

  it("sem CNPJ no cadastro: sugere o de nome parecido para completar", () => {
    const r = correspondenciaFornecedor(
      { nome: "CASA DO CONSTRUTOR MATERIAIS DE CONSTRUCAO LTDA", documento: "11444777000161" },
      CADASTRO,
    );
    expect(r.exato).toBeNull();
    expect(r.candidatos.map((c) => [c.id, c.motivo])).toEqual([["1", "NOME_SEM_DOCUMENTO"]]);
  });

  it("filial: mesmo CNPJ raiz vem primeiro", () => {
    const r = correspondenciaFornecedor({ nome: "Aço Forte Filial Sul", documento: "11222333000262" }, CADASTRO);
    expect(r.candidatos[0]).toMatchObject({ id: "2", motivo: "MESMA_EMPRESA" });
  });

  it("nome igual com outro CNPJ: candidato para conferir", () => {
    const r = correspondenciaFornecedor({ nome: "Elétrica Silva Ltda", documento: "11444777000161" }, CADASTRO);
    expect(r.candidatos).toEqual([expect.objectContaining({ id: "3", motivo: "NOME_DOCUMENTO_DIFERENTE" })]);
  });

  it("sem documento lido: só por nome", () => {
    const r = correspondenciaFornecedor({ nome: "Areial Bom Jesus", documento: null }, CADASTRO);
    expect(r.exato).toBeNull();
    expect(r.candidatos[0]).toMatchObject({ id: "5", motivo: "NOME_SEM_DOCUMENTO", similaridade: 1 });
  });

  it("fornecedor realmente novo: nenhum candidato", () => {
    const r = correspondenciaFornecedor({ nome: "Madeireira Pinheiro", documento: "11444777000161" }, CADASTRO);
    expect(r).toEqual({ exato: null, nomeDivergente: false, candidatos: [] });
  });
});

describe("destinatário × empresa", () => {
  const empresa = lerCnpjsEmpresa("12.345.678/0001-95; 98.765.432/0001-98");
  it("lê a lista do ambiente", () => {
    expect(empresa).toEqual(["12345678000195", "98765432000198"]);
    expect(lerCnpjsEmpresa(undefined)).toEqual([]);
  });
  it("aceita o CNPJ e filiais da empresa", () => {
    expect(destinatarioEhEmpresa("12345678000195", empresa)).toBe(true);
    expect(destinatarioEhEmpresa("12345678000276", empresa)).toBe(true);
    expect(destinatarioEhEmpresa("11222333000181", empresa)).toBe(false);
  });
  it("sem lista ou sem documento: não dá para dizer", () => {
    expect(destinatarioEhEmpresa("12345678000195", [])).toBeNull();
    expect(destinatarioEhEmpresa(null, empresa)).toBeNull();
  });
});

describe("normalizarDocumentoCadastro", () => {
  it("devolve com máscara quando o DV confere", () => {
    expect(normalizarDocumentoCadastro("11222333000181")).toEqual({ ok: true, valor: "11.222.333/0001-81" });
    expect(normalizarDocumentoCadastro("529.982.247-25")).toEqual({ ok: true, valor: "529.982.247-25" });
  });
  it("recusa DV errado e tamanho errado", () => {
    expect(normalizarDocumentoCadastro("11.222.333/0001-82")).toMatchObject({ ok: false, erro: expect.stringMatching(/CNPJ inválido/) });
    expect(normalizarDocumentoCadastro("52998224726")).toMatchObject({ ok: false, erro: expect.stringMatching(/CPF inválido/) });
    expect(normalizarDocumentoCadastro("123")).toMatchObject({ ok: false });
  });
});
