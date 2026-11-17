import { describe, expect, it } from "vitest";
import { atalhosPara, emSecoes, filtrarAtalhos, type ResultadoBusca } from "../busca-global-model";

const hrefs = (lista: ResultadoBusca[]) => lista.map((r) => r.href);

describe("atalhosPara", () => {
  it("campo não recebe atalho nem tela do financeiro", () => {
    const campo = hrefs(atalhosPara("CAMPO"));
    expect(campo).toContain("/diario/novo");
    expect(campo).toContain("/obras");
    for (const rota of ["/notas/nova", "/notas/importar-xml", "/contas", "/dashboard", "/fornecedores", "/usuarios"]) {
      expect(campo).not.toContain(rota);
    }
  });

  it("escritório lança nota, mas não administra usuários", () => {
    const escritorio = hrefs(atalhosPara("ESCRITORIO"));
    expect(escritorio).toContain("/notas/nova");
    expect(escritorio).not.toContain("/usuarios");
    expect(hrefs(atalhosPara("ADMIN"))).toContain("/usuarios");
  });
});

describe("filtrarAtalhos", () => {
  const atalhos = atalhosPara("ADMIN");

  it("sem termo devolve tudo", () => {
    expect(filtrarAtalhos(atalhos, "  ")).toEqual(atalhos);
  });

  it("ignora acento e caixa, e olha também o detalhe", () => {
    expect(hrefs(filtrarAtalhos(atalhos, "DIARIO"))).toEqual(["/diario/novo", "/diario"]);
    expect(hrefs(filtrarAtalhos(atalhos, "orcamento"))).toEqual(["/orcamento"]);
    expect(hrefs(filtrarAtalhos(atalhos, "recibo"))).toEqual(["/notas/nova"]);
  });
});

describe("emSecoes", () => {
  it("agrupa na ordem fixa e numera na ordem em que aparece na tela", () => {
    const secoes = emSecoes([
      { tipo: "material", href: "/materiais/1", titulo: "Cimento" },
      { tipo: "tela", href: "/obras", titulo: "Obras" },
      { tipo: "obra", href: "/obras/1", titulo: "Lote 01" },
      { tipo: "obra", href: "/obras/2", titulo: "Lote 02" },
    ]);
    expect(secoes.map((s) => s.tipo)).toEqual(["tela", "obra", "material"]);
    expect(secoes.flatMap((s) => s.itens.map((i) => [i.href, i.indice]))).toEqual([
      ["/obras", 0],
      ["/obras/1", 1],
      ["/obras/2", 2],
      ["/materiais/1", 3],
    ]);
  });
});
