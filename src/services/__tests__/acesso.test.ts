import { describe, expect, it } from "vitest";
import {
  descreverAcessoObras,
  INTERVALO_ULTIMO_ACESSO_MS,
  podeEditarCadastros,
  podeVerObra,
  restricaoDeObras,
  veFinanceiro,
  ultimoAcessoDesatualizado,
  whereObraIdPermitido,
  whereObrasPermitidas,
} from "../acesso";

const obras = [{ obraId: "a" }, { obraId: "b" }];

describe("restricaoDeObras", () => {
  it("ADMIN e ESCRITORIO veem todas, mesmo com obras gravadas", () => {
    expect(restricaoDeObras({ role: "ADMIN", todasObras: false, obras })).toBeNull();
    expect(restricaoDeObras({ role: "ESCRITORIO", todasObras: false, obras })).toBeNull();
  });

  it("CAMPO com todasObras vê todas", () => {
    expect(restricaoDeObras({ role: "CAMPO", todasObras: true, obras })).toBeNull();
  });

  it("CAMPO limitado vê só as liberadas — inclusive nenhuma", () => {
    expect(restricaoDeObras({ role: "CAMPO", todasObras: false, obras })).toEqual(["a", "b"]);
    expect(restricaoDeObras({ role: "CAMPO", todasObras: false, obras: [] })).toEqual([]);
  });
});

describe("podeVerObra e filtros", () => {
  it("sem restrição libera tudo e não filtra", () => {
    expect(podeVerObra(null, "x")).toBe(true);
    expect(whereObrasPermitidas(null)).toEqual({});
    expect(whereObraIdPermitido(null)).toEqual({});
  });

  it("com restrição filtra pelos ids", () => {
    expect(podeVerObra(["a"], "a")).toBe(true);
    expect(podeVerObra(["a"], "b")).toBe(false);
    expect(podeVerObra([], "a")).toBe(false);
    expect(whereObrasPermitidas(["a"])).toEqual({ id: { in: ["a"] } });
    expect(whereObraIdPermitido([])).toEqual({ obraId: { in: [] } });
  });
});

describe("descreverAcessoObras", () => {
  it("descreve o acesso por papel e obras", () => {
    expect(descreverAcessoObras("ESCRITORIO", false, ["Lote 01"])).toBe("Todas as obras");
    expect(descreverAcessoObras("CAMPO", true, [])).toBe("Todas as obras");
    expect(descreverAcessoObras("CAMPO", false, [])).toBe("Nenhuma obra");
    expect(descreverAcessoObras("CAMPO", false, ["Lote 01", "Lote 02"])).toBe("Lote 01, Lote 02");
    expect(descreverAcessoObras("CAMPO", false, ["L1", "L2", "L3", "L4"])).toBe("L1, L2 e mais 2");
  });
});

describe("ultimoAcessoDesatualizado", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  it("grava quando nunca gravou ou passou do intervalo", () => {
    expect(ultimoAcessoDesatualizado(null, agora)).toBe(true);
    expect(ultimoAcessoDesatualizado(new Date(agora.getTime() - INTERVALO_ULTIMO_ACESSO_MS), agora)).toBe(true);
  });
  it("não grava dentro do intervalo", () => {
    expect(ultimoAcessoDesatualizado(new Date(agora.getTime() - 60_000), agora)).toBe(false);
  });
});

describe("veFinanceiro e podeEditarCadastros", () => {
  it("ADMIN e ESCRITORIO veem valores e editam cadastros; CAMPO não", () => {
    for (const role of ["ADMIN", "ESCRITORIO"] as const) {
      expect(veFinanceiro(role)).toBe(true);
      expect(podeEditarCadastros(role)).toBe(true);
    }
    expect(veFinanceiro("CAMPO")).toBe(false);
    expect(podeEditarCadastros("CAMPO")).toBe(false);
  });
});
