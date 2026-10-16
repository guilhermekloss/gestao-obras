import { describe, expect, it } from "vitest";
import { importarPlanilhas, normalizarChave, parseCsv, parseDataBr, parseValorBr } from "../importacao";

const OBRAS = ["L03", "L19"];
const FIN_CAB = "fornecedor;cnpj;nf;data;valor_total;forma;parcela1_valor;parcela1_venc;parcela1_pagoem;parcela2_valor;parcela2_venc;parcela2_pagoem";
const ITENS_CAB = "fornecedor;nf;data;descricao;tipo;qtde;unidade;unitario;desconto;L03;L19";

const fin = (...linhas: string[]) => [FIN_CAB, ...linhas].join("\n");
const itens = (...linhas: string[]) => [ITENS_CAB, ...linhas].join("\n");
const SO_CAB_ITENS = ITENS_CAB;

describe("parseCsv: formatos de planilha", () => {
  it("ignora BOM, linhas em branco e aceita CRLF", () => {
    expect(parseCsv("﻿a;b\r\n\r\n1;2\r\n   \r\n3;4\r\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });
  it("sem linhas de dados devolve vazio", () => {
    expect(parseCsv("a;b")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
  it("escolhe o separador mais frequente no cabeçalho; empate fica com ponto e vírgula", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([{ a: "1", b: "2", c: "3" }]);
    expect(parseCsv("a;b,c\n1;2,3")).toEqual([{ a: "1", b_c: "2,3" }]);
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([{ a: "1", b: "2", c: "3" }]);
  });
  it("respeita aspas: separador dentro delas e aspas duplas escapadas", () => {
    expect(parseCsv('a,b\n"x,y",z')).toEqual([{ a: "x,y", b: "z" }]);
    expect(parseCsv('a;b\n"diz ""oi""";z')).toEqual([{ a: 'diz "oi"', b: "z" }]);
    expect(parseCsv('a;b\n"x;y";z')).toEqual([{ a: "x;y", b: "z" }]);
  });
  it("tira espaços dos campos e completa os que faltam com vazio", () => {
    expect(parseCsv("a;b;c\n  1 ;2")).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});

describe("normalizarChave", () => {
  it("sem acento, minúsculo, símbolos viram _ e as pontas são aparadas", () => {
    expect(normalizarChave("Preço Unitário (R$)")).toBe("preco_unitario_r");
    expect(normalizarChave("__Nº  NF__")).toBe("n_nf");
    expect(normalizarChave("ÁÉÍ")).toBe("aei");
  });
});

describe("parseValorBr / parseDataBr: bordas", () => {
  it("valores", () => {
    expect(parseValorBr("-10,50")).toBe(-1050);
    expect(parseValorBr("abc")).toBe(0);
    expect(parseValorBr("   ")).toBe(0);
    expect(parseValorBr(undefined as unknown as string)).toBe(0);
    expect(parseValorBr("1.234")).toBe(123400);
    expect(parseValorBr("0,015")).toBe(2);
  });
  it("datas com ano de 2 dígitos, dia/mês sem zero e espaços em volta", () => {
    expect(parseDataBr("05/03/26")).toEqual(new Date(2026, 2, 5, 12));
    expect(parseDataBr("5/3/2026")).toEqual(new Date(2026, 2, 5, 12));
    expect(parseDataBr(" 15/01/2026 ")).toEqual(new Date(2026, 0, 15, 12));
    expect(parseDataBr(undefined as unknown as string)).toBeNull();
    expect(parseDataBr("15-01-2026")).toBeNull();
    expect(parseDataBr("15/01/2026 10:00")).toBeNull();
    expect(parseDataBr("x15/01/2026")).toBeNull();
  });
});

describe("importarPlanilhas: planilha financeiro", () => {
  it("ignora linhas sem fornecedor ou sem NF, informando a linha", () => {
    const r = importarPlanilhas(SO_CAB_ITENS, fin(";;1;10/01/2026;10,00;PIX", "Forn;;;10/01/2026;10,00;PIX"), OBRAS);
    expect(r.notas).toEqual([]);
    expect(r.inconsistencias).toEqual([
      "Financeiro linha 2: fornecedor ou nf ausente — ignorada",
      "Financeiro linha 3: fornecedor ou nf ausente — ignorada",
    ]);
  });

  it("ignora nota com data inválida", () => {
    const r = importarPlanilhas(SO_CAB_ITENS, fin("Forn;;7;32-13-2026;10,00;PIX"), OBRAS);
    expect(r.notas).toEqual([]);
    expect(r.inconsistencias).toEqual(['Financeiro linha 2 (Forn NF 7): data inválida "32-13-2026" — ignorada']);
  });

  it("reconhece as formas de pagamento e cai em PIX avisando quando não reconhece", () => {
    const linhas = ["PIX", "Cartão", "Crédito", "Débito", "Boleto"].map((f, i) => `F;;${i + 1};10/01/2026;10,00;${f};10,00;10/01/2026;;;;`);
    const r = importarPlanilhas(SO_CAB_ITENS, fin(...linhas, "F;;9;10/01/2026;10,00;Cheque;10,00;10/01/2026;;;;"), OBRAS);
    expect(r.notas.map((n) => n.formaPagto)).toEqual(["PIX", "CARTAO", "CARTAO", "DEBITO", "BOLETO", "PIX"]);
    expect(r.inconsistencias).toContain('Financeiro linha 7 (F NF 9): forma de pagamento "Cheque" não reconhecida — usando PIX');
    expect(r.inconsistencias.filter((i) => i.includes("não reconhecida"))).toHaveLength(1);
  });

  it("numera as parcelas em sequência, pulando as vazias, e avisa da que está sem vencimento", () => {
    const cab = "fornecedor;nf;data;valor_total;forma;parcela1_valor;parcela1_venc;parcela2_valor;parcela2_venc;parcela3_valor;parcela3_venc;parcela4_valor;parcela4_venc;parcela5_valor;parcela5_venc;parcela6_valor;parcela6_venc;parcela7_valor;parcela7_venc";
    const linha = "F;1;10/01/2026;60,00;boleto;10,00;10/02/2026;;;20,00;sem data;;;;;30,00;10/07/2026;99,00;10/08/2026";
    const r = importarPlanilhas(SO_CAB_ITENS, `${cab}\n${linha}`, OBRAS);
    expect(r.notas[0].parcelas).toEqual([
      { numero: 1, valorCents: 1000, vencimento: new Date(2026, 1, 10, 12), pagaEm: null },
      { numero: 2, valorCents: 3000, vencimento: new Date(2026, 6, 10, 12), pagaEm: null },
    ]);
    expect(r.inconsistencias).toContain("Financeiro linha 2 (F NF 1): parcela 3 sem vencimento válido — ignorada");
    expect(r.inconsistencias).toContain('F NF 1: soma das parcelas (40.00) difere do total (60.00) — o "comparador FALSO" da planilha');
  });

  it("sem parcelas, cria uma única no valor total, vencendo na data da compra", () => {
    const r = importarPlanilhas(SO_CAB_ITENS, fin("F;;1;10/01/2026;50,00;pix"), OBRAS);
    expect(r.notas[0].parcelas).toEqual([{ numero: 1, valorCents: 5000, vencimento: new Date(2026, 0, 10, 12), pagaEm: null }]);
    expect(r.inconsistencias).toContain("Financeiro linha 2 (F NF 1): sem parcelas — criada parcela única no valor total");
  });

  it("lê a data de pagamento da parcela e limpa o CNPJ vazio", () => {
    const r = importarPlanilhas(SO_CAB_ITENS, fin("F; 12.345.678/0001-90 ;1;10/01/2026;10,00;pix;10,00;10/01/2026;11/01/2026;;;", "G;  ;2;10/01/2026;10,00;pix;10,00;10/01/2026;;;;"), OBRAS);
    expect(r.notas[0].cnpj).toBe("12.345.678/0001-90");
    expect(r.notas[0].parcelas[0].pagaEm).toEqual(new Date(2026, 0, 11, 12));
    expect(r.notas[1].cnpj).toBeNull();
    expect(r.notas[1].parcelas[0].pagaEm).toBeNull();
    expect(r.inconsistencias).toEqual(["F NF 1: sem itens na planilha de quantitativo", "G NF 2: sem itens na planilha de quantitativo"]);
  });
});

describe("importarPlanilhas: planilha de itens", () => {
  const nota = "F;;1;10/01/2026;100,00;pix;100,00;10/01/2026;;;;";

  it("ignora item sem fornecedor, nf ou descrição", () => {
    const r = importarPlanilhas(itens(";1;10/01/2026;X;material;1;PC;1,00;0;100;", "F;;10/01/2026;X;material;1;PC;1,00;0;100;", "F;1;10/01/2026;;material;1;PC;1,00;0;100;"), fin(nota), OBRAS);
    expect(r.notas[0].itens).toEqual([]);
    expect(r.inconsistencias.filter((i) => i.startsWith("Itens linha"))).toEqual([
      "Itens linha 2: fornecedor, nf ou descrição ausente — ignorada",
      "Itens linha 3: fornecedor, nf ou descrição ausente — ignorada",
      "Itens linha 4: fornecedor, nf ou descrição ausente — ignorada",
    ]);
  });

  it("casa itens e nota ignorando acento, caixa e espaços no fornecedor e na NF", () => {
    const r = importarPlanilhas(itens("  AÇO  forte;  100 ;10/01/2026;Vergalhão;material;1;BR;100,00;0;100;"), fin("Aço Forte;;100;10/01/2026;100,00;pix;100,00;10/01/2026;;;;"), OBRAS);
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0].itens).toHaveLength(1);
    expect(r.inconsistencias).toEqual([]);
  });

  it("converte quantidade, tipo, unidade e desconto de cada item", () => {
    const r = importarPlanilhas(
      itens(
        "F;1;10/01/2026;A;MO;2,5;h;10,01;1,00;100;",
        "F;1;10/01/2026;B;inss;;;20,00;;100;",
        "F;1;10/01/2026;C;frete;1;FRETE;5,00;0;100;",
        "F;1;10/01/2026;D;encargo;1;;5,00;0;100;",
        "F;1;10/01/2026;E;servico;1;SV;5,00;0;100;",
        "F;1;10/01/2026;F;qualquer;1;UN;5,00;0;100;",
      ),
      fin(nota),
      OBRAS,
    );
    expect(r.notas[0].itens).toEqual([
      { descricao: "A", tipo: "SERVICO", qtde: 2.5, unidade: "h", unitCents: 1001, descontoCents: 100, totalCents: Math.round(2.5 * 1001) - 100 },
      { descricao: "B", tipo: "ENCARGO", qtde: 1, unidade: "PC", unitCents: 2000, descontoCents: 0, totalCents: 2000 },
      { descricao: "C", tipo: "FRETE", qtde: 1, unidade: "FRETE", unitCents: 500, descontoCents: 0, totalCents: 500 },
      { descricao: "D", tipo: "ENCARGO", qtde: 1, unidade: "PC", unitCents: 500, descontoCents: 0, totalCents: 500 },
      { descricao: "E", tipo: "SERVICO", qtde: 1, unidade: "SV", unitCents: 500, descontoCents: 0, totalCents: 500 },
      { descricao: "F", tipo: "MATERIAL", qtde: 1, unidade: "UN", unitCents: 500, descontoCents: 0, totalCents: 500 },
    ]);
  });

  it("cria a nota quando só existe nos itens, com a data do item, PIX e total = soma dos itens", () => {
    const r = importarPlanilhas(itens("Novo;9;05/03/2026;X;material;2;PC;10,00;0;100;", "Novo;9;05/03/2026;Y;material;1;PC;5,00;0;100;"), fin(), OBRAS);
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0]).toMatchObject({ fornecedor: "Novo", numero: "9", cnpj: null, formaPagto: "PIX", totalCents: 2500, parcelas: [] });
    expect(r.notas[0].dataCompra).toEqual(new Date(2026, 2, 5, 12));
    expect(r.inconsistencias.filter((i) => i.includes("ausente no financeiro"))).toEqual(["Novo NF 9: presente nos itens mas ausente no financeiro — criada sem parcelas"]);
  });

  it("sem itens na planilha, a nota fica 100% na primeira obra, com aviso", () => {
    const r = importarPlanilhas(SO_CAB_ITENS, fin(nota), OBRAS);
    expect(r.notas[0].rateios).toEqual([{ codigoObra: "L03", fracaoBp: 10000 }]);
    expect(r.inconsistencias).toEqual(["F NF 1: sem itens na planilha de quantitativo"]);
  });
});

describe("importarPlanilhas: total e rateio da nota", () => {
  const nota = (total: string) => `F;;1;10/01/2026;${total};pix;${total};10/01/2026;;;;`;

  it("avisa quando a soma dos itens difere do total; não avisa quando bate", () => {
    const item = "F;1;10/01/2026;X;material;1;PC;90,00;0;100;";
    const diverge = importarPlanilhas(itens(item), fin(nota("100,00")), OBRAS);
    expect(diverge.notas[0].totalCents).toBe(10000);
    expect(diverge.inconsistencias).toEqual(["F NF 1: soma dos itens (90.00) difere do total da nota (100.00)"]);
    const bate = importarPlanilhas(itens(item), fin(nota("90,00")), OBRAS);
    expect(bate.inconsistencias).toEqual([]);
  });

  it("total zero na financeiro assume a soma dos itens", () => {
    const r = importarPlanilhas(itens("F;1;10/01/2026;X;material;1;PC;90,00;0;100;"), fin("F;;1;10/01/2026;0;pix;90,00;10/01/2026;;;;"), OBRAS);
    expect(r.notas[0].totalCents).toBe(9000);
  });

  it("item sem rateio vai 100% para a primeira obra, com aviso", () => {
    const r = importarPlanilhas(itens("F;1;10/01/2026;X;material;1;PC;100,00;0;;"), fin(nota("100,00")), OBRAS);
    expect(r.notas[0].rateios).toEqual([{ codigoObra: "L03", fracaoBp: 10000 }]);
    expect(r.inconsistencias).toEqual(["Itens linha 2 (F NF 1): sem rateio de obra — atribuído 100% a L03"]);
  });

  it("rateio da nota pesa o valor de cada item em cada obra; pesos zero não contam", () => {
    const r = importarPlanilhas(
      itens("F;1;10/01/2026;A;material;1;PC;100,00;0;50;50", "F;1;10/01/2026;B;material;1;PC;100,00;0;0;100"),
      fin(nota("200,00")),
      OBRAS,
    );
    // A: 50 em L03 e 50 em L19; B: 100 em L19 → L03 = 50, L19 = 150 → 25% / 75%
    expect(r.notas[0].rateios).toEqual([
      { codigoObra: "L03", fracaoBp: 2500 },
      { codigoObra: "L19", fracaoBp: 7500 },
    ]);
    expect(r.inconsistencias).toEqual([]);
  });

  it("os pesos da linha são relativos (60/40 = 3/2)", () => {
    const r = importarPlanilhas(itens("F;1;10/01/2026;A;material;1;PC;100,00;0;60;40"), fin(nota("100,00")), OBRAS);
    expect(r.notas[0].rateios).toEqual([
      { codigoObra: "L03", fracaoBp: 6000 },
      { codigoObra: "L19", fracaoBp: 4000 },
    ]);
  });

  it("itens que somam zero deixam a nota 100% na primeira obra", () => {
    const r = importarPlanilhas(itens("F;1;10/01/2026;A;material;1;PC;0,00;0;0;100"), fin(nota("100,00")), OBRAS);
    expect(r.notas[0].rateios).toEqual([{ codigoObra: "L03", fracaoBp: 10000 }]);
  });

  it("colunas de obra são achadas pelo nome normalizado", () => {
    const cab = "fornecedor;nf;data;descricao;tipo;qtde;unidade;unitario;desconto;Lote 03";
    const r = importarPlanilhas(`${cab}\nF;1;10/01/2026;A;material;1;PC;100,00;0;100`, fin(nota("100,00")), ["Lote 03", "L19"]);
    expect(r.notas[0].rateios).toEqual([{ codigoObra: "Lote 03", fracaoBp: 10000 }]);
  });
});
