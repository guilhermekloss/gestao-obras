import sharp from "sharp";
import type { ImagemRgba } from "./codigos";
import { ErroLeitura } from "./semaforo";

// Instância de 1 vCPU: uma thread do libvips e cache pequeno.
sharp.concurrency(1);
sharp.cache({ memory: 32, files: 0, items: 50 });

// Protege contra bombas de descompressão.
const LIMITE_PIXELS_ENTRADA = 80_000_000;
// ~10 MP, com folga para o Code-128 da chave (≥ 2 px por barra).
const LADO_MAXIMO = 3200;

export const MSG_IMAGEM_INVALIDA =
  "Não foi possível ler a imagem (arquivo corrompido ou formato não aceito). Tente outra foto ou um PDF.";

export type ImagemTrabalho = ImagemRgba;

export async function abrirImagem(arquivo: Buffer | Uint8Array): Promise<ImagemTrabalho> {
  try {
    const { data, info } = await sharp(arquivo, { limitInputPixels: LIMITE_PIXELS_ENTRADA, failOn: "error" })
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`imagem com ${info.channels} canais`);
    return { data, width: info.width, height: info.height };
  } catch (e) {
    throw new ErroLeitura(MSG_IMAGEM_INVALIDA, { cause: e });
  }
}

const LADO_CODIGO_PEQUENO = 600;

// QR da NFC-e vem com 1 px por módulo e sem margem: o zxing precisa da borda branca (zona de silêncio).
export async function imagemDeRaw(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
  opcoes: { ampliarPequena?: boolean } = {},
): Promise<ImagemTrabalho> {
  let s = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels },
    limitInputPixels: LIMITE_PIXELS_ENTRADA,
  });
  const maior = Math.max(width, height);
  if (opcoes.ampliarPequena && maior < LADO_CODIGO_PEQUENO) {
    const fator = Math.ceil(LADO_CODIGO_PEQUENO / maior);
    const borda = 8 * fator;
    s = s
      .resize({ width: width * fator, height: height * fator, kernel: "nearest" })
      .extend({ top: borda, bottom: borda, left: borda, right: borda, background: "#ffffff" });
  } else {
    s = s.resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true });
  }
  const saida = await s.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (saida.info.channels !== 4) throw new Error(`imagem com ${saida.info.channels} canais`);
  return { data: saida.data, width: saida.info.width, height: saida.info.height };
}

const deRgba = (img: ImagemTrabalho) =>
  sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });

// Acima disso o OCR não melhora e gasta tempo e heap do WASM.
const LADO_OCR_MAX = 2400;

export async function varianteParaOcr(img: ImagemTrabalho): Promise<{ png: Buffer; largura: number; altura: number }> {
  const maior = Math.max(img.width, img.height);
  const escala = Math.min(1, LADO_OCR_MAX / maior);
  const largura = Math.max(1, Math.round(img.width * escala));
  const altura = Math.max(1, Math.round(img.height * escala));
  let s = deRgba(img).removeAlpha();
  if (escala < 1) s = s.resize({ width: largura, height: altura, kernel: "lanczos3" });
  const png = await s.png({ compressionLevel: 1 }).toBuffer();
  return { png, largura, altura };
}

export async function jpegParaVision(img: ImagemTrabalho): Promise<Buffer> {
  return deRgba(img).removeAlpha().jpeg({ quality: 85, mozjpeg: false }).toBuffer();
}
