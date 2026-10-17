import { describe, it, expect } from "vitest";
import { extrairCnos, formatarCno, normalizarCno } from "../cno";
import { obraSchema } from "@/schemas/obra";

describe("normalizarCno", () => {
  it("fica só com os 12 dígitos", () => {
    expect(normalizarCno("90.000.12345/67")).toBe("900001234567");
    expect(normalizarCno(" 900001234567 ")).toBe("900001234567");
  });

  it("recusa o que não tem 12 dígitos", () => {
    expect(normalizarCno("90.000.12345/6")).toBeNull();
    expect(normalizarCno("9000012345678")).toBeNull();
    expect(normalizarCno("")).toBeNull();
    expect(normalizarCno(null)).toBeNull();
    expect(normalizarCno(undefined)).toBeNull();
  });
});

describe("formatarCno", () => {
  it("aplica a máscara XX.XXX.XXXXX/XX", () => {
    expect(formatarCno("900001234567")).toBe("90.000.12345/67");
    expect(formatarCno("90.000.12345/67")).toBe("90.000.12345/67");
  });

  it("devolve como veio o que não tem 12 dígitos", () => {
    expect(formatarCno("123")).toBe("123");
  });
});

describe("extrairCnos", () => {
  it.each([
    ["CNO: 90.000.12345/67", "rótulo com dois-pontos"],
    ["C.N.O. 90.000.12345/67", "sigla com pontos"],
    ["CEI nº 90.000.12345/67", "matrícula CEI"],
    ["Cadastro Nacional de Obras - 900001234567", "nome por extenso, sem máscara"],
    ["cadastro nacional da obra: 900001234567", "minúsculas"],
    ["Matrícula da obra 90 000 12345 67", "separado por espaços"],
    ["OBRA RESIDENCIAL JARDIM\nCNO\n900001234567", "rótulo numa linha e número na seguinte"],
    ["CNO/CEI: 90.000.12345-67", "traço no lugar da barra"],
  ])("lê %s (%s)", (texto) => {
    expect(extrairCnos(texto)).toEqual(["900001234567"]);
  });

  it("número com a máscara completa dispensa o rótulo", () => {
    expect(extrairCnos("Entrega na obra 90.000.12345/67, portão 2")).toEqual(["900001234567"]);
  });

  it("12 dígitos soltos, sem rótulo nem máscara, não contam", () => {
    expect(extrairCnos("PEDIDO 900001234567")).toEqual([]);
    expect(extrairCnos("Fone 041999887766")).toEqual([]);
  });

  it("não confunde CNPJ nem palavras que contêm a sigla", () => {
    expect(extrairCnos("CNPJ 11.222.333/0001-81")).toEqual([]);
    expect(extrairCnos("CNO 11222333000181")).toEqual([]);
    expect(extrairCnos("TECNOLOGIA 900001234567")).toEqual([]);
  });

  it("devolve os distintos na ordem do texto", () => {
    expect(extrairCnos("CNO 11.111.11111/11 e CEI 90.000.12345/67; CNO 11.111.11111/11")).toEqual([
      "111111111111",
      "900001234567",
    ]);
  });

  it("texto vazio", () => {
    expect(extrairCnos("")).toEqual([]);
    expect(extrairCnos(null)).toEqual([]);
  });
});

describe("obraSchema — CNO", () => {
  const base = { nome: "Lote 12", codigo: "L12", status: "ANDAMENTO" as const };

  it("guarda só os dígitos", () => {
    const r = obraSchema.safeParse({ ...base, cno: "90.000.12345/67" });
    expect(r.success && r.data.cno).toBe("900001234567");
  });

  it("vazio continua opcional", () => {
    expect(obraSchema.safeParse({ ...base }).success && true).toBe(true);
    const r = obraSchema.safeParse({ ...base, cno: "  " });
    expect(r.success && r.data.cno).toBeUndefined();
  });

  it("recusa CNO sem 12 dígitos", () => {
    const r = obraSchema.safeParse({ ...base, cno: "90.000.12345/6" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/12 dígitos/);
  });
});
