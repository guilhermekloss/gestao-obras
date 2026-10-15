import type { DocumentoLido } from "../leitura-documento";
import { extrairTexto } from "./extracao";
import { interpretarDocumento } from "./interpretacao";
import type { MidiaDocumento } from "./tipos";

export type { MidiaDocumento } from "./tipos";

export function leituraAutomaticaDisponivel(): boolean {
  return process.env.OCR_MOTOR !== "desligado";
}

export async function lerDocumentoNativo(arquivo: Buffer, midia: MidiaDocumento): Promise<DocumentoLido> {
  const inicio = performance.now();
  const texto = await extrairTexto(arquivo, midia);
  const lido = interpretarDocumento(texto);
  console.info(
    JSON.stringify({
      evento: "leitura_documento",
      origem: texto.origem,
      tipo: lido.tipo,
      legibilidade: lido.legibilidade,
      paginas: texto.paginas.length,
      codigos: texto.codigos.length,
      ms: Math.round(performance.now() - inicio),
    }),
  );
  return lido;
}
