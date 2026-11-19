import { describe, expect, it } from "vitest";
import { inputParaData } from "@/lib/format";
import {
  classificacaoVigente,
  creditoDaNota,
  creditoDoItem,
  custoLiquidoCents,
  type ClassificacaoParaCredito,
  type ContextoCredito,
} from "../credito";

const integral: ClassificacaoParaCredito = {
  codigo: "000001",
  inicioVigencia: "2026-01-01",
  fimVigencia: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
};
const imune: ClassificacaoParaCredito = { ...integral, codigo: "410999", apropriaCreditoCbs: false, apropriaCreditoIbs: false };
const soIbs: ClassificacaoParaCredito = { ...integral, codigo: "200025", apropriaCreditoCbs: false };

const item = { cClassTrib: "000001", cbsCents: 3_080, ibsUfCents: 18, ibsMunCents: 18 };
const ctx = (extra: Partial<ContextoCredito> = {}): ContextoCredito => ({
  regimeEmpresa: "REGULAR",
  dataEmissao: "2027-02-10",
  classificacao: integral,
  ...extra,
});

describe("creditoDoItem", () => {
  it("regime regular, 2027, classificação que permite: crédito = CBS + IBS da UF + IBS do município", () => {
    expect(creditoDoItem(item, ctx())).toEqual({
      situacao: "PERMITIDO",
      destacadoCents: 3_116,
      creditoCents: 3_116,
      cbsCreditoCents: 3_080,
      ibsCreditoCents: 36,
      creditoPresumidoAdquirente: false,
    });
  });

  it("2026 é período de teste: sem crédito no custo", () => {
    expect(creditoDoItem(item, ctx({ dataEmissao: "2026-09-15" }))).toMatchObject({ situacao: "PERIODO_TESTE", creditoCents: 0, destacadoCents: 3_116 });
  });

  it("sem regime regular não há crédito", () => {
    expect(creditoDoItem(item, ctx({ regimeEmpresa: "SIMPLES_NACIONAL" })).situacao).toBe("REGIME_NAO_REGULAR");
    expect(creditoDoItem(item, ctx({ regimeEmpresa: "NAO_INFORMADO" })).situacao).toBe("REGIME_NAO_INFORMADO");
  });

  it("classificação que veda, ou que permite só um tributo", () => {
    expect(creditoDoItem({ ...item, cClassTrib: "410999" }, ctx({ classificacao: imune }))).toMatchObject({ situacao: "VEDADO", creditoCents: 0 });
    expect(creditoDoItem({ ...item, cClassTrib: "200025" }, ctx({ classificacao: soIbs }))).toMatchObject({
      situacao: "PARCIAL",
      cbsCreditoCents: 0,
      ibsCreditoCents: 36,
      creditoCents: 36,
    });
  });

  it("classificação desconhecida: crédito zero (conservador)", () => {
    expect(creditoDoItem(item, ctx({ classificacao: null })).situacao).toBe("CLASSIFICACAO_DESCONHECIDA");
  });

  it("item sem destaque (nota antiga, lançamento manual)", () => {
    expect(creditoDoItem({ cClassTrib: null, cbsCents: null, ibsUfCents: null, ibsMunCents: null }, ctx()).situacao).toBe("SEM_DESTAQUE");
  });

  it("sinaliza crédito presumido do adquirente sem somá-lo", () => {
    const presumido = { ...integral, codigo: "410014", creditoPresumidoAdquirente: true };
    expect(creditoDoItem({ ...item, cClassTrib: "410014" }, ctx({ classificacao: presumido }))).toMatchObject({
      creditoPresumidoAdquirente: true,
      creditoCents: 3_116,
    });
  });
});

describe("creditoDaNota", () => {
  it("escolhe a classificação de cada item e soma; itens sem destaque não contam", () => {
    const r = creditoDaNota(
      [item, { cClassTrib: "410999", cbsCents: null, ibsUfCents: null, ibsMunCents: null }, { ...item, cClassTrib: "999999" }],
      { regimeEmpresa: "REGULAR", dataEmissao: inputParaData("2027-02-10"), classificacoes: [integral, imune] },
    );
    expect(r.itens.map((i) => i.situacao)).toEqual(["PERMITIDO", "SEM_DESTAQUE", "CLASSIFICACAO_DESCONHECIDA"]);
    expect(r.creditoCents).toBe(3_116);
    expect(r.destacadoCents).toBe(6_232);
  });
});

describe("custoLiquidoCents", () => {
  it("total menos o crédito", () => {
    expect(custoLiquidoCents(62_116, 3_116)).toBe(59_000);
    expect(custoLiquidoCents(62_116, 0)).toBe(62_116);
  });
});

describe("classificacaoVigente", () => {
  it("acha pelo código na data", () => {
    expect(classificacaoVigente([imune, integral], "000001", "2027-01-01")).toBe(integral);
    expect(classificacaoVigente([integral], "000002", "2027-01-01")).toBeNull();
    expect(classificacaoVigente([integral], null, "2027-01-01")).toBeNull();
  });
});
