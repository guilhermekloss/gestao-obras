import { describe, expect, it } from "vitest";
import {
  chaveAcessoValida,
  chaveNfseValida,
  cnpjValido,
  corrigirChave,
  corrigirDocumento,
  cpfValido,
  dadosChaveNfe,
  dadosChaveNfse,
  documentoValido,
  dvsCnpj,
  encontrarDocumentos,
  limparAlfanumerico,
  modulo11Arrecadacao,
  modulo11Boleto,
  somenteDigitos,
} from "../digitos";
import { CHAVE_NFCE, CHAVE_NFE, CHAVE_NFSE } from "./fixtures";

// CNPJ alfanumérico com letra na primeira e na última posição da faixa de 12
const CNPJ_ALFA = "A1B2C3D4E5F668";
const CHAVE_ALFA_PONTAS = "352609A1B2C3D4E5F668550010000123451876543217";
// CNPJ numérico com DV errado, mas chave com DV de chave correto
const CHAVE_CNPJ_NUM_INVALIDO = "35260911222333000199550010000123451876543210";
const CHAVE_CNPJ_ALFA_INVALIDO = "352609A1B2C3D4E5F699550010000123451876543213";

describe("limparAlfanumerico / somenteDigitos", () => {
  it("mantém só 0-9 e A-Z, em maiúsculas", () => {
    expect(limparAlfanumerico("ab-1.c/2 ç")).toBe("AB1C2");
    expect(limparAlfanumerico(null)).toBe("");
    expect(limparAlfanumerico(undefined)).toBe("");
  });
  it("somenteDigitos", () => {
    expect(somenteDigitos("a1-2b3")).toBe("123");
    expect(somenteDigitos(null)).toBe("");
    expect(somenteDigitos(undefined)).toBe("");
  });
});

describe("CNPJ", () => {
  it("válido com e sem pontuação; alfanumérico", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido(CNPJ_ALFA)).toBe(true);
    expect(dvsCnpj(CNPJ_ALFA.slice(0, 12))).toBe("68");
  });
  it("tamanho errado, DV errado, repetido e vazio", () => {
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("112223330001811")).toBe(false);
    expect(cnpjValido("x11222333000181")).toBe(false);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("11222333000191")).toBe(false);
    expect(cnpjValido("11222333000181".slice(0, 12) + "AB")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
});

