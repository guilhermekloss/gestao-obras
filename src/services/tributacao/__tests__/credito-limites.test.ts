import { describe, expect, it } from "vitest";
import { inputParaData } from "@/lib/format";
import {
  classificacaoVigente,
  creditoDoItem,
  custoLiquidoCents,
  type ClassificacaoParaCredito,
  type ContextoCredito,
} from "../credito";
import { INICIO_CREDITO_IBS_CBS } from "../ibs-cbs";

const base: ClassificacaoParaCredito = {
  codigo: "000001",
  inicioVigencia: "2026-01-01",
  fimVigencia: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
};
const item = { cClassTrib: "000001", cbsCents: 1_000, ibsUfCents: 50, ibsMunCents: 50 };
const ctx = (extra: Partial<ContextoCredito> = {}): ContextoCredito => ({
  regimeEmpresa: "REGULAR",
  dataEmissao: "2027-01-01",
  classificacao: base,
  ...extra,
});

describe("creditoDoItem: limites de data", () => {
  it("o primeiro dia de crédito é 01/01/2027; 31/12/2026 ainda é teste", () => {
    expect(INICIO_CREDITO_IBS_CBS).toBe("2027-01-01");
    expect(creditoDoItem(item, ctx({ dataEmissao: "2027-01-01" })).situacao).toBe("PERMITIDO");
    expect(creditoDoItem(item, ctx({ dataEmissao: "2026-12-31" })).situacao).toBe("PERIODO_TESTE");
  });

  it("Date gravado ao meio-dia local e texto com hora valem pelo dia", () => {
    expect(creditoDoItem(item, ctx({ dataEmissao: inputParaData("2027-01-01") })).situacao).toBe("PERMITIDO");
    expect(creditoDoItem(item, ctx({ dataEmissao: inputParaData("2026-12-31") })).situacao).toBe("PERIODO_TESTE");
    expect(creditoDoItem(item, ctx({ dataEmissao: "2027-01-01T00:30:00-03:00" })).situacao).toBe("PERMITIDO");
  });

  it("classificação fora da vigência na emissão é desconhecida; fim de vigência é inclusive", () => {
    const encerrada = { ...base, fimVigencia: "2027-03-31" };
    expect(creditoDoItem(item, ctx({ classificacao: encerrada, dataEmissao: "2027-03-31" })).situacao).toBe("PERMITIDO");
    expect(creditoDoItem(item, ctx({ classificacao: encerrada, dataEmissao: "2027-04-01" })).situacao).toBe("CLASSIFICACAO_DESCONHECIDA");
    const futura = { ...base, inicioVigencia: "2027-06-01" };
    expect(creditoDoItem(item, ctx({ classificacao: futura })).situacao).toBe("CLASSIFICACAO_DESCONHECIDA");
  });
});

describe("creditoDoItem: limites de classificação e valores", () => {
  it("classificação de outro código não é usada", () => {
    expect(creditoDoItem({ ...item, cClassTrib: "000002" }, ctx()).situacao).toBe("CLASSIFICACAO_DESCONHECIDA");
    expect(creditoDoItem({ ...item, cClassTrib: null }, ctx()).situacao).toBe("CLASSIFICACAO_DESCONHECIDA");
  });

  it("destaque zero, nulo ou só negativo é SEM_DESTAQUE, antes de olhar regime e data", () => {
    const zerado = { cClassTrib: "000001", cbsCents: 0, ibsUfCents: 0, ibsMunCents: 0 };
    expect(creditoDoItem(zerado, ctx({ regimeEmpresa: "NAO_INFORMADO" })).situacao).toBe("SEM_DESTAQUE");
    expect(creditoDoItem({ ...zerado, cbsCents: -10 }, ctx()).situacao).toBe("SEM_DESTAQUE");
  });

  it("só um tributo destacado: crédito dele", () => {
    expect(creditoDoItem({ cClassTrib: "000001", cbsCents: 1_000, ibsUfCents: null, ibsMunCents: null }, ctx())).toMatchObject({
      situacao: "PERMITIDO",
      creditoCents: 1_000,
      ibsCreditoCents: 0,
    });
  });

  it("classificação que veda os dois tributos: VEDADO com o destacado informado", () => {
    const vedada = { ...base, apropriaCreditoCbs: false, apropriaCreditoIbs: false };
    expect(creditoDoItem(item, ctx({ classificacao: vedada }))).toEqual({
      situacao: "VEDADO",
      destacadoCents: 1_100,
      creditoCents: 0,
      cbsCreditoCents: 0,
      ibsCreditoCents: 0,
      creditoPresumidoAdquirente: false,
    });
  });

  it("só a CBS permitida: PARCIAL", () => {
    expect(creditoDoItem(item, ctx({ classificacao: { ...base, apropriaCreditoIbs: false } }))).toMatchObject({
      situacao: "PARCIAL",
      creditoCents: 1_000,
    });
  });
});

describe("classificacaoVigente: limites", () => {
  const antiga = { ...base, inicioVigencia: "2026-01-01", fimVigencia: "2026-12-31", apropriaCreditoCbs: false };
  const nova = { ...base, inicioVigencia: "2027-01-01" };
  const sobreposta = { ...base, inicioVigencia: "2027-02-01" };

  it("troca de vigência no mesmo código", () => {
    expect(classificacaoVigente([antiga, nova], "000001", "2026-12-31")).toBe(antiga);
    expect(classificacaoVigente([antiga, nova], "000001", "2027-01-01")).toBe(nova);
  });

  it("vigências sobrepostas: a de início mais recente, em qualquer ordem da lista", () => {
    expect(classificacaoVigente([sobreposta, nova], "000001", "2027-03-01")).toBe(sobreposta);
    expect(classificacaoVigente([nova, sobreposta], "000001", "2027-03-01")).toBe(sobreposta);
  });

  it("antes da primeira vigência não há classificação", () => {
    expect(classificacaoVigente([nova], "000001", "2026-06-30")).toBeNull();
  });
});

describe("custoLiquidoCents: limites", () => {
  it("nunca negativo; crédito negativo não aumenta o custo", () => {
    expect(custoLiquidoCents(1_000, 1_500)).toBe(0);
    expect(custoLiquidoCents(1_000, -200)).toBe(1_000);
    expect(custoLiquidoCents(0, 0)).toBe(0);
  });
});
