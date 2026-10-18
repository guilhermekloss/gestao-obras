import { describe, expect, it } from "vitest";
import type { TextoExtraido } from "../../tipos";
import { acharLinha, construirDoc, textoDasLinhas } from "../documento";
import { parcelasDoTrecho, telefoneDoTrecho } from "../interpretes/auxiliares";
import { montarTexto, type OpcoesTexto } from "./auxiliar";

const doc = (texto: string | string[], opcoes: OpcoesTexto = {}) => construirDoc(montarTexto(texto, opcoes));

describe("construirDoc: linhas e texto", () => {
  it("cada linha com texto vira uma linha; vazias somem; índice e página seguem a ordem", () => {
    const d = doc(["A1\n\nB2\n   \nC3", "D4"]);
    expect(d.linhas.map((l) => [l.indice, l.pagina, l.texto])).toEqual([
      [0, 1, "A1"],
      [1, 1, "B2"],
      [2, 1, "C3"],
      [3, 2, "D4"],
    ]);
    expect(d.paginas).toBe(2);
  });

  it("tira espaços das pontas e troca caracteres de controle por espaço", () => {
    const d = doc("  AB\u0001CD  ");
    expect(d.linhas[0].texto).toBe("AB CD");
    expect(d.linhas[0].norm).toBe("AB CD");
  });

  it("texto completo e versão normalizada juntam as linhas com quebra", () => {
    const d = doc("Ação  um\nÉ útil");
    expect(d.textoCompleto).toBe("Ação  um\nÉ útil");
    expect(d.normCompleto).toBe("ACAO  UM\nE UTIL");
    expect(d.linhas[0].norm).toHaveLength(d.linhas[0].texto.length);
  });

  it("repassa origem, confiança média e códigos", () => {
    const entrada: TextoExtraido = {
      ...montarTexto("AB"),
      origem: "pdf-texto",
      confiancaMedia: 0.42,
      codigos: [{ formato: "QR", texto: "x", pagina: 1 }],
    };
    const d = construirDoc(entrada);
    expect(d.origem).toBe("pdf-texto");
    expect(d.confiancaMedia).toBe(0.42);
    expect(d.codigos).toEqual([{ formato: "QR", texto: "x", pagina: 1 }]);
    expect(construirDoc({ ...entrada, codigos: undefined as never }).codigos).toEqual([]);
  });

  it("documento vazio: sem linhas, sem posições, zero páginas", () => {
    const d = construirDoc({ origem: "ocr-local", paginas: [], codigos: [], confiancaMedia: null });
    expect(d).toMatchObject({ linhas: [], comPosicoes: false, textoCompleto: "", normCompleto: "", paginas: 0 });
  });

  it("número da maior página", () => {
    const entrada = montarTexto(["A1", "B2"]);
    entrada.paginas[1].numero = 7;
    expect(construirDoc(entrada).paginas).toBe(7);
  });
});