describe("CPF", () => {
  it("válidos", () => {
    expect(cpfValido("12345678909")).toBe(true);
    expect(cpfValido("123.456.789-09")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
  });
  it("cada dígito verificador é conferido", () => {
    expect(cpfValido("12345678917")).toBe(false); // 1º DV errado, 2º coerente com ele
    expect(cpfValido("12345678900")).toBe(false); // 1º certo, 2º errado
    expect(cpfValido("12345678908")).toBe(false);
  });
  it("tamanho errado e dígitos todos iguais (00000000000 passaria no cálculo)", () => {
    expect(cpfValido("1234567890")).toBe(false);
    expect(cpfValido("123456789090")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido(undefined)).toBe(false);
  });
});

describe("documentoValido", () => {
  it("escolhe o validador pelo tamanho", () => {
    expect(documentoValido("11.222.333/0001-81")).toBe(true);
    expect(documentoValido("123.456.789-09")).toBe(true);
    expect(documentoValido(CNPJ_ALFA)).toBe(true);
  });
  it("recusa tamanhos que não são CPF nem CNPJ, e documentos inválidos", () => {
    expect(documentoValido("123")).toBe(false);
    expect(documentoValido("1234567890")).toBe(false);
    expect(documentoValido("123456789012")).toBe(false);
    expect(documentoValido("11222333000182")).toBe(false);
    expect(documentoValido("12345678900")).toBe(false);
    expect(documentoValido("")).toBe(false);
    expect(documentoValido(null)).toBe(false);
  });
});

describe("chave de acesso e NFS-e", () => {
  it("válidas", () => {
    expect(chaveAcessoValida(CHAVE_NFE)).toBe(true);
    expect(chaveAcessoValida(CHAVE_NFCE)).toBe(true);
    expect(chaveAcessoValida(CHAVE_ALFA_PONTAS)).toBe(true);
    expect(chaveAcessoValida(CHAVE_NFE.replace(/(\d{4})/g, "$1 "))).toBe(true);
    expect(chaveNfseValida(CHAVE_NFSE)).toBe(true);
  });
  it("tamanho exato: sobra ou falta de um caractere invalida", () => {
    expect(chaveAcessoValida(CHAVE_NFE + "0")).toBe(false);
    expect(chaveAcessoValida("0" + CHAVE_NFE)).toBe(false);
    expect(chaveAcessoValida(CHAVE_NFE.slice(1))).toBe(false);
    expect(chaveNfseValida(CHAVE_NFSE + "0")).toBe(false);
    expect(chaveNfseValida("0" + CHAVE_NFSE)).toBe(false);
    expect(chaveNfseValida(CHAVE_NFSE.slice(1))).toBe(false);
  });
  it("DV errado e letras nas faixas numéricas", () => {
    expect(chaveAcessoValida(CHAVE_NFE.slice(0, 43) + "9")).toBe(false);
    expect(chaveNfseValida(CHAVE_NFSE.slice(0, 49) + "0")).toBe(false);
    expect(chaveAcessoValida("A" + CHAVE_NFE.slice(1))).toBe(false);
    expect(chaveAcessoValida(CHAVE_NFE.slice(0, 30) + "A" + CHAVE_NFE.slice(31))).toBe(false);
    expect(chaveNfseValida("A" + CHAVE_NFSE.slice(1))).toBe(false);
    expect(chaveNfseValida(CHAVE_NFSE.slice(0, 40) + "A" + CHAVE_NFSE.slice(41))).toBe(false);
    expect(chaveAcessoValida(null)).toBe(false);
  });
});

describe("dados extraídos da chave", () => {
  it("NF-e: todos os campos", () => {
    expect(dadosChaveNfe(CHAVE_NFE)).toEqual({
      uf: "35",
      ano: 2026,
      mes: 9,
      cnpj: "11222333000181",
      modelo: "55",
      serie: "1",
      numero: "12345",
      tipoEmissao: "1",
    });
  });
  it("NFS-e com CNPJ: todos os campos", () => {
    expect(dadosChaveNfse(CHAVE_NFSE)).toEqual({ municipio: "3550308", documento: "11222333000181", numero: "123", ano: 2026, mes: 10 });
  });
  it("NFS-e com CPF (tipo 1): descarta os 3 zeros à esquerda", () => {
    const chave = "3550308" + "1" + "1" + "00012345678909" + "0000000000042" + "25" + "07" + "0".repeat(10);
    expect(chave).toHaveLength(50);
    expect(dadosChaveNfse(chave)).toEqual({ municipio: "3550308", documento: "12345678909", numero: "42", ano: 2025, mes: 7 });
  });
});

describe("módulos 10/11: casos de resto 0, 1 e comuns", () => {
  it("boleto: resto 0, 10 e 11 viram 1", () => {
    expect(modulo11Boleto("0")).toBe(1); // 11 − 0
    expect(modulo11Boleto("6")).toBe(1); // 11 − 1 = 10
    expect(modulo11Boleto("1")).toBe(9);
    expect(modulo11Boleto("2")).toBe(7);
  });
  it("arrecadação: resto 0 e 1 viram 0", () => {
    expect(modulo11Arrecadacao("0")).toBe(0);
    expect(modulo11Arrecadacao("6")).toBe(0); // resto 1
    expect(modulo11Arrecadacao("1")).toBe(9); // soma 2 → 11 − 2
    expect(modulo11Arrecadacao("5")).toBe(1); // soma 10 → 11 − 10
  });
});

describe("corrigirDocumento", () => {
  it("documento já válido não é marcado como corrigido", () => {
    expect(corrigirDocumento("11.222.333/0001-81")).toEqual({ valor: "11222333000181", valido: true, corrigido: false, tipo: "CNPJ" });
    expect(corrigirDocumento("123.456.789-09")).toEqual({ valor: "12345678909", valido: true, corrigido: false, tipo: "CPF" });
  });
  it("correção de OCR é marcada como corrigido", () => {
    expect(corrigirDocumento("11.222.333/OOO1-81")).toEqual({ valor: "11222333000181", valido: true, corrigido: true, tipo: "CNPJ" });
    expect(corrigirDocumento("123.456.789-O9")).toEqual({ valor: "12345678909", valido: true, corrigido: true, tipo: "CPF" });
  });
  it("não adivinha: DV que não fecha devolve como lido, sem marcar correção", () => {
    expect(corrigirDocumento("11.222.333/0001-99")).toEqual({ valor: "11222333000199", valido: false, corrigido: false, tipo: "CNPJ" });
    expect(corrigirDocumento("123.456.789-00")).toEqual({ valor: "12345678900", valido: false, corrigido: false, tipo: "CPF" });
  });
  it("letra que não pode ser dígito invalida; só os 12 primeiros do CNPJ aceitam letra", () => {
    expect(corrigirDocumento("11.222.333/0001-8X")).toMatchObject({ valido: false, tipo: "CNPJ" });
    expect(corrigirDocumento("1234567890X")).toMatchObject({ valido: false, corrigido: false, tipo: "CPF" });
  });
  it("tamanhos que não são de documento não têm tipo", () => {
    expect(corrigirDocumento("12345")).toEqual({ valor: "12345", valido: false, corrigido: false, tipo: null });
    expect(corrigirDocumento("123456789012")).toEqual({ valor: "123456789012", valido: false, corrigido: false, tipo: null });
    expect(corrigirDocumento("")).toEqual({ valor: "", valido: false, corrigido: false, tipo: null });
  });
  it("variante ambígua que valida em mais de uma forma não é escolhida", () => {
    // CNPJ lido tal qual (válido) vence mesmo havendo letras confundíveis
    expect(corrigirDocumento("12.ABC.345/01DE-35")).toMatchObject({ valido: true, corrigido: false });
  });
});

describe("corrigirChave", () => {
  it("tamanho precisa bater com o esperado", () => {
    expect(corrigirChave(CHAVE_NFE.slice(1))).toBeNull();
    expect(corrigirChave(CHAVE_NFE + "0")).toBeNull();
    expect(corrigirChave(CHAVE_NFE, 50)).toBeNull();
    expect(corrigirChave(CHAVE_NFSE)).toBeNull();
  });
  it("chave certa volta igual, de 44 e de 50", () => {
    expect(corrigirChave(CHAVE_NFE)).toBe(CHAVE_NFE);
    expect(corrigirChave(CHAVE_NFSE, 50)).toBe(CHAVE_NFSE);
  });
  it("letras confundíveis fora da faixa do CNPJ viram dígitos; sem mapeamento, desiste", () => {
    expect(corrigirChave(CHAVE_NFE.replace("3526", "3S26"))).toBe(CHAVE_NFE);
    expect(corrigirChave(CHAVE_NFE.replace("3526", "3X26"))).toBeNull();
    expect(corrigirChave(CHAVE_NFSE.replace("3550308", "355O308"), 50)).toBe(CHAVE_NFSE);
    expect(corrigirChave(CHAVE_NFSE.replace("3550308", "355X308"), 50)).toBeNull();
  });
  it("a faixa do CNPJ aceita letras legítimas, inclusive nas duas pontas", () => {
    expect(corrigirChave(CHAVE_ALFA_PONTAS)).toBe(CHAVE_ALFA_PONTAS);
  });
  it("letra logo antes ou logo depois da faixa do CNPJ não é aceita", () => {
    const antes = CHAVE_ALFA_PONTAS.slice(0, 5) + "A" + CHAVE_ALFA_PONTAS.slice(6);
    const depois = CHAVE_ALFA_PONTAS.slice(0, 18) + "A" + CHAVE_ALFA_PONTAS.slice(19);
    expect(corrigirChave(antes)).toBeNull();
    expect(corrigirChave(depois)).toBeNull();
  });
  it("CNPJ numérico da chave não precisa ter DV válido, o alfanumérico precisa", () => {
    expect(chaveAcessoValida(CHAVE_CNPJ_NUM_INVALIDO)).toBe(true);
    expect(corrigirChave(CHAVE_CNPJ_NUM_INVALIDO)).toBe(CHAVE_CNPJ_NUM_INVALIDO);
    expect(chaveAcessoValida(CHAVE_CNPJ_ALFA_INVALIDO)).toBe(true);
    expect(corrigirChave(CHAVE_CNPJ_ALFA_INVALIDO)).toBeNull();
  });
});

describe("encontrarDocumentos", () => {
  it("posições e texto exatos, em ordem de aparição (CPF antes do CNPJ)", () => {
    const texto = "CPF 123.456.789-09 e CNPJ 11.222.333/0001-81";
    expect(encontrarDocumentos(texto)).toEqual([
      { valor: "12345678909", valido: true, corrigido: false, tipo: "CPF", inicio: 4, fim: 18, texto: "123.456.789-09" },
      { valor: "11222333000181", valido: true, corrigido: false, tipo: "CNPJ", inicio: 26, fim: 44, texto: "11.222.333/0001-81" },
    ]);
  });
  it("ignora trecho com mais letras do que dígitos", () => {
    expect(encontrarDocumentos("Av. AB.CDE.FGH/IJKL-MN centro")).toEqual([]);
    expect(encontrarDocumentos("ref 12.ABC.345/01DE-35 ok").map((d) => d.valor)).toEqual(["12ABC34501DE35"]);
  });
  it("sem pontuação só com a opção ligada, e só se o DV fechar", () => {
    const texto = "doc 11222333000181 e 12345678909 e 11222333000182";
    expect(encontrarDocumentos(texto)).toEqual([]);
    const r = encontrarDocumentos(texto, true);
    expect(r.map((d) => [d.valor, d.inicio, d.fim, d.texto])).toEqual([
      ["11222333000181", 4, 18, "11222333000181"],
      ["12345678909", 21, 32, "12345678909"],
    ]);
  });
  it("não repete o mesmo trecho achado com e sem pontuação", () => {
    expect(encontrarDocumentos("CNPJ 11.222.333/0001-81", true)).toHaveLength(1);
  });
});
