// Sem `wasmBinary` o zxing-wasm baixa o .wasm do jsDelivr, e `purgeZXingModule()` apaga essa config (reaplicada a cada leitura).
// O heap do WASM não encolhe: o módulo é descartado após ociosidade ou muitas leituras.
import fs from "node:fs";
import { prepareZXingModule, purgeZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
import type { CodigoLido, FormatoCodigo } from "../tipos";
import { arquivoDoPacote } from "./caminhos";
import { unicoNoProcesso } from "./semaforo";

export type ImagemRgba = { data: Uint8Array; width: number; height: number };

const OPCOES: ReaderOptions = {
  formats: ["Code128", "ITF", "QRCode"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  maxNumberOfSymbols: 4,
};

const OCIOSO_MS = 90_000;
const MAX_LEITURAS = 200;

type EstadoZxing = {
  overrides: { wasmBinary: ArrayBuffer } | null;
  leituras: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const estado = unicoNoProcesso<EstadoZxing>("zxing", () => ({ overrides: null, leituras: 0, timer: null }));

function preparar() {
  if (!estado.overrides) {
    const bytes = new Uint8Array(fs.readFileSync(arquivoDoPacote("zxing-wasm", "dist/reader/zxing_reader.wasm")));
    estado.overrides = { wasmBinary: bytes.buffer };
  }
  prepareZXingModule({ overrides: estado.overrides, equalityFn: Object.is, fireImmediately: false });
}

export function descartarZxing() {
  if (estado.timer) clearTimeout(estado.timer);
  estado.timer = null;
  estado.leituras = 0;
  purgeZXingModule();
}

function agendarDescarte() {
  if (estado.timer) clearTimeout(estado.timer);
  if (++estado.leituras >= MAX_LEITURAS) {
    descartarZxing();
    return;
  }
  estado.timer = setTimeout(descartarZxing, OCIOSO_MS);
  estado.timer.unref?.();
}

function formatoCodigo(formato: string): FormatoCodigo {
  if (formato.startsWith("Code128")) return "CODE128";
  if (formato.startsWith("ITF")) return "ITF";
  if (formato.startsWith("QR")) return "QR";
  return "OUTRO";
}

export async function lerCodigos(imagem: ImagemRgba, pagina: number): Promise<CodigoLido[]> {
  try {
    preparar();
    const dados = new Uint8ClampedArray(imagem.data.buffer, imagem.data.byteOffset, imagem.data.byteLength);
    const resultados = await readBarcodes(
      { data: dados, width: imagem.width, height: imagem.height, colorSpace: "srgb" } as ImageData,
      OPCOES,
    );
    return resultados
      .filter((r) => r.isValid && r.text)
      .map((r) => ({ formato: formatoCodigo(r.format), texto: r.text, pagina }));
  } catch (e) {
    console.error("[leitor-nativo] falha ao ler códigos de barras", e);
    return [];
  } finally {
    agendarDescarte();
  }
}

export function semRepetidos(codigos: CodigoLido[]): CodigoLido[] {
  const vistos = new Set<string>();
  return codigos.filter((c) => {
    const chave = `${c.formato}|${c.texto}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
