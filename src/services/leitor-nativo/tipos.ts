/**
 * Contrato entre as etapas do leitor nativo de documentos (sem LLM):
 *
 *   arquivo (foto/PDF) ──extração──► TextoExtraido ──interpretação──► DocumentoLido
 *
 * - `extracao/` produz o `TextoExtraido`: camada de texto do PDF digital ou
 *   OCR (local ou Cloud Vision), mais os códigos de barras/QR decodificados.
 * - `interpretacao/` é puro: transforma o `TextoExtraido` no `DocumentoLido`
 *   (`leitura-documento.ts`), que segue para `normalizarLeitura` como antes.
 */

export type MidiaDocumento = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** Retângulo em coordenadas normalizadas da página (0..1), origem no canto superior esquerdo. */
export type Caixa = { x: number; y: number; largura: number; altura: number };

export type Palavra = {
  texto: string;
  caixa: Caixa;
  /** 0..1; null quando a origem não informa (camada de texto do PDF) */
  confianca: number | null;
};

/** Uma linha visual: palavras na mesma altura, da esquerda para a direita. */
export type Linha = {
  /** palavras unidas por um espaço (dois ou mais espaços quando há um vão grande entre colunas) */
  texto: string;
  caixa: Caixa;
  palavras: Palavra[];
  confianca: number | null;
};

export type Pagina = {
  /** 1, 2, ... */
  numero: number;
  /** de cima para baixo */
  linhas: Linha[];
};

export type FormatoCodigo = "QR" | "CODE128" | "ITF" | "OUTRO";

export type CodigoLido = {
  formato: FormatoCodigo;
  /** conteúdo decodificado como veio do leitor (sem validação) */
  texto: string;
  pagina: number;
};

export type OrigemTexto = "pdf-texto" | "ocr-local" | "ocr-vision";

export type TextoExtraido = {
  origem: OrigemTexto;
  paginas: Pagina[];
  codigos: CodigoLido[];
  /** média ponderada da confiança do OCR (0..1); null para a camada de texto do PDF */
  confiancaMedia: number | null;
};
