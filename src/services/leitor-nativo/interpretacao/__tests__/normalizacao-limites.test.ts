import { describe, expect, it } from "vitest";
import {
  anoCompleto,
  arredondar2,
  corrigirOcrNumerico,
  diferencaDias,
  ehTraco,
  encontrarDatas,
  encontrarValores,
  extensoParaNumero,
  formatarReais,
  lerData,
  lerDecimal,
  lerValor,
  limparEspacos,
  montarData,
  normalizarTexto,
  somarDias,
} from "../normalizacao";

const valores = (texto: string) => encontrarValores(texto).map((v) => v.valor);

describe("encontrarValores: o que vem depois do valor", () => {
  it("vírgula, ponto, ponto e vírgula, dois-pontos e espaço depois do valor são pontuação", () => {
    for (const depois of [",", ", referente", ".", ". Referente", ";", ":", " referente", ""]) {
      expect(valores(`importância de R$ 900,00${depois}`)).toEqual([900]);
    }
  });

  it("vários valores separados por vírgula", () => {
    expect(valores("parcelas de R$ 10,00, R$ 20,00, R$ 30,00")).toEqual([10, 20, 30]);
    expect(valores("10,00, 20,00")).toEqual([10, 20]);
  });

  it("vírgula seguida de dígito continua o número: não é valor", () => {
    expect(valores("R$ 10,00,50")).toEqual([]);
    expect(valores("10,00,5")).toEqual([]);
  });

  it("letra ou dígito colado depois do valor não é valor", () => {
    expect(valores("R$ 10,00a")).toEqual([]);
    expect(valores("R$ 10,005")).toEqual([]);
    expect(valores("R$ 10,00X")).toEqual([]);
  });

  it("percentual não é valor", () => {
    expect(valores("alíquota 5,00%")).toEqual([]);
    expect(valores("alíquota 5,00 %")).toEqual([]);
    expect(valores("alíquota 5,00%, valor 8,00")).toEqual([8]);
  });
});

describe("normalizarTexto e limparEspacos", () => {
  it("tira acentos, passa para maiúsculas e mantém o comprimento", () => {
    expect(normalizarTexto("Ação, é útil!")).toBe("ACAO, E UTIL!");
    expect(normalizarTexto("Ação")).toHaveLength(4);
    expect(normalizarTexto("ß")).toBe("S");
    expect(normalizarTexto("")).toBe("");
  });

  it("marca de acento solta e pares substitutos ficam como estão", () => {
    expect(normalizarTexto("\u0301")).toBe("\u0301");
    expect(normalizarTexto("a😀b")).toBe("A😀B");
    expect(normalizarTexto("a😀b")).toHaveLength(4);
  });

  it("limparEspacos junta espaços, tabs e quebras de linha e apara as pontas", () => {
    expect(limparEspacos("  a \t b\n\n c  ")).toBe("a b c");
    expect(limparEspacos("   ")).toBe("");
  });
});

describe("corrigirOcrNumerico", () => {
  it("só corrige token com pelo menos 60% de dígitos", () => {
    expect(corrigirOcrNumerico("12O")).toBe("120");
    expect(corrigirOcrNumerico("123OO")).toBe("12300");
    expect(corrigirOcrNumerico("12OOO")).toBe("12OOO");
    expect(corrigirOcrNumerico("1OO")).toBe("1OO");
    expect(corrigirOcrNumerico("ABC")).toBe("ABC");
    expect(corrigirOcrNumerico("")).toBe("");
    expect(corrigirOcrNumerico("..,")).toBe("..,");
  });

  it("pontuação não entra na conta da proporção", () => {
    expect(corrigirOcrNumerico("1.2O")).toBe("1.20");
    expect(corrigirOcrNumerico("1,2O")).toBe("1,20");
  });

  it("forçando, troca cada letra confundível pelo dígito parecido e deixa as outras", () => {
    const trocas: Record<string, string> = {
      O: "0", o: "0", Q: "0", D: "0", "°": "0",
      I: "1", l: "1", "|": "1", i: "1", "!": "1", L: "1",
      Z: "2", z: "2", S: "5", s: "5", G: "6", b: "6", T: "7", B: "8", g: "9", q: "9",
    };
    for (const [letra, digito] of Object.entries(trocas)) expect(corrigirOcrNumerico(letra, true)).toBe(digito);
    expect(corrigirOcrNumerico("XaY", true)).toBe("XaY");
    expect(corrigirOcrNumerico("1a2", true)).toBe("1a2");
  });
});

