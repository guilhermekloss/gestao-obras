import fs from "node:fs";
import sharp from "sharp";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { arquivoDoPacote } from "../caminhos";

let preparado = false;
function prepararEscritor() {
  if (preparado) return;
  const bytes = new Uint8Array(fs.readFileSync(arquivoDoPacote("zxing-wasm", "dist/writer/zxing_writer.wasm")));
  prepareZXingModule({ overrides: { wasmBinary: bytes.buffer }, fireImmediately: false });
  preparado = true;
}

export async function codigoPng(formato: "Code128" | "ITF" | "QRCode", texto: string, escala: number, altura?: number) {
  prepararEscritor();
  const r = await writeBarcode(texto, { format: formato, scale: escala, addQuietZones: true, addHRT: false });
  if (r.error || !r.image) throw new Error(`zxing writer: ${r.error}`);
  let img = sharp(Buffer.from(await r.image.arrayBuffer()));
  if (altura) {
    const meta = await img.metadata();
    img = sharp(await img.resize({ width: meta.width, height: altura, fit: "fill", kernel: "nearest" }).png().toBuffer());
  }
  const buf = await img.png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { png: buf, largura: meta.width!, altura: meta.height! };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function imagemDocumento(
  largura: number,
  linhas: [string, number, boolean?][],
  codigos: { png: Buffer; largura: number; altura: number }[] = [],
): Promise<Buffer> {
  let y = 30;
  let textos = "";
  for (const [t, tamanho, negrito] of linhas) {
    y += tamanho * 1.7;
    textos += `<text x="40" y="${y}" font-family="DejaVu Sans, sans-serif" font-size="${tamanho}" font-weight="${negrito ? "bold" : "normal"}" fill="#111">${esc(t)}</text>`;
  }
  let topo = Math.ceil(y + 40);
  const altura = topo + codigos.reduce((s, c) => s + c.altura + 40, 0) + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}"><rect width="100%" height="100%" fill="#fff"/>${textos}</svg>`;
  const camadas = codigos.map((c) => {
    const camada = { input: c.png, top: topo, left: 40 };
    topo += c.altura + 40;
    return camada;
  });
  return sharp(Buffer.from(svg)).composite(camadas).png().toBuffer();
}

function montarPdf(objetos: Buffer[]): Buffer {
  const partes: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const posicoes: number[] = [];
  let tamanho = partes[0].length;
  objetos.forEach((obj, i) => {
    posicoes.push(tamanho);
    const bloco = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), obj, Buffer.from("\nendobj\n")]);
    partes.push(bloco);
    tamanho += bloco.length;
  });
  const xref =
    `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${tamanho}\n%%EOF\n`;
  partes.push(Buffer.from(xref));
  return Buffer.concat(partes);
}

const fluxo = (dicionario: string, dados: Buffer) =>
  Buffer.concat([Buffer.from(`<< ${dicionario} /Length ${dados.length} >>\nstream\n`), dados, Buffer.from("\nendstream")]);

const textoPdf = (s: string) => `(${s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;

// y de baixo para cima (coordenadas do PDF)
export function pdfComTexto(trechos: [string, number, number, number][]): Buffer {
  const conteudo = Buffer.from(
    trechos.map(([t, x, y, tam]) => `BT /F1 ${tam} Tf ${x} ${y} Td ${textoPdf(t)} Tj ET`).join("\n"),
    "latin1", // WinAnsiEncoding: acentos em Latin-1
  );
  return montarPdf([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    fluxo("", conteudo),
  ]);
}

export async function pdfEscaneado(imagem: Buffer): Promise<Buffer> {
  const { data: jpeg, info } = await sharp(imagem).flatten({ background: "#fff" }).jpeg({ quality: 90 }).toBuffer({
    resolveWithObject: true,
  });
  const larguraPt = 595;
  const alturaPt = Math.round((larguraPt * info.height) / info.width);
  return montarPdf([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${larguraPt} ${alturaPt}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    ),
    fluxo(
      `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
      jpeg,
    ),
    fluxo("", Buffer.from(`q ${larguraPt} 0 0 ${alturaPt} 0 0 cm /Im1 Do Q`)),
  ]);
}
