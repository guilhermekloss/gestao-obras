import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { parseNfeXml } from "../../nfe-xml";
import { DESCRICAO_IBS_CBS_POR_FORA } from "../ibs-cbs";
import type { ClassificacaoParaCredito } from "../credito";
import {
  agregarCustoLiquido,
  aplicarCredito,
  avisosDoCredito,
  codigosParaClassificar,
  haCredito,
  liquidoDoItem,
  liquidosDosItens,
  modoDoCusto,
  somarCustosLiquidos,
  type ContextoCustoLiquido,
  type NotaParaCustoLiquido,
} from "../custo-liquido";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { acumular } = await import("../../custos");

const permitida: ClassificacaoParaCredito = {
  codigo: "000001",
  inicioVigencia: "2026-01-01",
  fimVigencia: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
};
const vedada: ClassificacaoParaCredito = { ...permitida, codigo: "410999", apropriaCreditoCbs: false, apropriaCreditoIbs: false };
const ctx: ContextoCustoLiquido = { regimeEmpresa: "REGULAR", classificacoes: [permitida, vedada] };

// item de R$ 1.000,00 com R$ 100,00 de CBS e R$ 10,00 de IBS (UF)
const item = (extra: Partial<NotaParaCustoLiquido["itens"][number]> = {}) => ({
  totalCents: 100_000,
  cClassTrib: "000001",
  cbsCents: 10_000,
  ibsUfCents: 1_000,
  ibsMunCents: 0,
  ...extra,
});
const nota = (extra: Partial<NotaParaCustoLiquido> = {}): NotaParaCustoLiquido => ({
  dataCompra: "2027-03-10",
  itens: [item()],
  rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }],
  ...extra,
});
const porObra = (notas: NotaParaCustoLiquido[], c = ctx) => agregarCustoLiquido(notas, c, (_, r) => r.obraId);

describe("agregarCustoLiquido: rateio", () => {
  it("nota inteira numa obra: bruto, crédito e líquido fecham", () => {
    expect(porObra([nota()]).get("o1")).toEqual({
      brutoCents: 100_000,
      destacadoCents: 11_000,
      creditoCents: 11_000,
      liquidoCents: 89_000,
      porSituacao: { PERMITIDO: 11_000 },
    });
  });

  it("crédito segue a fração do rateio de cada obra", () => {
    const r = porObra([
      nota({
        rateios: [
          { obraId: "o1", etapaId: null, fracaoBp: 7_000 },
          { obraId: "o2", etapaId: null, fracaoBp: 3_000 },
        ],
      }),
    ]);
    expect(r.get("o1")).toMatchObject({ brutoCents: 70_000, creditoCents: 7_700, liquidoCents: 62_300 });
    expect(r.get("o2")).toMatchObject({ brutoCents: 30_000, creditoCents: 3_300, liquidoCents: 26_700 });
  });

  it("o bruto é o mesmo de acumular() de custos.ts, inclusive no arredondamento por nota", () => {
    const notas = [
      nota({ itens: [item({ totalCents: 3_333 }), item({ totalCents: 1_001 })], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 3_333 }, { obraId: "o2", etapaId: null, fracaoBp: 6_667 }] }),
      nota({ itens: [item({ totalCents: 5 })], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 5_000 }] }),
    ];
    const esperado = acumular(notas, (_, r) => r.obraId);
    const r = porObra(notas);
    for (const [obra, cents] of esperado) expect(r.get(obra)?.brutoCents).toBe(cents);
  });

  it("crédito rateado com meio centavo arredonda como o bruto (para cima no .5)", () => {
    // crédito 1 centavo × 50% = 0,5 → 1; bruto 1 × 50% = 0,5 → 1
    const r = porObra([nota({ itens: [item({ totalCents: 1, cbsCents: 1, ibsUfCents: 0 })], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 5_000 }] })]);
    expect(r.get("o1")).toMatchObject({ brutoCents: 1, creditoCents: 1, liquidoCents: 0 });
  });

  it("nota sem rateio (compra da empresa) não entra", () => {
    expect(porObra([nota({ rateios: [] })]).size).toBe(0);
  });

  it("agrupa por etapa, com o rateio sem etapa na chave null", () => {
    const r = agregarCustoLiquido(
      [nota({ rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 5_000 }, { obraId: "o1", etapaId: null, fracaoBp: 5_000 }] })],
      ctx,
      (_, rat) => rat.etapaId,
    );
    expect(r.get("e1")?.creditoCents).toBe(5_500);
    expect(r.get(null)?.creditoCents).toBe(5_500);
  });

  it("agrupa por mês da compra", () => {
    const r = agregarCustoLiquido([nota({ dataCompra: "2027-03-10" }), nota({ dataCompra: "2027-04-01" })], ctx, (n) => String(n.dataCompra).slice(0, 7));
    expect([...r.keys()]).toEqual(["2027-03", "2027-04"]);
  });
});

