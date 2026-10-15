/**
 * Leitor nativo de documentos de custo (foto ou PDF de NF-e/DANFE, NFC-e,
 * NFS-e, recibo, boleto, guia) — sem LLM e sem serviço de IA de terceiros.
 *
 *   arquivo ──extração──► TextoExtraido ──interpretação──► DocumentoLido ──► normalizarLeitura
 *
 * - Extração (`extracao/`): camada de texto do PDF digital (exata, custo zero),
 *   códigos de barras/QR (chave de acesso, boleto, guia) e OCR da foto ou do
 *   PDF escaneado — local (Tesseract, padrão) ou Cloud Vision (`OCR_MOTOR=vision`).
 * - Interpretação (`interpretacao/`): regras determinísticas por tipo de
 *   documento, ancoradas nos rótulos impressos e nos dígitos verificadores.
 *
 * Configuração (variáveis de ambiente, só no servidor):
 * - `OCR_MOTOR` — `local` (padrão), `vision` ou `desligado` (foto/PDF só anexados);
 * - `CNPJS_EMPRESA` — opcional, CNPJs da empresa (separados por vírgula)
 *   para conferir se o destinatário da nota é mesmo a empresa.
 */
import type { DocumentoLido } from "../leitura-documento";
import { extrairTexto } from "./extracao";
import { interpretarDocumento } from "./interpretacao";
import type { MidiaDocumento } from "./tipos";

export type { MidiaDocumento } from "./tipos";

export function leituraAutomaticaDisponivel(): boolean {
  return process.env.OCR_MOTOR !== "desligado";
}

/**
 * Lê o documento. Lança `Error` com mensagem para o usuário quando o arquivo
 * não pode ser lido (formato, PDF sem texto, fila cheia, serviço de OCR fora).
 */
export async function lerDocumentoNativo(arquivo: Buffer, midia: MidiaDocumento): Promise<DocumentoLido> {
  const inicio = performance.now();
  const texto = await extrairTexto(arquivo, midia);
  const lido = interpretarDocumento(texto);
  // Só metadados no log (nada do conteúdo do documento).
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