describe("construirDoc: palavras, células e posições", () => {
  it("cada palavra vira um token com início, fim e célula (vão de 2+ espaços troca de célula)", () => {
    const d = doc("AB CD   EF  GH");
    expect(d.linhas[0].tokens.map((t) => [t.texto, t.inicio, t.fim, t.celula])).toEqual([
      ["AB", 0, 2, 0],
      ["CD", 3, 5, 0],
      ["EF", 8, 10, 1],
      ["GH", 12, 14, 2],
    ]);
  });

  it("com posições reais, o token leva x0 e x1 e a linha leva a altura", () => {
    const d = doc("AB   CD");
    const [a, b] = d.linhas[0].tokens;
    expect(d.linhas[0].comPosicao).toBe(true);
    expect(a.x0).toBeCloseTo(0);
    expect(a.x1).toBeCloseTo(2 / 150);
    expect(b.x0).toBeCloseTo(5 / 150);
    expect(d.comPosicoes).toBe(true);
    expect(d.linhas[0].y).toBe(0);
    expect(doc("A1\nB2").linhas[1].y).toBeCloseTo(1 / 80);
  });

  it("sem posições, x0 e x1 ficam nulos", () => {
    const d = doc("AB   CD", { posicoes: false });
    expect(d.linhas[0].tokens.every((t) => t.x0 === null && t.x1 === null)).toBe(true);
    expect(d.linhas[0].comPosicao).toBe(false);
    expect(d.comPosicoes).toBe(false);
    expect(d.linhas[0].y).toBeNull();
  });

  it("linha de uma palavra só com posição real vale; duas palavras no mesmo x, não", () => {
    expect(doc("AB").linhas[0].comPosicao).toBe(true);
    const igual = montarTexto("AB CD");
    igual.paginas[0].linhas[0].palavras.forEach((p) => (p.caixa.x = 0.1));
    expect(construirDoc(igual).linhas[0].comPosicao).toBe(false);
  });

  it("palavras com largura zero ou em número diferente dos tokens não contam como posição real", () => {
    const zero = montarTexto("AB CD");
    zero.paginas[0].linhas[0].palavras[1].caixa.largura = 0;
    expect(construirDoc(zero).linhas[0].comPosicao).toBe(false);
    const menos = montarTexto("AB CD EF");
    menos.paginas[0].linhas[0].palavras.pop();
    expect(construirDoc(menos).linhas[0].comPosicao).toBe(false);
    const nenhuma = montarTexto("AB CD");
    nenhuma.paginas[0].linhas[0].palavras = [];
    expect(construirDoc(nenhuma).linhas[0].comPosicao).toBe(false);
  });

  it("o documento tem posições se pelo menos 60% das linhas têm", () => {
    const entrada = montarTexto("A1 B1\nA2 B2\nA3 B3\nA4 B4\nA5 B5");
    const sem = (n: number) => {
      const e = JSON.parse(JSON.stringify(entrada)) as TextoExtraido;
      for (let i = 0; i < n; i++) e.paginas[0].linhas[i].palavras = [];
      return construirDoc(e).comPosicoes;
    };
    expect(sem(0)).toBe(true);
    expect(sem(2)).toBe(true);
    expect(sem(3)).toBe(false);
  });

  it("y só existe com a altura ou posição da linha; confiança vem da linha", () => {
    const entrada = montarTexto("AB", { posicoes: false, confianca: 0.7 });
    const d = construirDoc(entrada);
    expect(d.linhas[0].y).toBeNull();
    expect(d.linhas[0].confianca).toBe(0.7);
    entrada.paginas[0].linhas[0].caixa = { x: 0, y: 0.3, largura: 0, altura: 0 };
    expect(construirDoc(entrada).linhas[0].y).toBe(0.3);
    entrada.paginas[0].linhas[0].caixa = { x: 0, y: 0, largura: 0, altura: 0.1 };
    expect(construirDoc(entrada).linhas[0].y).toBe(0);
  });
});

describe("acharLinha e textoDasLinhas", () => {
  const d = doc("alfa\nbeta\ngama\nbeta\ndelta");

  it("primeira linha que casa, a partir de 'desde' e antes de 'ate'", () => {
    expect(acharLinha(d, /BETA/)).toBe(1);
    expect(acharLinha(d, /BETA/, 2)).toBe(3);
    expect(acharLinha(d, /BETA/, 4)).toBe(-1);
    expect(acharLinha(d, /BETA/, 0, 1)).toBe(-1);
    expect(acharLinha(d, /BETA/, 0, 2)).toBe(1);
    expect(acharLinha(d, /DELTA/, 0, 99)).toBe(4);
    expect(acharLinha(d, /ALFA/, -5)).toBe(0);
    expect(acharLinha(d, /NADA/)).toBe(-1);
  });

  it("procura no texto normalizado (maiúsculas, sem acento)", () => {
    expect(acharLinha(doc("Ação"), /ACAO/)).toBe(0);
    expect(acharLinha(doc("Ação"), /ação/)).toBe(-1);
  });

  it("texto das linhas de 'de' até 'ate' (exclusivo), com limites protegidos", () => {
    expect(textoDasLinhas(d, 1, 3)).toBe("beta\ngama");
    expect(textoDasLinhas(d, 0, 1)).toBe("alfa");
    expect(textoDasLinhas(d, -3, 2)).toBe("alfa\nbeta");
    expect(textoDasLinhas(d, 3, 99)).toBe("beta\ndelta");
    expect(textoDasLinhas(d, 2, 2)).toBe("");
    expect(textoDasLinhas(d, 4, -1)).toBe("");
  });
});