describe("lerValor", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["1,5", 1.5],
    ["0,05", 0.05],
    [",50", 0.5],
    ["10,", 10],
    ["10", 10],
    ["1.234", 1234],
    ["12.345.678", 12345678],
    ["1.23", 1.23],
    ["1.2345", 1.23],
    ["1.234,567", 1234.57],
    ["R$10,00", 10],
    ["R $ 10,00", 10],
    ["RS 10,00", 10],
    ["R5 10,00", 10],
    ["RS. 10,00", 10],
    ["R$ 1 234,56", 1234.56],
    ["1O,OO", 10],
    ["  10,00  ", 10],
  ])("'%s' → %s", (texto, valor) => {
    expect(lerValor(texto)).toBe(valor);
  });

  it("negativos: sinal na frente, depois de R$ ou entre parênteses", () => {
    expect(lerValor("-10,00")).toBe(-10);
    expect(lerValor("R$ -10,00")).toBe(-10);
    expect(lerValor("(10,00)")).toBe(-10);
    expect(lerValor("10,00-")).toBe(10);
  });

  it("sem número, nada", () => {
    for (const ruim of [null, undefined, "", "   ", "-", "abc", "R$", "1e5", "1,2x", "--"]) expect(lerValor(ruim)).toBeNull();
  });

  it("arredonda para centavos", () => {
    expect(lerValor("1,234")).toBe(1.23);
    expect(lerValor("1,236")).toBe(1.24);
    expect(lerValor("-1,236")).toBe(-1.24);
  });
});

describe("lerDecimal", () => {
  it.each([
    ["20,0000", 20],
    ["12,5", 12.5],
    [",5", 0.5],
    ["1.500", 1500],
    ["1.5", 1.5],
    ["0.500", 0.5],
    ["1.234.567", 1234567],
    ["1.234,5", 1234.5],
    ["1 000,50", 1000.5],
    ["3", 3],
    ["1,2,3", 12.3],
    ["O,5", 0.5],
    ["2O", 20],
  ])("'%s' → %s", (texto, valor) => {
    expect(lerDecimal(texto)).toBe(valor);
  });

  it("negativo e sem arredondar", () => {
    expect(lerDecimal("-3,5")).toBe(-3.5);
    expect(lerDecimal("- 3,5")).toBe(-3.5);
    expect(lerDecimal("1,23456")).toBe(1.23456);
  });

  it("sem número, nada", () => {
    for (const ruim of [null, undefined, "", " ", "abc", "-", ".", "1x2"]) expect(lerDecimal(ruim)).toBeNull();
  });
});

describe("arredondar2, ehTraco e formatarReais", () => {
  it("arredonda para duas casas", () => {
    expect(arredondar2(1.234)).toBe(1.23);
    expect(arredondar2(1.236)).toBe(1.24);
    expect(arredondar2(-1.236)).toBe(-1.24);
    expect(arredondar2(0.125)).toBe(0.13);
    expect(arredondar2(5)).toBe(5);
  });

  it("traço sozinho, com espaços ou repetido", () => {
    for (const t of ["-", "–", "—", " -- ", "---"]) expect(ehTraco(t)).toBe(true);
    for (const t of ["", " ", "a-", "-a", "- -", "10-"]) expect(ehTraco(t)).toBe(false);
  });

  it("formata em reais com milhar e centavos", () => {
    expect(formatarReais(0)).toBe("R$ 0,00");
    expect(formatarReais(1.05)).toBe("R$ 1,05");
    expect(formatarReais(100)).toBe("R$ 100,00");
    expect(formatarReais(1000)).toBe("R$ 1.000,00");
    expect(formatarReais(1234567.89)).toBe("R$ 1.234.567,89");
    expect(formatarReais(999.999)).toBe("R$ 1.000,00");
    expect(formatarReais(-5.5)).toBe("-R$ 5,50");
    expect(formatarReais(0.004)).toBe("R$ 0,00");
  });
});

describe("encontrarValores: formatos", () => {
  it("devolve valor, posição e texto de cada ocorrência", () => {
    expect(encontrarValores("total R$ 1.234,56 e 10,00")).toEqual([
      { valor: 1234.56, inicio: 6, fim: 17, texto: "R$ 1.234,56" },
      { valor: 10, inicio: 20, fim: 25, texto: "10,00" },
    ]);
  });

  it("milhar com espaço só depois de R$", () => {
    expect(valores("R$1 234,56")).toEqual([1234.56]);
    expect(valores("R$ 1 234,56")).toEqual([1234.56]);
    expect(valores("1 234,56")).toEqual([234.56]);
  });

  it("negativo e dígitos trocados pelo OCR", () => {
    expect(valores("-10,00")).toEqual([-10]);
    expect(valores("R$ -10,00")).toEqual([-10]);
    expect(valores("1O,OO")).toEqual([10]);
    expect(valores("RS 10,00")).toEqual([10]);
  });

  it("quantidade com 3 ou mais decimais e texto sem dígito não são valor", () => {
    expect(valores("20,0000")).toEqual([]);
    expect(valores("OO,OO")).toEqual([]);
    expect(valores("10,0")).toEqual([]);
    expect(valores("10")).toEqual([]);
  });

  it("colado a letra, ponto ou vírgula antes não é valor", () => {
    expect(valores("a10,00")).toEqual([]);
    expect(valores("1.10,00")).toEqual([]);
    expect(valores(",10,00")).toEqual([]);
    expect(valores("9 10,00")).toEqual([10]);
  });
});

