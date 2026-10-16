import { describe, expect, it } from "vitest";
import {
  caracteresUteis,
  confiancaMedia,
  estimarInclinacao,
  limiarColuna,
  montarLinhas,
  VAO_COLUNA_MAX,
  VAO_COLUNA_MIN,
  VAO_COLUNA_PADRAO,
  type PalavraBruta,
} from "../linhas";
import { palavrasDosTrechos } from "../pdf";

function p(texto: string, x: number, y: number, confianca: number | null = 0.9, h = 20): PalavraBruta {
  return { texto, x0: x, y0: y, x1: x + texto.length * 12, y1: y + h, confianca };
}

function frase(texto: string, x: number, y: number): PalavraBruta[] {
  const saida: PalavraBruta[] = [];
  for (const t of texto.split(" ")) {
    saida.push(p(t, x, y));
    x += t.length * 12 + 6;
  }
  return saida;
}

function girar(palavras: PalavraBruta[], graus: number): PalavraBruta[] {
  const a = (graus * Math.PI) / 180;
  const f = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) + 200 });
  return palavras.map((w) => {
    const c = [f(w.x0, w.y0), f(w.x1, w.y0), f(w.x0, w.y1), f(w.x1, w.y1)];
    return {
      ...w,
      x0: Math.min(...c.map((v) => v.x)),
      x1: Math.max(...c.map((v) => v.x)),
      y0: Math.min(...c.map((v) => v.y)),
      y1: Math.max(...c.map((v) => v.y)),
    };
  });
}

describe("montarLinhas", () => {
  it("agrupa por altura e ordena de cima para baixo, da esquerda para a direita", () => {
    const palavras = [...frase("SEGUNDA LINHA", 40, 60), ...frase("PRIMEIRA LINHA AQUI", 40, 20)].reverse();
    const linhas = montarLinhas(palavras, 1000, 500);
    expect(linhas.map((l) => l.texto)).toEqual(["PRIMEIRA LINHA AQUI", "SEGUNDA LINHA"]);
    expect(linhas[0].palavras.map((w) => w.texto)).toEqual(["PRIMEIRA", "LINHA", "AQUI"]);
  });

  it("separa colunas de tabela com dois espaços e mantém a ordem (linha de produto do DANFE)", () => {
    const palavras = [
      ...frase("CÓDIGO DESCRIÇÃO DO PRODUTO", 40, 20),
      ...frase("000123", 40, 60),
      ...frase("CIMENTO CP II-E-32 50KG", 160, 60),
      ...frase("25232910", 520, 60),
      ...frase("5102", 650, 60),
      ...frase("SC", 730, 60),
      ...frase("40,000", 790, 60),
      ...frase("34,90", 900, 60),
      ...frase("1.396,00", 990, 60),
      ...frase("AREIA MEDIA LAVADA", 160, 100),
      ...frase("MATERIAIS DE CONSTRUÇÃO SÃO JOÃO LTDA", 40, 140),
      ...frase("VENDA DE MERCADORIA COM ENTREGA NA OBRA", 40, 180),
    ];
    const linhas = montarLinhas(palavras, 1200, 400);
    const produto = linhas.find((l) => l.texto.startsWith("000123"));
    expect(produto?.texto).toBe("000123  CIMENTO CP II-E-32 50KG  25232910  5102  SC  40,000  34,90  1.396,00");
    expect(produto?.texto.split(/\s{2,}/)).toHaveLength(8);
    expect(linhas.find((l) => l.texto.startsWith("MATERIAIS"))?.texto).toBe("MATERIAIS DE CONSTRUÇÃO SÃO JOÃO LTDA");
  });

  it("junta pedaços colados (fonte trocada no meio do número)", () => {
    const linhas = montarLinhas([p("TOTAL", 0, 0), p("1.396", 66, 0), p(",00", 126, 0)], 500, 100);
    expect(linhas[0].texto).toBe("TOTAL 1.396,00");
    expect(linhas[0].palavras.map((w) => w.texto)).toEqual(["TOTAL", "1.396,00"]);
  });

  it("pontuação miúda não quebra a linha", () => {
    const ponto = { texto: ".", x0: 37, y0: 16, x1: 40, y1: 20, confianca: 0.9 };
    const linhas = montarLinhas([p("Rua", 0, 0), ponto, p("Ipê", 46, 0)], 500, 100);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].texto).toBe("Rua. Ipê");
  });

  it("corrige foto torta: o valor alinhado à direita fica na linha do item", () => {
    const retas: PalavraBruta[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 100 + i * 34;
      retas.push(...frase(`ITEM ${i + 1} DESCRICAO DO PRODUTO`, 40, y));
      retas.push(p(`${i + 1}0,00`, 1300, y));
    }
    const tortas = girar(retas, -3.4);
    const esperado = Array.from({ length: 8 }, (_, i) => `ITEM ${i + 1} DESCRICAO DO PRODUTO  ${i + 1}0,00`);
    expect(montarLinhas(tortas, 1500, 600).map((l) => l.texto)).toEqual(esperado);
    const s = Math.tan((-3.4 * Math.PI) / 180);
    expect(montarLinhas(tortas, 1500, 600, { inclinacao: s }).map((l) => l.texto)).toEqual(esperado);
    expect(montarLinhas(tortas, 1500, 600, { inclinacao: 0 }).map((l) => l.texto)).not.toEqual(esperado);
  });

  it("normaliza as caixas para 0..1 com origem no topo e pondera a confiança por caracteres", () => {
    const [linha] = montarLinhas([p("AB", 100, 50, 1), p("CDEFGH", 140, 50, 0.5)], 1000, 500);
    expect(linha.caixa.x).toBeCloseTo(0.1);
    expect(linha.caixa.y).toBeCloseTo(0.1);
    expect(linha.caixa.altura).toBeCloseTo(0.04);
    expect(linha.caixa.largura).toBeCloseTo((140 + 72 - 100) / 1000);
    expect(linha.confianca).toBeCloseTo((2 * 1 + 6 * 0.5) / 8);
    expect(confiancaMedia([{ numero: 1, linhas: [linha] }])).toBeCloseTo(0.625);
    expect(caracteresUteis([{ numero: 1, linhas: [linha] }])).toBe(8);
  });

  it("confiança null quando a origem não informa (PDF)", () => {
    const linhas = montarLinhas([p("A", 0, 0, null)], 100, 100);
    expect(linhas[0].confianca).toBeNull();
    expect(confiancaMedia([{ numero: 1, linhas }])).toBeNull();
  });

  it("ignora palavras vazias e página sem palavras", () => {
    expect(montarLinhas([p("   ", 0, 0)], 100, 100)).toEqual([]);
    expect(montarLinhas([], 100, 100)).toEqual([]);
  });
});