describe("agregarCustoLiquido: situações", () => {
  it("2026 é período de teste: destacado aparece, crédito não", () => {
    const r = porObra([nota({ dataCompra: "2026-12-31" })]).get("o1");
    expect(r).toMatchObject({ destacadoCents: 11_000, creditoCents: 0, liquidoCents: 100_000, porSituacao: { PERIODO_TESTE: 11_000 } });
  });

  it("regime Simples e regime não informado não creditam, e cada um aparece na própria situação", () => {
    expect(porObra([nota()], { ...ctx, regimeEmpresa: "SIMPLES_NACIONAL" }).get("o1")).toMatchObject({ creditoCents: 0, porSituacao: { REGIME_NAO_REGULAR: 11_000 } });
    expect(porObra([nota()], { ...ctx, regimeEmpresa: "NAO_INFORMADO" }).get("o1")).toMatchObject({ creditoCents: 0, porSituacao: { REGIME_NAO_INFORMADO: 11_000 } });
  });

  it("classificação vedada ou desconhecida: sem crédito, separadas no resumo", () => {
    const r = porObra([nota({ itens: [item(), item({ cClassTrib: "410999" }), item({ cClassTrib: "999999" })] })]).get("o1");
    expect(r).toMatchObject({ creditoCents: 11_000, destacadoCents: 33_000, porSituacao: { PERMITIDO: 11_000, VEDADO: 11_000, CLASSIFICACAO_DESCONHECIDA: 11_000 } });
  });

  it("item sem destaque não entra no resumo por situação, mas conta no bruto", () => {
    const r = porObra([nota({ itens: [item({ cbsCents: null, ibsUfCents: null, ibsMunCents: null, cClassTrib: null })] })]).get("o1");
    expect(r).toMatchObject({ brutoCents: 100_000, destacadoCents: 0, creditoCents: 0, porSituacao: {} });
  });

  it("fração tão pequena que o destacado rateado zera não cria situação com zero", () => {
    const r = porObra([nota({ itens: [item({ cbsCents: 1, ibsUfCents: 0 })], rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 1 }] })]).get("o1");
    expect(r?.porSituacao).toEqual({});
  });

  it("crédito acima do bruto (dado inconsistente) não gera líquido negativo", () => {
    const r = porObra([nota({ itens: [item({ totalCents: 500, cbsCents: 900, ibsUfCents: 0 })] })]).get("o1");
    expect(r).toMatchObject({ brutoCents: 500, creditoCents: 900, liquidoCents: 0 });
  });
});

describe("somarCustosLiquidos", () => {
  it("soma as partes e refaz o líquido do total, juntando as situações", () => {
    const r = porObra([
      nota({ rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 5_000 }, { obraId: "o2", etapaId: null, fracaoBp: 5_000 }] }),
      nota({ dataCompra: "2026-06-01", rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }] }),
    ]);
    expect(somarCustosLiquidos(r.values())).toEqual({
      brutoCents: 200_000,
      destacadoCents: 22_000,
      creditoCents: 11_000,
      liquidoCents: 189_000,
      porSituacao: { PERMITIDO: 11_000, PERIODO_TESTE: 11_000 },
    });
  });

  it("sem partes, tudo zero", () => {
    expect(somarCustosLiquidos([])).toEqual({ brutoCents: 0, destacadoCents: 0, creditoCents: 0, liquidoCents: 0, porSituacao: {} });
  });
});

describe("aplicarCredito", () => {
  it("líquido = bruto - crédito; crédito negativo vira zero; nunca abaixo de zero", () => {
    expect(aplicarCredito(1_000, 300)).toEqual({ brutoCents: 1_000, creditoCents: 300, liquidoCents: 700 });
    expect(aplicarCredito(1_000, -5)).toEqual({ brutoCents: 1_000, creditoCents: 0, liquidoCents: 1_000 });
    expect(aplicarCredito(100, 300).liquidoCents).toBe(0);
  });
});

describe("liquidoDoItem", () => {
  it("tira o crédito do item pela classificação vigente na data da nota", () => {
    expect(liquidoDoItem(item(), "2027-03-10", ctx)).toBe(89_000);
    expect(liquidoDoItem(item(), "2026-03-10", ctx)).toBe(100_000);
    expect(liquidoDoItem(item({ cClassTrib: "410999" }), "2027-03-10", ctx)).toBe(100_000);
  });
});