describe("montarData e anoCompleto", () => {
  it("data válida em ISO", () => {
    expect(montarData(2026, 10, 5)).toBe("2026-10-05");
    expect(montarData(2024, 2, 29)).toBe("2024-02-29");
    expect(montarData(1990, 1, 1)).toBe("1990-01-01");
    expect(montarData(2100, 12, 31)).toBe("2100-12-31");
  });

  it("data impossível, fora do intervalo ou não inteira: nada", () => {
    for (const [a, m, d] of [[2025, 2, 29], [2026, 4, 31], [2026, 13, 1], [2026, 0, 1], [2026, 1, 0], [2026, 1, 32], [1989, 1, 1], [2101, 1, 1], [2026.5, 1, 1], [2026, 1.5, 1], [2026, 1, 1.5], [NaN, 1, 1]]) {
      expect(montarData(a, m, d)).toBeNull();
    }
  });

  it("ano de 2 dígitos: pela referência (até o ano seguinte) ou pelo corte em 70", () => {
    expect(anoCompleto(2026)).toBe(2026);
    expect(anoCompleto(100)).toBe(100);
    expect(anoCompleto(27, 2026)).toBe(2027);
    expect(anoCompleto(28, 2026)).toBe(1928);
    expect(anoCompleto(69)).toBe(2069);
    expect(anoCompleto(70)).toBe(1970);
    expect(anoCompleto(26, 0)).toBe(2026);
  });
});

describe("encontrarDatas: formatos", () => {
  const datas = (t: string, ref?: number) => encontrarDatas(t, ref).map((d) => d.valor);

  it("numérica com barra, hífen ou ponto, e com espaços em volta do separador", () => {
    expect(datas("10/10/2026")).toEqual(["2026-10-10"]);
    expect(datas("10-10-2026")).toEqual(["2026-10-10"]);
    expect(datas("10.10.2026")).toEqual(["2026-10-10"]);
    expect(datas("10 / 10 / 2026")).toEqual(["2026-10-10"]);
    expect(datas("1/2/2026")).toEqual(["2026-02-01"]);
  });

  it("separadores diferentes não formam data", () => {
    expect(datas("10/10-2026")).toEqual([]);
  });

  it("ano de 2 dígitos só com barra", () => {
    expect(datas("10/10/26", 2026)).toEqual(["2026-10-10"]);
    expect(datas("10.10.26")).toEqual([]);
    expect(datas("10-10-26")).toEqual([]);
  });

  it("letras trocadas pelo OCR", () => {
    expect(datas("1O/1O/2O26")).toEqual(["2026-10-10"]);
    expect(datas("l0/l0/2026")).toEqual(["2026-10-10"]);
  });

  it("colada a letra, dígito, barra ou ponto, não é data", () => {
    expect(datas("a10/10/2026")).toEqual([]);
    expect(datas("110/10/2026")).toEqual([]);
    expect(datas("/10/10/2026")).toEqual([]);
    expect(datas("10/10/2026a")).toEqual([]);
    expect(datas("10/10/20261")).toEqual([]);
    expect(datas("10/10/2026/")).toEqual([]);
    expect(datas("10/10/2026.5")).toEqual([]);
    expect(datas("10/10/2026.")).toEqual(["2026-10-10"]);
    expect(datas("(10/10/2026)")).toEqual(["2026-10-10"]);
  });

  it("data impossível não vale", () => {
    expect(datas("31/02/2026")).toEqual([]);
    expect(datas("10/13/2026")).toEqual([]);
  });

  it("por extenso, com mês inteiro, abreviado, com barra ou hífen", () => {
    expect(datas("10 de outubro de 2026")).toEqual(["2026-10-10"]);
    expect(datas("10 OUT 2026")).toEqual(["2026-10-10"]);
    expect(datas("10/OUT/2026")).toEqual(["2026-10-10"]);
    expect(datas("10-OUT-2026")).toEqual(["2026-10-10"]);
    expect(datas("10º de março de 2026")).toEqual(["2026-03-10"]);
    expect(datas("1o de maio de 2026")).toEqual(["2026-05-01"]);
    expect(datas("5 setembro 2026")).toEqual(["2026-09-05"]);
    expect(datas("10 de mar. de 2026")).toEqual(["2026-03-10"]);
    expect(datas("3 de Dezembro de 2026")).toEqual(["2026-12-03"]);
  });

  it("todos os meses, inteiros e abreviados", () => {
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    meses.forEach((nome, i) => {
      const mm = String(i + 1).padStart(2, "0");
      expect(datas(`5 de ${nome} de 2026`)).toEqual([`2026-${mm}-05`]);
      expect(datas(`5 ${nome.slice(0, 3)} 2026`)).toEqual([`2026-${mm}-05`]);
    });
  });

  it("mês seguido de letra, ou dia colado a outro dígito, não é data", () => {
    expect(datas("10 de outubrox de 2026")).toEqual([]);
    expect(datas("110 de outubro de 2026")).toEqual([]);
    expect(datas("10 de outubro de 20261")).toEqual([]);
  });

  it("ISO", () => {
    expect(datas("2026-10-10")).toEqual(["2026-10-10"]);
    expect(datas("12026-10-10")).toEqual([]);
    expect(datas("2026-10-101")).toEqual([]);
    expect(datas("2026-13-10")).toEqual([]);
  });

  it("várias datas, em ordem de aparição, com posição e texto", () => {
    expect(encontrarDatas("a 2026-10-10 b 05/11/2026 c 3 de janeiro de 2027")).toEqual([
      { valor: "2026-10-10", inicio: 2, fim: 12, texto: "2026-10-10" },
      { valor: "2026-11-05", inicio: 15, fim: 25, texto: "05/11/2026" },
      { valor: "2027-01-03", inicio: 28, fim: 48, texto: "3 de janeiro de 2027" },
    ]);
    expect(datas("20/10/2026 e 10/10/2026")).toEqual(["2026-10-20", "2026-10-10"]);
  });

  it("lerData devolve a primeira", () => {
    expect(lerData("20/10/2026 e 10/10/2026")).toBe("2026-10-20");
    expect(lerData("10/10/26", 2026)).toBe("2026-10-10");
    expect(lerData("sem data")).toBeNull();
    expect(lerData("")).toBeNull();
    expect(lerData(null)).toBeNull();
    expect(lerData(undefined)).toBeNull();
  });
});

