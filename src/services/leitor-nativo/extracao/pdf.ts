import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { Pagina } from "../tipos";
import { montarLinhas, type PalavraBruta } from "./linhas";
import { ErroLeitura } from "./semaforo";

export const MAX_PAGINAS = 5;
export const MIN_CARACTERES_PAGINA = 40;
const MAX_PIXELS_IMAGEM = 40_000_000;

const MSG_PDF_SENHA = "O PDF está protegido por senha. Envie o arquivo sem senha ou uma foto do documento.";
export const MSG_PDF_INVALIDO =
  "Não foi possível ler o arquivo PDF (arquivo corrompido ou incompleto). Tente outro PDF ou uma foto do documento.";

type DocumentoPdf = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function abrirPdf(arquivo: Buffer | Uint8Array): Promise<DocumentoPdf> {
  try {
    // pdf.js desanexa o buffer recebido: sempre passar uma cópia.
    return await getDocumentProxy(new Uint8Array(arquivo), {
      verbosity: 0,
      isOffscreenCanvasSupported: false, // imagens como bytes crus, não ImageBitmap
      maxImageSize: MAX_PIXELS_IMAGEM,
      stopAtErrors: false,
    });
  } catch (e) {
    const nome = (e as { name?: string })?.name;
    if (nome === "PasswordException") throw new ErroLeitura(MSG_PDF_SENHA, { cause: e });
    throw new ErroLeitura(MSG_PDF_INVALIDO, { cause: e });
  }
}

type Matriz = [number, number, number, number, number, number];

const multiplicar = (m1: number[], m2: number[]): Matriz => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

type TrechoPdf = { str: string; transform: number[]; width: number };

export function palavrasDosTrechos(trechos: TrechoPdf[], transformacaoPagina: number[]): PalavraBruta[] {
  const palavras: PalavraBruta[] = [];
  for (const t of trechos) {
    if (!t.str || !t.str.trim()) continue;
    const m = multiplicar(transformacaoPagina, t.transform);
    if (Math.abs(m[1]) > Math.abs(m[0])) continue; // texto vertical
    const tamanho = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
    if (!tamanho) continue;
    const espelhado = m[0] < 0; // texto de cabeça para baixo
    const largura = t.width || tamanho * 0.5 * t.str.length;
    const xIni = espelhado ? m[4] - largura : m[4];
    const base = m[5];
    const porCaractere = largura / t.str.length;
    for (const achado of t.str.matchAll(/\S+/g)) {
      const i = achado.index ?? 0;
      palavras.push({
        texto: achado[0],
        x0: xIni + i * porCaractere,
        x1: xIni + (i + achado[0].length) * porCaractere,
        y0: base - 0.8 * tamanho,
        y1: base + 0.2 * tamanho,
        confianca: null,
      });
    }
  }
  return palavras;
}

export async function paginasDoTexto(pdf: DocumentoPdf): Promise<Pagina[]> {
  const paginas: Pagina[] = [];
  const total = Math.min(pdf.numPages, MAX_PAGINAS);
  for (let numero = 1; numero <= total; numero++) {
    const pagina = await pdf.getPage(numero);
    try {
      const viewport = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      const trechos = conteudo.items.filter((i): i is TrechoPdf & typeof i => "str" in i);
      const palavras = palavrasDosTrechos(trechos, viewport.transform);
      paginas.push({ numero, linhas: montarLinhas(palavras, viewport.width, viewport.height, { inclinacao: 0 }) });
    } finally {
      pagina.cleanup();
    }
  }
  return paginas;
}

export type ImagemPdf = { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: 1 | 3 | 4 };

type ObjetoImagemPdf = { width?: number; height?: number; kind?: number; data?: Uint8Array | Uint8ClampedArray };

// pdf.js: 1 bit por pixel, bit 1 = branco.
function desempacotar1Bit(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const porLinha = (width + 7) >> 3;
  const saida = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = data[y * porLinha + (x >> 3)];
      saida[y * width + x] = byte & (0x80 >> (x & 7)) ? 255 : 0;
    }
  }
  return saida;
}

function converterImagem(obj: ObjetoImagemPdf | null | undefined): ImagemPdf | null {
  if (!obj?.data || !obj.width || !obj.height) return null;
  const { data, width, height } = obj;
  // ImageKind do pdf.js: 1 = cinza 1 bit (scanner P&B, CCITT/JBIG2), 2 = RGB, 3 = RGBA
  if (obj.kind === 1 && data.length === ((width + 7) >> 3) * height) {
    return { data: desempacotar1Bit(data, width, height), width, height, channels: 1 };
  }
  const canais = data.length / (width * height);
  if (canais === 1 || canais === 3 || canais === 4) return { data, width, height, channels: canais };
  return null;
}

export async function imagensDaPagina(pdf: DocumentoPdf, numero: number, ladoMinimo = 40): Promise<ImagemPdf[]> {
  const { OPS } = await getResolvedPDFJS();
  const pagina = await pdf.getPage(numero);
  try {
    const operadores = await pagina.getOperatorList();
    const imagens: ImagemPdf[] = [];
    const vistas = new Set<string>();
    for (let i = 0; i < operadores.fnArray.length; i++) {
      const fn = operadores.fnArray[i];
      let obj: ObjetoImagemPdf | null = null;
      if (fn === OPS.paintImageXObject) {
        const chave = operadores.argsArray[i][0] as string;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        const objs = chave.startsWith("g_") ? pagina.commonObjs : pagina.objs;
        obj = await new Promise<ObjetoImagemPdf | null>((resolve) => {
          try {
            objs.get(chave, resolve);
          } catch {
            resolve(null);
          }
        });
      } else if (fn === OPS.paintInlineImageXObject) {
        obj = operadores.argsArray[i][0] as ObjetoImagemPdf;
      } else {
        continue;
      }
      const img = converterImagem(obj);
      if (img && Math.min(img.width, img.height) >= ladoMinimo) imagens.push(img);
    }
    return imagens.sort((a, b) => b.width * b.height - a.width * a.height);
  } finally {
    pagina.cleanup();
  }
}
