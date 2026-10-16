import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseValorBr,
  parseDataBr,
  importarPlanilhas,
} from "../importacao";

const CSV_FINANCEIRO = `fornecedor;cnpj;nf;data;valor_total;forma;parcela1_valor;parcela1_venc;parcela1_pagoem;parcela2_valor;parcela2_venc;parcela2_pagoem
Aço Forte;12.345.678/0001-90;100;15/01/2026;1.000,00;CARTÃO;500,00;20/02/2026;20/02/2026;500,00;20/03/2026;
Madeireira Sul;;200;10/01/2026;300,00;PIX;300,00;10/01/2026;10/01/2026;;;`;

const CSV_ITENS = `fornecedor;nf;data;descricao;tipo;qtde;unidade;unitario;desconto;L03;L19
Aço Forte;100;15/01/2026;CA50 8MM;material;10;BR;80,00;0;60;40
Aço Forte;100;15/01/2026;FRETE;frete;1;FRETE;200,00;0;100;
Madeireira Sul;200;10/01/2026;Tábua pinus;material;30;PC;10,00;0;;100`;

describe("parseValorBr / parseDataBr", () => {
  it("converte moeda BR para centavos", () => {
    expect(parseValorBr("1.234,56")).toBe(123456);
    expect(parseValorBr("R$ 300,00")).toBe(30000);
    expect(parseValorBr("")).toBe(0);
  });

  it("converte data dd/mm/aaaa", () => {
    expect(parseDataBr("15/01/2026")).toEqual(new Date(2026, 0, 15, 12));
    expect(parseDataBr("invalida")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("normaliza cabeçalhos e lê linhas", () => {
    const rows = parseCsv("Nº NF;Valor Total\n100;1,00");
    expect(rows[0]["n_nf"]).toBe("100");
    expect(rows[0]["valor_total"]).toBe("1,00");
  });
});

describe("importarPlanilhas", () => {
  const resultado = importarPlanilhas(CSV_ITENS, CSV_FINANCEIRO, ["L03", "L19"]);

  it("monta as notas com itens e parcelas ligados por fornecedor+nf", () => {
    expect(resultado.notas).toHaveLength(2);
    const aco = resultado.notas.find((n) => n.numero === "100")!;
    expect(aco.itens).toHaveLength(2);
    expect(aco.parcelas).toHaveLength(2);
    expect(aco.formaPagto).toBe("CARTAO");
    expect(aco.totalCents).toBe(100000);
  });

  it("normaliza o rateio pelas colunas de obra somando 100% (rateio único por nota)", () => {
    const aco = resultado.notas.find((n) => n.numero === "100")!;
    expect(aco.rateios).toEqual([
      { codigoObra: "L03", fracaoBp: 6800 },
      { codigoObra: "L19", fracaoBp: 3200 },
    ]);

    const madeireira = resultado.notas.find((n) => n.numero === "200")!;
    expect(madeireira.rateios).toEqual([{ codigoObra: "L19", fracaoBp: 10000 }]);
  });

  it("marca parcela paga quando há data de pagamento", () => {
    const aco = resultado.notas.find((n) => n.numero === "100")!;
    expect(aco.parcelas[0].pagaEm).not.toBeNull();
    expect(aco.parcelas[1].pagaEm).toBeNull();
  });

  it("reporta divergência total × itens (o comparador FALSO)", () => {
    expect(
      resultado.inconsistencias.filter((i) => i.includes("difere do total")),
    ).toHaveLength(0);
  });

  it("detecta soma de parcelas diferente do total", () => {
    const fin = CSV_FINANCEIRO.replace("500,00;20/03/2026", "400,00;20/03/2026");
    const r = importarPlanilhas(CSV_ITENS, fin, ["L03", "L19"]);
    expect(r.inconsistencias.some((i) => i.includes("soma das parcelas"))).toBe(true);
  });

  it("cria nota mínima quando NF só existe nos itens", () => {
    const r = importarPlanilhas(CSV_ITENS, "fornecedor;nf;data;valor_total;forma\n", ["L03", "L19"]);
    expect(r.notas).toHaveLength(2);
    expect(r.inconsistencias.some((i) => i.includes("ausente no financeiro"))).toBe(true);
  });
});