describe("IBS/CBS por fora: líquido por item", () => {
  // produto de R$ 1.000,00 sem o imposto (R$ 110,00 destacado, todo creditável) + linha acessória do imposto
  const produto = () => item();
  const acessorio = () => ({ descricao: DESCRICAO_IBS_CBS_POR_FORA, totalCents: 11_000, cClassTrib: null, cbsCents: null, ibsUfCents: null, ibsMunCents: null });

  it("o imposto pago à parte e recuperado não sobra no produto: total + destacado - crédito; a linha por fora zera", () => {
    expect(liquidosDosItens([produto(), acessorio()], "2027-03-10", ctx)).toEqual([100_000, 0]);
  });
  it("por fora e não creditável (vedado): o imposto é custo do produto", () => {
    expect(liquidosDosItens([item({ cClassTrib: "410999" }), acessorio()], "2027-03-10", ctx)).toEqual([111_000, 0]);
  });
  it("sem linha por fora, o imposto está embutido no total: total - crédito, como antes", () => {
    expect(liquidosDosItens([produto()], "2027-03-10", ctx)).toEqual([89_000]);
  });

  it("soma dos líquidos por item = líquido da nota (fixture vNFTot), sem diferença de arredondamento", () => {
    const r = parseNfeXml(readFileSync(path.join(__dirname, "../../__tests__/fixtures/nfe-ibscbs-crt3-vnftot.xml"), "utf8"));
    if (!r.ok) throw new Error(r.erro);
    const itens = r.nfe.itens.map((i) => ({
      descricao: i.descricao,
      totalCents: i.totalCents,
      cClassTrib: i.ibsCbs?.cClassTrib ?? null,
      cbsCents: i.ibsCbs?.cbsCents ?? null,
      ibsUfCents: i.ibsCbs?.ibsUfCents ?? null,
      ibsMunCents: i.ibsCbs?.ibsMunCents ?? null,
    }));
    const porItem = liquidosDosItens(itens, "2027-03-12", ctx);
    const nota = agregarCustoLiquido([{ dataCompra: "2027-03-12", itens, rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 10_000 }] }], ctx, (_, rt) => rt.obraId).get("o1")!;
    expect(nota).toMatchObject({ brutoCents: 62_116, creditoCents: 3_116, liquidoCents: 59_000 });
    expect(porItem.reduce((a, v) => a + v, 0)).toBe(nota.liquidoCents);
    // cimento: vProd 350,00 fica 350,00 (e não 318,84)
    expect(porItem[0]).toBe(35_000);
    expect(porItem.at(-1)).toBe(0);
  });
});

describe("modo de exibição e avisos", () => {
  it("o líquido só assume com regime regular e crédito; ?custo=bruto força o bruto", () => {
    expect(haCredito("REGULAR", 1)).toBe(true);
    expect(haCredito("REGULAR", 0)).toBe(false);
    expect(haCredito("SIMPLES_NACIONAL", 500)).toBe(false);
    expect(modoDoCusto("REGULAR", 500)).toBe("LIQUIDO");
    expect(modoDoCusto("REGULAR", 500, "bruto")).toBe("BRUTO");
    expect(modoDoCusto("REGULAR", 500, "qualquer")).toBe("LIQUIDO");
    expect(modoDoCusto("REGULAR", 0)).toBe("BRUTO");
    expect(modoDoCusto("NAO_INFORMADO", 500)).toBe("BRUTO");
  });

  it("pede o regime só com regime não informado e destaque de verdade", () => {
    expect(avisosDoCredito("NAO_INFORMADO", { porSituacao: { REGIME_NAO_INFORMADO: 10 } }).pedirRegime).toBe(true);
    expect(avisosDoCredito("NAO_INFORMADO", { porSituacao: {} }).pedirRegime).toBe(false);
    expect(avisosDoCredito("REGULAR", { porSituacao: { REGIME_NAO_INFORMADO: 10 } }).pedirRegime).toBe(false);
  });

  it("separa teste de 2026 e o que ficou sem crédito no regime regular", () => {
    expect(avisosDoCredito("REGULAR", { porSituacao: { PERIODO_TESTE: 5, VEDADO: 7, CLASSIFICACAO_DESCONHECIDA: 3, PERMITIDO: 100 } })).toEqual({
      pedirRegime: false,
      periodoTesteCents: 5,
      naoCreditadoCents: 10,
    });
  });
});

describe("codigosParaClassificar", () => {
  const notas = [{ dataCompra: "2027-01-01", itens: [item(), item({ cClassTrib: "410999" }), item({ cClassTrib: null }), item({ cbsCents: 0, ibsUfCents: 0, cClassTrib: "777777" })] }];

  it("só códigos de itens com destaque, sem repetir", () => {
    expect(codigosParaClassificar([...notas, ...notas], "REGULAR").sort()).toEqual(["000001", "410999"]);
  });

  it("fora do regime regular a classificação não pesa: nenhuma consulta", () => {
    expect(codigosParaClassificar(notas, "SIMPLES_NACIONAL")).toEqual([]);
    expect(codigosParaClassificar(notas, "NAO_INFORMADO")).toEqual([]);
  });
});
