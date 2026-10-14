import { describe, expect, it } from "vitest";
import {
  categoriaDoTipo,
  linkAtividade,
  resumirPorObra,
  serieSemanal,
  situacaoDeUso,
  tiposDaCategoria,
} from "../atividade";

describe("catálogo", () => {
  it("cada tipo tem categoria e as categorias cobrem os tipos", () => {
    expect(categoriaDoTipo("rdo.criar")).toBe("campo");
    expect(categoriaDoTipo("nota.criar")).toBe("financeiro");
    expect(categoriaDoTipo("desconhecido")).toBeNull();
    expect(tiposDaCategoria("acesso")).toContain("convite.aceito");
  });
});

describe("linkAtividade", () => {
  const base = { entidadeId: "1", obraIds: ["o1"] };
  it("abre o registro afetado", () => {
    expect(linkAtividade({ ...base, tipo: "nota.criar", entidade: "nota" })).toBe("/notas/1");
    expect(linkAtividade({ ...base, tipo: "rdo.editar", entidade: "rdo" })).toBe("/diario/1");
    expect(linkAtividade({ ...base, tipo: "medicao.criar", entidade: "medicao" })).toBe("/cronograma?obra=o1&aba=avanco");
    expect(linkAtividade({ ...base, tipo: "convite.criar", entidade: "convite" })).toBe("/usuarios?aba=convites");
  });
  it("exclusões não têm link", () => {
    expect(linkAtividade({ ...base, tipo: "nota.excluir", entidade: "nota" })).toBeNull();
    expect(linkAtividade({ ...base, tipo: "convite.revogar", entidade: "convite" })).toBeNull();
  });
  it("sem entidade, cai na obra quando é uma só", () => {
    expect(linkAtividade({ tipo: "importacao.planilhas", entidade: null, entidadeId: null, obraIds: ["o1"] })).toBe("/obras/o1");
    expect(linkAtividade({ tipo: "importacao.planilhas", entidade: null, entidadeId: null, obraIds: ["a", "b"] })).toBeNull();
  });
});

describe("serieSemanal", () => {
  // quarta-feira
  const agora = new Date(2026, 9, 14, 10);
  it("agrupa por semana (segunda a domingo) e ignora fora da janela", () => {
    const serie = serieSemanal(
      [
        new Date(2026, 9, 12, 8), // segunda desta semana
        new Date(2026, 9, 18, 20), // domingo desta semana
        new Date(2026, 9, 11, 23), // domingo da semana passada
        new Date(2026, 5, 1), // fora da janela
      ],
      4,
      agora,
    );
    expect(serie).toHaveLength(4);
    expect(serie.map((s) => s.total)).toEqual([0, 0, 1, 2]);
    expect(serie[3].inicio).toEqual(new Date(2026, 9, 12));
  });
});

describe("resumirPorObra", () => {
  it("soma RDOs, avanços e lançamentos rateados por obra, mais recente primeiro", () => {
    const r = resumirPorObra({
      rdos: [
        { obraId: "a", criadoEm: new Date(2026, 9, 1) },
        { obraId: "a", criadoEm: new Date(2026, 9, 5) },
      ],
      medicoes: [{ obraId: "b", criadoEm: new Date(2026, 9, 10) }],
      notas: [
        {
          criadoEm: new Date(2026, 9, 3),
          totalCents: 10000,
          rateios: [
            { obraId: "a", fracaoBp: 6000 },
            { obraId: "b", fracaoBp: 4000 },
          ],
        },
      ],
    });
    expect(r.map((x) => x.obraId)).toEqual(["b", "a"]);
    expect(r[1]).toMatchObject({ rdos: 2, lancamentos: 1, valorCents: 6000, ultimaEm: new Date(2026, 9, 5) });
    expect(r[0]).toMatchObject({ medicoes: 1, lancamentos: 1, valorCents: 4000 });
  });
});

describe("situacaoDeUso", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  it("classifica contas", () => {
    expect(situacaoDeUso({ ativo: false, ultimoAcessoEm: agora }, agora)).toBe("inativo");
    expect(situacaoDeUso({ ativo: true, ultimoAcessoEm: null }, agora)).toBe("nunca");
    expect(situacaoDeUso({ ativo: true, ultimoAcessoEm: new Date("2026-09-01T12:00:00Z") }, agora)).toBe("parado");
    expect(situacaoDeUso({ ativo: true, ultimoAcessoEm: new Date("2026-10-10T12:00:00Z") }, agora)).toBe("em_uso");
  });
});