describe("limiarColuna / estimarInclinacao", () => {
  it("limiar segue o espaço típico da página, dentro dos limites", () => {
    expect(limiarColuna([0.3])).toBe(VAO_COLUNA_PADRAO);
    expect(limiarColuna(Array(20).fill(0.28))).toBe(VAO_COLUNA_MIN);
    expect(limiarColuna(Array(20).fill(0.6))).toBeCloseTo(1.5);
    expect(limiarColuna(Array(20).fill(5))).toBe(VAO_COLUNA_MAX);
  });

  it("estima a inclinação pelos pares de palavras vizinhas", () => {
    const retas = [0, 1, 2, 3].flatMap((i) => frase("UMA LINHA DE TEXTO COMUM", 40, 100 + i * 40));
    expect(estimarInclinacao(retas)).toBeCloseTo(0, 5);
    expect(estimarInclinacao(girar(retas, 2))).toBeCloseTo(Math.tan((2 * Math.PI) / 180), 2);
    expect(estimarInclinacao(retas.slice(0, 3))).toBe(0);
  });
});

describe("palavrasDosTrechos (camada de texto do PDF)", () => {
  // viewport do pdf.js em escala 1 para página A4 sem /Rotate: inverte o eixo y
  const viewport = [1, 0, 0, -1, 0, 842];
  const trecho = (str: string, x: number, y: number, tam = 7) => ({
    str,
    transform: [tam, 0, 0, tam, x, y],
    width: str.length * tam * 0.55,
  });

  it("converte trechos em palavras com origem no topo e monta a linha de produto", () => {
    const colunas = [30, 80, 250, 310, 350, 380, 420, 470];
    const valores = ["000123", "CIMENTO CP II-E-32 50KG", "25232910", "5102", "SC", "40,000", "34,90", "1.396,00"];
    const trechos = [
      ...valores.map((v, i) => trecho(v, colunas[i], 400)),
      trecho("DADOS DOS PRODUTOS / SERVIÇOS", 30, 420),
    ];
    const palavras = palavrasDosTrechos(trechos, viewport);
    expect(palavras.find((w) => w.texto === "CIMENTO")).toMatchObject({ x0: 80, y0: 842 - 400 - 0.8 * 7 });
    const linhas = montarLinhas(palavras, 595, 842, { inclinacao: 0 });
    expect(linhas.map((l) => l.texto)).toEqual([
      "DADOS DOS PRODUTOS / SERVIÇOS",
      "000123  CIMENTO CP II-E-32 50KG  25232910  5102  SC  40,000  34,90  1.396,00",
    ]);
  });

  it("ignora texto vertical e trechos vazios", () => {
    const vertical = { str: "CANHOTO", transform: [0, 7, -7, 0, 20, 300], width: 30 };
    expect(palavrasDosTrechos([vertical, trecho("  ", 10, 10)], viewport)).toEqual([]);
  });
});
