import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { cnpjsDe, empresaSchema, UFS } = await import("../empresa");

const base = { razaoSocial: "Construtora Teste Ltda", nomeFantasia: "", cnpj: "11.222.333/0001-81", filiais: "", uf: "PR" };

describe("empresaSchema", () => {
  it("normaliza CNPJ da matriz e das filiais, tira repetidos e a própria matriz", () => {
    const r = empresaSchema.parse({ ...base, filiais: "11.222.333/0002-62\n11222333000262\n11222333000181" });
    expect(r).toEqual({ razaoSocial: "Construtora Teste Ltda", nomeFantasia: null, cnpj: "11222333000181", filiais: ["11222333000262"], uf: "PR" });
  });

  it("recusa CNPJ com dígito errado, na matriz e na filial", () => {
    expect(empresaSchema.safeParse({ ...base, cnpj: "11.222.333/0001-82" }).error?.issues[0].message).toMatch(/CNPJ da matriz: CNPJ inválido/);
    expect(empresaSchema.safeParse({ ...base, filiais: "123" }).error?.issues[0].message).toMatch(/^Filial: informe os 14 caracteres/);
  });

  it("aceita CNPJ alfanumérico (letras)", () => {
    expect(empresaSchema.parse({ ...base, cnpj: "12.ABC.345/01DE-35" }).cnpj).toBe("12ABC34501DE35");
  });

  it("exige razão social e UF válida", () => {
    expect(empresaSchema.safeParse({ ...base, razaoSocial: " " }).success).toBe(false);
    expect(empresaSchema.safeParse({ ...base, uf: "XX" }).success).toBe(false);
  });

  it("todas as 27 UFs têm código IBGE; PR é 41", () => {
    expect(Object.keys(UFS)).toHaveLength(27);
    expect(UFS.PR).toBe("41");
  });
});

describe("cnpjsDe", () => {
  it("cadastro da empresa: matriz primeiro, depois filiais", () => {
    expect(cnpjsDe({ cnpj: "11222333000181", filiais: ["11222333000262"] }, { CNPJS_EMPRESA: "99888777000166" })).toEqual([
      "11222333000181",
      "11222333000262",
    ]);
  });

  it("sem cadastro, vale CNPJS_EMPRESA da instalação", () => {
    expect(cnpjsDe(null, { CNPJS_EMPRESA: "11.222.333/0001-81, 99888777000166" })).toEqual(["11222333000181", "99888777000166"]);
    expect(cnpjsDe(null, {})).toEqual([]);
  });
});
