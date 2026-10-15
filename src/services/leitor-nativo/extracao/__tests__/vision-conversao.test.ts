import { describe, expect, it } from "vitest";
import { MSG_OCUPADO } from "../semaforo";
import {
  anotacoesDoArquivo,
  ErroVisionResposta,
  mensagemErroVision,
  MSG_VISION_ARQUIVO,
  MSG_VISION_CONEXAO,
  MSG_VISION_INSTAVEL,
  MSG_VISION_SEM_CREDENCIAL,
  MSG_VISION_SEM_PERMISSAO,
  paginasDoVision,
  type AnotacaoVision,
  type PaginaVision,
  type RespostaArquivosVision,
} from "../vision-conversao";

type Ponto = { x: number; y: number };
type Quebra = "SPACE" | "SURE_SPACE" | "EOL_SURE_SPACE" | "LINE_BREAK" | "HYPHEN";

/**
 * Palavra no formato do Vision. `transformar` permite simular a foto girada
 * (os vértices seguem a direção do texto: 0 = canto superior esquerdo do texto).
 */
function palavra(
  texto: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  confidence: number,
  quebra?: Quebra,
  transformar: (p: Ponto) => Ponto = (p) => p,
  normalizar?: { largura: number; altura: number },
) {
  const cantos = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map(transformar);
  const boundingBox = normalizar
    ? { normalizedVertices: cantos.map((c) => ({ x: c.x / normalizar.largura, y: c.y / normalizar.altura })) }
    : // o JSON do Vision omite campos zero
      { vertices: cantos.map((c) => ({ ...(c.x ? { x: c.x } : {}), ...(c.y ? { y: c.y } : {}) })) };
  const simbolos = [...texto].map((t, i) => ({
    text: t,
    confidence,
    ...(i === texto.length - 1 && quebra ? { property: { detectedBreak: { type: quebra } } } : {}),
  }));
  return { boundingBox, symbols: simbolos, confidence };
}

/** Página 1000×800: cabeçalho com CNPJ quebrado em pedaços, e "VALOR TOTAL" com o valor em outro bloco à direita. */
function paginaExemplo(transformar?: (p: Ponto) => Ponto, normalizar?: { largura: number; altura: number }): PaginaVision {
  const w = (t: string, x0: number, y0: number, x1: number, y1: number, c: number, q?: Quebra) =>
    palavra(t, x0, y0, x1, y1, c, q, transformar, normalizar);
  return {
    width: 1000,
    height: 800,
    blocks: [
      {
        paragraphs: [
          {
            words: [
              w("CNPJ", 0, 40, 70, 60, 0.99),
              w(":", 70, 40, 76, 60, 0.95, "SPACE"),
              w("34.567.890", 90, 40, 230, 60, 0.98),
              w("/", 230, 40, 238, 60, 0.97),
              w("0001", 238, 40, 300, 60, 0.96),
              w("-", 300, 40, 308, 60, 0.9),
              w("95", 308, 40, 340, 60, 0.6, "LINE_BREAK"),
            ],
          },
          { words: [w("VALOR", 50, 100, 140, 120, 0.99, "SPACE"), w("TOTAL", 150, 100, 240, 120, 0.99, "LINE_BREAK")] },
        ],
      },
      { paragraphs: [{ words: [w("1.543,90", 800, 100, 920, 120, 0.97, "LINE_BREAK")] }] },
    ],
  };
}

