/**
 * Códigos de barras e QR com zxing-wasm (porte do zxing-cpp), sempre local —
 * inclusive no modo "vision".
 *
 * - Code-128 do DANFE: os 44 dígitos da chave de acesso;
 * - ITF (intercalado 2 de 5) do boleto: os 44 dígitos do código de barras;
 * - QR da NFC-e: a URL de consulta com `p=chave|...`.
 *
 * O .wasm é lido do disco (`wasmBinary`): sem isso o zxing-wasm busca o
 * arquivo no jsDelivr. Atenção: `purgeZXingModule()` também apaga essa
 * configuração, por isso ela é reaplicada antes de cada leitura.
 *
 * O heap do WASM cresce com a maior imagem lida e nunca encolhe; o módulo é
 * descartado (e recriado sob demanda) depois de um tempo ocioso ou de muitas
 * leituras, para o coletor de lixo devolver essa memória.
 */
import fs from "node:fs";
import { prepareZXingModule, purgeZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
import type { CodigoLido, FormatoCodigo } from "../tipos";
import { arquivoDoPacote } from "./caminhos";
import { unicoNoProcesso } from "./semaforo";

/** Imagem crua RGBA (4 bytes por pixel), como sai do sharp com `ensureAlpha().raw()`. */
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
  // mesma referência de `overrides` → não recria o módulo se já existir
  prepareZXingModule({ overrides: estado.overrides, equalityFn: Object.is, fireImmediately: false });
}

/** Descarta a instância do WASM (a memória volta quando o GC passar). */
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

export function formatoCodigo(formato: string): FormatoCodigo {
  if (formato.startsWith("Code128")) return "CODE128";
  if (formato.startsWith("ITF")) return "ITF";
  if (formato.startsWith("QR")) return "QR";
  return "OUTRO";
}

/** Lê os códigos de uma imagem RGBA. Falha do leitor não derruba a leitura: devolve []. */
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

/** Remove repetidos (mesmo formato e conteúdo), mantendo a primeira ocorrência. */
export function semRepetidos(codigos: CodigoLido[]): CodigoLido[] {
  const vistos = new Set<string>();
  return codigos.filter((c) => {
    const chave = `${c.formato}|${c.texto}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
