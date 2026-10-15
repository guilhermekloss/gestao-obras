/**
 * Deriva uma "foto de celular" do render limpo (PNG ~192 dpi) com sharp:
 * papel sobre a mesa, rotação e cisalhamento leves, sombra/vinheta,
 * desfoque, pretos acinzentados, JPEG e lado maior limitado.
 */
import sharp from "sharp";
import type { ParametrosFoto } from "./documentos";

/** o cliente do app reduz a 2400 px (JPEG 0,85) antes de enviar */
const LADO_MAXIMO = 2400;

/** Sombra linear numa direção: iluminação desigual de foto de celular. */
function sombraSvg(w: number, h: number, sombra: number, direcao: number): Buffer {
  const rad = (direcao * Math.PI) / 180;
  const x2 = 50 + 50 * Math.cos(rad);
  const y2 = 50 + 50 * Math.sin(rad);
  const fim = `rgb(${Math.round(255 * (1 - sombra))},${Math.round(255 * (1 - sombra * 0.95))},${Math.round(255 * (1 - sombra * 0.85))})`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><linearGradient id="s" x1="${100 - x2}%" y1="${100 - y2}%" x2="${x2}%" y2="${y2}%">
<stop offset="0" stop-color="#fff"/><stop offset="0.45" stop-color="#f2f2f2"/><stop offset="1" stop-color="${fim}"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/></svg>`);
}

/** Vinheta suave (bordas mais escuras que o centro). */
function vinhetaSvg(w: number, h: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><radialGradient id="v" cx="50%" cy="48%" r="75%"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#c4c4c4"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#v)"/></svg>`);
}

export async function gerarFoto(png: Buffer, p: ParametrosFoto, ladoMaximo = LADO_MAXIMO): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  // 1. cor do papel (multiplica o branco)
  let img = p.papel
    ? await sharp(png)
        .composite([{ input: { create: { width: w, height: h, channels: 3, background: p.papel } }, blend: "multiply" }])
        .png({ compressionLevel: 1 })
        .toBuffer()
    : png;

  // 2. mesa em volta + cisalhamento leve + rotação
  const margem = Math.round(Math.max(w, h) * 0.045);
  img = await sharp(img)
    .flatten({ background: "#ffffff" })
    .extend({ top: margem, bottom: margem, left: margem, right: margem, background: p.fundo })
    .png({ compressionLevel: 1 })
    .toBuffer();
  img = await sharp(img)
    .affine(
      [
        [1, p.cisalhamento],
        [p.cisalhamento * 0.4, 1],
      ],
      { background: p.fundo, interpolator: "bicubic" },
    )
    .png({ compressionLevel: 1 })
    .toBuffer();
  img = await sharp(img).rotate(p.angulo, { background: p.fundo }).png({ compressionLevel: 1 }).toBuffer();

  // 3. iluminação desigual, desfoque, contraste de câmera (pretos acinzentados)
  const m2 = await sharp(img).metadata();
  img = await sharp(img)
    .composite([
      { input: sombraSvg(m2.width ?? 0, m2.height ?? 0, p.sombra, p.direcaoSombra), blend: "multiply" },
      { input: vinhetaSvg(m2.width ?? 0, m2.height ?? 0), blend: "multiply" },
    ])
    .png({ compressionLevel: 1 })
    .toBuffer();
  return sharp(img)
    .blur(p.desfoque)
    .linear(0.88, 18)
    .resize({ width: ladoMaximo, height: ladoMaximo, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: p.qualidade, mozjpeg: true })
    .toBuffer();
}

export function parametrosFortes(p: ParametrosFoto): ParametrosFoto {
  return {
    ...p,
    angulo: Math.sign(p.angulo || 1) * Math.min(Math.abs(p.angulo) * 1.6 + 0.5, 6),
    desfoque: p.desfoque * 1.7,
    sombra: Math.min(p.sombra + 0.18, 0.7),
    cisalhamento: p.cisalhamento * 2,
    qualidade: 55,
  };
}