describe("paginasDoVision", () => {
  it("cola as palavras sem quebra detectada e monta as linhas com colunas", () => {
    const [pagina] = paginasDoVision([{ fullTextAnnotation: { pages: [paginaExemplo()] } }]);
    expect(pagina.numero).toBe(1);
    expect(pagina.linhas.map((l) => l.texto)).toEqual(["CNPJ: 34.567.890/0001-95", "VALOR TOTAL  1.543,90"]);
    const cnpj = pagina.linhas[0].palavras[1];
    expect(cnpj.texto).toBe("34.567.890/0001-95");
    expect(cnpj.caixa.x).toBeCloseTo(0.09);
    expect(cnpj.caixa.y).toBeCloseTo(0.05);
    expect(cnpj.caixa.largura).toBeCloseTo(0.25);
    // confiança ponderada por caracteres: o "95" duvidoso puxa para baixo
    expect(cnpj.confianca!).toBeLessThan(0.97);
    expect(cnpj.confianca!).toBeGreaterThan(0.9);
    expect(pagina.linhas[1].confianca).toBeCloseTo((10 * 0.99 + 8 * 0.97) / 18);
  });

  it("endireita a foto deitada (texto descendo, girado 90° no sentido horário)", () => {
    // conteúdo 1000×800 girado 90° horário vira uma imagem 800×1000: (x, y) → (800 − y, x)
    const giro = (p: Ponto) => ({ x: 800 - p.y, y: p.x });
    const deitada = { ...paginaExemplo(giro), width: 800, height: 1000 };
    const [pagina] = paginasDoVision([{ fullTextAnnotation: { pages: [deitada] } }]);
    expect(pagina.linhas.map((l) => l.texto)).toEqual(["CNPJ: 34.567.890/0001-95", "VALOR TOTAL  1.543,90"]);
    expect(pagina.linhas[1].palavras[2].caixa.x).toBeCloseTo(0.8);
  });

  it("corrige a inclinação pelos vértices: valor alinhado à direita fica na linha certa", () => {
    // cupom a −3,4° (lado direito sobe); entrelinha de 34 px, valor a 1300 px da margem
    const a = (-3.4 * Math.PI) / 180;
    const giro = (p: Ponto) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) + 150 });
    const paragrafos = Array.from({ length: 6 }, (_, i) => {
      const y = 100 + i * 34;
      return {
        words: [
          palavra(`ITEM${i + 1}`, 40, y, 130, y + 20, 0.95, "SPACE", giro),
          palavra("PARAFUSO", 145, y, 260, y + 20, 0.95, "LINE_BREAK", giro),
        ],
      };
    });
    const valores = Array.from({ length: 6 }, (_, i) => {
      const y = 100 + i * 34;
      return { words: [palavra(`${i + 1}0,00`, 1300, y, 1370, y + 20, 0.95, "LINE_BREAK", giro)] };
    });
    const [pagina] = paginasDoVision([
      { fullTextAnnotation: { pages: [{ width: 1500, height: 600, blocks: [{ paragraphs: paragrafos }, { paragraphs: valores }] }] } },
    ]);
    expect(pagina.linhas.map((l) => l.texto)).toEqual(
      Array.from({ length: 6 }, (_, i) => `ITEM${i + 1} PARAFUSO  ${i + 1}0,00`),
    );
  });

  it("imagem sem texto vira página vazia", () => {
    expect(paginasDoVision([{}])).toEqual([{ numero: 1, linhas: [] }]);
  });

  it("erro dentro da resposta (HTTP 200) vira ErroVisionResposta", () => {
    const anotacao: AnotacaoVision = { error: { code: 3, message: "Bad image data." } };
    expect(() => paginasDoVision([anotacao])).toThrow(ErroVisionResposta);
  });
});

describe("files:annotate (PDF)", () => {
  it("usa normalizedVertices e o número da página do contexto", () => {
    const tamanho = { largura: 1000, altura: 800 };
    const resposta: RespostaArquivosVision = {
      responses: [
        {
          totalPages: 2,
          responses: [
            { fullTextAnnotation: { pages: [{ ...paginaExemplo(undefined, tamanho) }] }, context: { pageNumber: 2 } },
            {
              fullTextAnnotation: {
                pages: [
                  {
                    blocks: [
                      { paragraphs: [{ words: [palavra("DANFE", 100, 50, 300, 90, 0.99, "LINE_BREAK", undefined, tamanho)] }] },
                    ],
                  },
                ],
              },
              context: { pageNumber: 1 },
            },
          ],
        },
      ],
    };
    const paginas = paginasDoVision(anotacoesDoArquivo(resposta));
    expect(paginas.map((p) => p.numero)).toEqual([1, 2]);
    // página sem width/height: as coordenadas normalizadas passam direto
    expect(paginas[0].linhas[0].texto).toBe("DANFE");
    expect(paginas[0].linhas[0].caixa.x).toBeCloseTo(0.1);
    expect(paginas[0].linhas[0].caixa.y).toBeCloseTo(50 / 800);
    expect(paginas[1].linhas.map((l) => l.texto)).toEqual(["CNPJ: 34.567.890/0001-95", "VALOR TOTAL  1.543,90"]);
    expect(paginas[1].linhas[0].palavras[1].caixa.x).toBeCloseTo(0.09);
  });

  it("erro do arquivo inteiro vira ErroVisionResposta", () => {
    expect(() => anotacoesDoArquivo({ responses: [{ error: { code: 3, message: "Invalid PDF" } }] })).toThrow(
      ErroVisionResposta,
    );
  });
});

describe("mensagemErroVision", () => {
  it("traduz as falhas em mensagens para o usuário", () => {
    expect(mensagemErroVision({ mensagem: "Could not load the default credentials." })).toBe(MSG_VISION_SEM_CREDENCIAL);
    expect(mensagemErroVision({ http: 403 })).toBe(MSG_VISION_SEM_PERMISSAO);
    expect(mensagemErroVision({ http: 401 })).toBe(MSG_VISION_SEM_PERMISSAO);
    expect(mensagemErroVision({ rpc: 7 })).toBe(MSG_VISION_SEM_PERMISSAO);
    expect(mensagemErroVision({ http: 429 })).toBe(MSG_OCUPADO);
    expect(mensagemErroVision({ rpc: 8 })).toBe(MSG_OCUPADO);
    expect(mensagemErroVision({ http: 400 })).toBe(MSG_VISION_ARQUIVO);
    expect(mensagemErroVision({ rpc: 3 })).toBe(MSG_VISION_ARQUIVO);
    expect(mensagemErroVision({ http: 503 })).toBe(MSG_VISION_INSTAVEL);
    expect(mensagemErroVision({ rede: "ECONNRESET" })).toBe(MSG_VISION_CONEXAO);
    expect(mensagemErroVision({})).toBe(MSG_VISION_INSTAVEL);
  });
});
