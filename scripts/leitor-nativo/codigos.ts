import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as writer from "zxing-wasm/writer";
import * as reader from "zxing-wasm/reader";

const requerer = createRequire(import.meta.url);

let preparado = false;
// .wasm lido do disco: por padrão o zxing-wasm o baixaria da rede.
function preparar() {
  if (preparado) return;
  const wasm = (subpath: string) => {
    const b = readFileSync(requerer.resolve(subpath));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  writer.prepareZXingModule({ overrides: { wasmBinary: wasm("zxing-wasm/writer/zxing_writer.wasm") } });
  reader.prepareZXingModule({ overrides: { wasmBinary: wasm("zxing-wasm/reader/zxing_reader.wasm") } });
  preparado = true;
}

export type FormatoEscrita = "Code128" | "ITF" | "QRCode";

export async function svgCodigo(texto: string, formato: FormatoEscrita, opcoes = ""): Promise<string> {
  preparar();
  const r = await writer.writeBarcode(texto, { format: formato, scale: 1, addQuietZones: false, options: opcoes });
  if (r.error) throw new Error(`zxing (${formato}): ${r.error}`);
  const m = /<svg width="(\d+)" height="(\d+)"[^>]*>([\s\S]*)<\/svg>/.exec(r.svg);
  if (!m) throw new Error("SVG inesperado do zxing");
  const [, w, h, corpo] = m;
  const aspecto = formato === "QRCode" ? "xMidYMid meet" : "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="${aspecto}" shape-rendering="crispEdges" width="100%" height="100%">${corpo.replace(/<desc>[^<]*<\/desc>/, "")}</svg>`;
}

type CodigoDecodificado = { formato: string; texto: string };

export async function lerCodigos(imagem: Uint8Array): Promise<CodigoDecodificado[]> {
  preparar();
  const r = await reader.readBarcodes(imagem, {
    formats: ["Code128", "ITF", "QRCode"],
    tryHarder: true,
    tryRotate: true,
    maxNumberOfSymbols: 8,
  });
  return r.filter((x) => x.isValid).map((x) => ({ formato: x.format, texto: x.text }));
}