describe("somarDias e diferencaDias", () => {
  it("soma e subtrai dias atravessando mês, ano e bissexto", () => {
    expect(somarDias("2026-02-27", 2)).toBe("2026-03-01");
    expect(somarDias("2024-02-27", 2)).toBe("2024-02-29");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(somarDias("2026-10-10", 0)).toBe("2026-10-10");
    expect(somarDias("2026-10-10", 30)).toBe("2026-11-09");
  });

  it("diferença em dias, com sinal", () => {
    expect(diferencaDias("2026-01-01", "2026-01-31")).toBe(30);
    expect(diferencaDias("2026-01-31", "2026-01-01")).toBe(-30);
    expect(diferencaDias("2026-10-10", "2026-10-10")).toBe(0);
    expect(diferencaDias("2025-12-31", "2026-01-01")).toBe(1);
    expect(diferencaDias("2024-02-28", "2024-03-01")).toBe(2);
  });
});

describe("extensoParaNumero", () => {
  it.each([
    ["mil e quinhentos reais", 1500],
    ["um real", 1],
    ["uma real", 1],
    ["dois mil reais", 2000],
    ["mil reais", 1000],
    ["um milhão de reais", 1_000_000],
    ["dois milhões e quinhentos mil reais", 2_500_000],
    ["cento e vinte e três reais", 123],
    ["cem reais", 100],
    ["trezentos e cinquenta reais", 350],
    ["duzentas reais", 200],
    ["dezesseis reais", 16],
    ["quatorze reais", 14],
    ["catorze reais", 14],
    ["três reais", 3],
    ["zero reais", 0],
    ["vinte e cinco centavos", 0.25],
    ["cinquenta centavos", 0.5],
    ["um centavo", 0.01],
    ["cem reais e cinquenta centavos", 100.5],
    ["dez reais e noventa e nove centavos", 10.99],
    ["um real e um centavo", 1.01],
    ["(mil, e quinhentos reais)", 1500],
    ["MIL E QUINHENTOS REAIS", 1500],
  ])("'%s' → %s", (texto, valor) => {
    expect(extensoParaNumero(texto)).toBe(valor);
  });

  it("sem moeda, palavra desconhecida ou valor impossível: nada", () => {
    for (const ruim of ["mil e quinhentos", "reais", "uns reais", "cem centavos", "mil reais e cem centavos", "xyz centavos", "", "R$ 10"]) {
      expect(extensoParaNumero(ruim)).toBeNull();
    }
  });
});