describe("parcelasDoTrecho", () => {
  it("datas e valores, na mesma quantidade, são pareados na ordem", () => {
    const d = doc("Num. 001 Venc. 15/10/2026 Valor R$ 837,75   Num. 002 Venc. 14/11/2026 Valor R$ 500,00");
    expect(parcelasDoTrecho(d, { de: 0, ate: 1 })).toEqual([
      { vencimento: "2026-10-15", valor: 837.75 },
      { vencimento: "2026-11-14", valor: 500 },
    ]);
  });

  it("em linhas separadas, o trecho junta as linhas", () => {
    const d = doc("Venc. 15/10/2026\nValor R$ 100,00\nVenc. 14/11/2026\nValor R$ 200,00");
    expect(parcelasDoTrecho(d, { de: 0, ate: 4 })).toEqual([
      { vencimento: "2026-10-15", valor: 100 },
      { vencimento: "2026-11-14", valor: 200 },
    ]);
  });

  it("quantidades diferentes: cada data pega o primeiro valor antes da data seguinte", () => {
    const d = doc("15/10/2026 R$ 100,00 14/11/2026 sem valor 14/12/2026 R$ 300,00");
    expect(parcelasDoTrecho(d, { de: 0, ate: 1 })).toEqual([
      { vencimento: "2026-10-15", valor: 100 },
      { vencimento: "2026-12-14", valor: 300 },
    ]);
  });

  it("valor antes da primeira data não conta; valor zero não vira parcela", () => {
    expect(parcelasDoTrecho(doc("R$ 50,00 em 15/10/2026"), { de: 0, ate: 1 })).toEqual([]);
    expect(parcelasDoTrecho(doc("15/10/2026 R$ 0,00 14/11/2026 R$ 7,00"), { de: 0, ate: 1 })).toEqual([{ vencimento: "2026-11-14", valor: 7 }]);
  });

  it("sem datas, nada; a faixa limita as linhas", () => {
    expect(parcelasDoTrecho(doc("só texto R$ 10,00"), { de: 0, ate: 1 })).toEqual([]);
    const d = doc("15/10/2026 R$ 100,00\n14/11/2026 R$ 200,00\n14/12/2026 R$ 300,00");
    expect(parcelasDoTrecho(d, { de: 1, ate: 2 })).toEqual([{ vencimento: "2026-11-14", valor: 200 }]);
    expect(parcelasDoTrecho(d, { de: 1, ate: 99 })).toHaveLength(2);
    expect(parcelasDoTrecho(d, { de: 0, ate: 0 })).toEqual([]);
  });
});

describe("telefoneDoTrecho", () => {
  it.each([
    ["FONE: (11) 3333-4444", "(11) 3333-4444"],
    ["Fone (11)3333-4444", "(11)3333-4444"],
    ["TEL 11 98888-7777", "11 98888-7777"],
    ["Tel.: (11) 98888 7777", "(11) 98888 7777"],
    ["TELEFONE - 11 3333 4444", "11 3333 4444"],
    ["Telefone: 1133334444", "1133334444"],
    ["Contato  FONE:   (41) 99999-0000  email", "(41) 99999-0000"],
    ["fone ... (11) 3333-4444", "(11) 3333-4444"],
  ])("'%s' → %s", (texto, fone) => {
    expect(telefoneDoTrecho(texto)).toBe(fone);
  });

  it("sem rótulo de telefone, ou com número grudado em mais dígitos, nada", () => {
    expect(telefoneDoTrecho("(11) 3333-4444")).toBeNull();
    expect(telefoneDoTrecho("FONE: (11) 3333-44445")).toBeNull();
    expect(telefoneDoTrecho("FONE: 3333-4444")).toBeNull();
    expect(telefoneDoTrecho("FONE")).toBeNull();
    expect(telefoneDoTrecho("")).toBeNull();
  });

  it("até 15 caracteres não numéricos entre o rótulo e o número", () => {
    expect(telefoneDoTrecho(`FONE${" ".repeat(15)}(11) 3333-4444`)).toBe("(11) 3333-4444");
    expect(telefoneDoTrecho(`FONE${" ".repeat(16)}(11) 3333-4444`)).toBeNull();
  });

  it("quebra de linha entre o rótulo e o número não vale", () => {
    expect(telefoneDoTrecho("FONE\n(11) 3333-4444")).toBeNull();
  });

  it("devolve o texto como estava, com acentos e caixa originais", () => {
    expect(telefoneDoTrecho("Telefone: (11) 3333-4444")).toBe("(11) 3333-4444");
  });
});
