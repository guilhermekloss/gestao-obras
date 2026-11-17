import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { agrupar, dividirBarra, itensPara, naRota, TITULOS } from "../nav-itens";

const rotas = (role: Role) => itensPara(role).map((i) => i.href);

describe("itensPara: permissões por papel", () => {
  it("ADMIN vê todas as telas", () => {
    expect(rotas("ADMIN")).toEqual([
      "/dashboard",
      "/obras",
      "/diario",
      "/cronograma",
      "/notas",
      "/contas",
      "/orcamento",
      "/fornecedores",
      "/materiais",
      "/usuarios",
      "/empresa",
      "/sefaz",
    ]);
  });

  it("ESCRITORIO vê tudo, menos Usuários, Empresa e Captura Sefaz", () => {
    expect(rotas("ESCRITORIO")).toEqual(rotas("ADMIN").filter((r) => !["/usuarios", "/empresa", "/sefaz"].includes(r)));
  });

  it("CAMPO vê só Obras, Diário e Cronograma", () => {
    expect(rotas("CAMPO")).toEqual(["/obras", "/diario", "/cronograma"]);
  });
});

describe("dividirBarra", () => {
  it("escritório: 4 fixos na barra e o resto em Mais, sem perder nenhuma tela", () => {
    for (const role of ["ADMIN", "ESCRITORIO"] as const) {
      const itens = itensPara(role);
      const { barra, mais } = dividirBarra(itens);
      expect(barra.map((i) => i.href)).toEqual(["/dashboard", "/notas", "/contas", "/diario"]);
      expect(mais.map((i) => i.href)).toContain("/cronograma");
      expect([...barra, ...mais].map((i) => i.href).sort()).toEqual(rotas(role).sort());
    }
  });

  it("campo: cabe tudo na barra e não aparece Mais", () => {
    const { barra, mais } = dividirBarra(itensPara("CAMPO"));
    expect(barra.map((i) => i.href)).toEqual(["/obras", "/diario", "/cronograma"]);
    expect(mais).toEqual([]);
  });

  it("nunca passa de 4 itens na barra", () => {
    for (const role of ["ADMIN", "ESCRITORIO", "CAMPO"] as const) {
      expect(dividirBarra(itensPara(role)).barra.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("agrupar", () => {
  it("ADMIN vê as cinco seções, sem perder nem repetir tela", () => {
    const grupos = agrupar(itensPara("ADMIN"));
    expect(grupos.map((g) => g.grupo)).toEqual(["Visão geral", "Obra", "Financeiro", "Cadastros", "Administração"]);
    expect(grupos.flatMap((g) => g.itens.map((i) => i.href))).toEqual(rotas("ADMIN"));
  });

  it("CAMPO vê só a seção Obra", () => {
    expect(agrupar(itensPara("CAMPO")).map((g) => g.grupo)).toEqual(["Obra"]);
  });
});

describe("naRota", () => {
  it("casa a rota e as filhas, sem confundir prefixos parecidos", () => {
    expect(naRota("/contas", "/contas")).toBe(true);
    expect(naRota("/contas/fluxo", "/contas")).toBe(true);
    expect(naRota("/obras/abc", "/obras")).toBe(true);
    expect(naRota("/orcamento", "/obras")).toBe(false);
    expect(naRota("/notasx", "/notas")).toBe(false);
  });
});

describe("TITULOS", () => {
  it("dá nome também à página Minha conta, que não está no menu", () => {
    expect(TITULOS.find((t) => naRota("/conta", t.href))?.label).toBe("Minha conta");
  });
});
