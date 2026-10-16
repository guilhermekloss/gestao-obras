export type MidiaDocumento = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type Caixa = { x: number; y: number; largura: number; altura: number };

export type Palavra = {
  texto: string;
  caixa: Caixa;
  confianca: number | null;
};

export type Linha = {
  texto: string;
  caixa: Caixa;
  palavras: Palavra[];
  confianca: number | null;
};

export type Pagina = {
  numero: number;
  linhas: Linha[];
};

export type FormatoCodigo = "QR" | "CODE128" | "ITF" | "OUTRO";

export type CodigoLido = {
  formato: FormatoCodigo;
  texto: string;
  pagina: number;
};

export type OrigemTexto = "pdf-texto" | "ocr-local" | "ocr-vision";

export type TextoExtraido = {
  origem: OrigemTexto;
  paginas: Pagina[];
  codigos: CodigoLido[];
  confiancaMedia: number | null;
};
