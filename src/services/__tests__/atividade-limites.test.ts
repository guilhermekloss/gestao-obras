import { describe, expect, it } from "vitest";
import { categoriaDoTipo, linkAtividade, serieSemanal, situacaoDeUso, tiposDaCategoria, TIPOS_ATIVIDADE } from "../atividade";

describe("categoriaDoTipo / tiposDaCategoria", () => {
  it("devolve a categoria de um tipo conhecido e null para desconhecido", () => {
    expect(categoriaDoTipo("nota.criar")).toBe("financeiro");
    expect(categoriaDoTipo("rdo.editar")).toBe("campo");
    expect(categoriaDoTipo("nao.existe")).toBeNull();
  });
  it("lista só os tipos da categoria, na ordem do catálogo", () => {
    expect(tiposDaCategoria("campo")).toEqual([
      "rdo.criar",
      "rdo.editar",
      "rdo.excluir",
      "medicao.criar",
      "medicao.excluir",
      "medicao.editar",
    ]);
    expect(tiposDaCategoria("cadastro")).toContain("obra.criar");
    expect(tiposDaCategoria("cadastro")).not.toContain("nota.criar");
  });
  it("as categorias particionam o catálogo inteiro", () => {
    const total = (["financeiro", "cadastro", "campo", "acesso"] as const).flatMap(tiposDaCategoria);
    expect(total.sort()).toEqual(Object.keys(TIPOS_ATIVIDADE).sort());
  });
});

describe("linkAtividade: cada entidade e os casos sem id", () => {
  const sem = { entidadeId: null, obraIds: [] as string[] };
  it("obra, fornecedor e usuário levam à página do registro", () => {
    expect(linkAtividade({ tipo: "obra.editar", entidade: "obra", entidadeId: "7", obraIds: [] })).toBe("/obras/7");
    expect(linkAtividade({ tipo: "fornecedor.editar", entidade: "fornecedor", entidadeId: "7", obraIds: [] })).toBe("/fornecedores/7");
    expect(linkAtividade({ tipo: "usuario.editar", entidade: "usuario", entidadeId: "7", obraIds: [] })).toBe("/usuarios/7");
  });
  it("sem id do registro não há link", () => {
    for (const entidade of ["nota", "rdo", "obra", "fornecedor", "usuario"]) {
      expect(linkAtividade({ tipo: "x.editar", entidade, ...sem })).toBeNull();
    }
  });
  it("medição sem obra não tem link; sem entidade e sem obra também não", () => {
    expect(linkAtividade({ tipo: "medicao.criar", entidade: "medicao", ...sem })).toBeNull();
    expect(linkAtividade({ tipo: "importacao.planilhas", entidade: null, ...sem })).toBeNull();
  });
  it("qualquer tipo terminado em .excluir não tem link, mesmo com id", () => {
    expect(linkAtividade({ tipo: "obra.excluir", entidade: "obra", entidadeId: "7", obraIds: [] })).toBeNull();
  });
});

describe("serieSemanal: bordas do período", () => {
  // quarta-feira; semanas começam na segunda
  const agora = new Date(2026, 9, 14, 12);
  it("conta só as últimas N semanas, incluindo a primeira e a atual", () => {
    const serie = serieSemanal(
      [
        new Date(2026, 8, 27, 23), // domingo: semana anterior à primeira → fora
        new Date(2026, 8, 28, 0, 30), // segunda da primeira semana
        new Date(2026, 9, 5, 10), // segunda da semana do meio
        new Date(2026, 9, 12, 9), // semana atual
        new Date(2026, 9, 14, 11), // semana atual
        new Date(2026, 9, 19, 9), // semana que vem → fora
      ],
      3,
      agora,
    );
    expect(serie.map((s) => s.total)).toEqual([1, 1, 2]);
    expect(serie.map((s) => s.inicio)).toEqual([new Date(2026, 8, 28), new Date(2026, 9, 5), new Date(2026, 9, 12)]);
  });
});

describe("situacaoDeUso: limite de dias parado", () => {
  const agora = new Date("2026-10-15T12:00:00Z");
  const DIA = 24 * 60 * 60 * 1000;
  it("exatamente 30 dias ainda é em uso; passou disso, parado", () => {
    expect(situacaoDeUso({ ativo: true, ultimoAcessoEm: new Date(agora.getTime() - 30 * DIA) }, agora)).toBe("em_uso");
    expect(situacaoDeUso({ ativo: true, ultimoAcessoEm: new Date(agora.getTime() - 30 * DIA - 1000) }, agora)).toBe("parado");
  });
  it("respeita o limite informado", () => {
    expect(situacaoDeUso({ ativo: true, ultimoAcessoEm: new Date(agora.getTime() - 8 * DIA) }, agora, 7)).toBe("parado");
  });
});
