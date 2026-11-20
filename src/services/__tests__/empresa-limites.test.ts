import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { empresa: { findUnique } } }));

const { carregarEmpresa, carregarRegimeIbsCbs, cnpjsDaEmpresa, empresaSchema, rotuloCnpj } = await import("../empresa");

const base = { razaoSocial: "Construtora Teste Ltda", cnpj: "11.222.333/0001-81", uf: "PR" };

afterEach(() => {
  vi.unstubAllEnvs();
  findUnique.mockReset();
});

describe("empresaSchema: limites", () => {
  it("sem o campo de filiais, nenhuma filial", () => {
    expect(empresaSchema.parse(base).filiais).toEqual([]);
  });

  it("mensagens completas: dígito da matriz e tamanho da filial, citando o valor", () => {
    expect(empresaSchema.safeParse({ ...base, cnpj: "11.222.333/0001-82" }).error?.issues[0].message).toBe(
      "CNPJ da matriz: CNPJ inválido, confira os dígitos",
    );
    expect(empresaSchema.safeParse({ ...base, filiais: "123" }).error?.issues[0].message).toBe("Filial: informe os 14 caracteres do CNPJ (123)");
  });
});

describe("carregarEmpresa / cnpjsDaEmpresa", () => {
  it("lê o cadastro único da empresa", async () => {
    findUnique.mockResolvedValue({ id: "principal", cnpj: "11222333000181", filiais: [] });
    expect(await carregarEmpresa()).toEqual({ id: "principal", cnpj: "11222333000181", filiais: [] });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "principal" } });
  });

  it("matriz e filiais do cadastro; sem cadastro, a variável da instalação", async () => {
    findUnique.mockResolvedValue({ cnpj: "11222333000181", filiais: ["11222333000262"] });
    expect(await cnpjsDaEmpresa()).toEqual(["11222333000181", "11222333000262"]);

    findUnique.mockResolvedValue(null);
    vi.stubEnv("CNPJS_EMPRESA", "11.222.333/0001-81");
    expect(await cnpjsDaEmpresa()).toEqual(["11222333000181"]);
  });
});

describe("carregarRegimeIbsCbs", () => {
  it("o regime do cadastro; sem cadastro, não informado", async () => {
    findUnique.mockResolvedValue({ id: "principal", regimeIbsCbs: "REGULAR" });
    expect(await carregarRegimeIbsCbs()).toBe("REGULAR");
    findUnique.mockResolvedValue(null);
    expect(await carregarRegimeIbsCbs()).toBe("NAO_INFORMADO");
  });

  it("com outro cliente (transação) lê só o regime por ele", async () => {
    const db = { empresa: { findUnique: vi.fn(async (_: object) => ({ regimeIbsCbs: "SIMPLES_NACIONAL" })) } };
    expect(await carregarRegimeIbsCbs(db as never)).toBe("SIMPLES_NACIONAL");
    expect(db.empresa.findUnique).toHaveBeenCalledWith({ where: { id: "principal" }, select: { regimeIbsCbs: true } });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("rotuloCnpj", () => {
  it("formata só CNPJ de 14 dígitos; o resto volta como veio", () => {
    expect(rotuloCnpj("11222333000181")).toBe("11.222.333/0001-81");
    for (const v of ["12ABC34501DE35", "x11222333000181", "112223330001810", "1", "abcdefghijklmn"]) expect(rotuloCnpj(v)).toBe(v);
  });
});
