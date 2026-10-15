/**
 * Regras dos arquivos enviados (fotos do RDO e anexos de lançamentos). Puras:
 * o upload e o download ficam em `app/api/upload` e `app/api/fotos`.
 */
export type ExtensaoArquivo = "jpg" | "png" | "webp" | "pdf";

export const TIPO_MIME: Record<ExtensaoArquivo, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Limite de um arquivo (o cliente reduz as fotos antes de enviar). */
export const MAX_BYTES_ARQUIVO = 8 * 1024 * 1024;

/**
 * Tipo real pelo conteúdo (assinatura no início do arquivo), não pelo nome:
 * um HTML/SVG renomeado para `.jpg` é recusado.
 */
export function tipoPeloConteudo(b: Uint8Array): ExtensaoArquivo | null {
  const comeca = (assinatura: number[], deslocamento = 0) =>
    b.length >= deslocamento + assinatura.length && assinatura.every((byte, i) => b[deslocamento + i] === byte);
  if (comeca([0xff, 0xd8, 0xff])) return "jpg";
  if (comeca([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (comeca([0x52, 0x49, 0x46, 0x46]) && comeca([0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  if (comeca([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  return null;
}

/** Nome gerado pelo storage (`lib/storage.ts`): `<epoch ms>-<hex>.<ext>`. */
const NOME_ARQUIVO = /^\d{10,16}-[0-9a-f]{8,32}\.(jpg|png|webp|pdf)$/;

export function nomeArquivoValido(nome: string): boolean {
  return NOME_ARQUIVO.test(nome);
}

export function extensaoDoNome(nome: string): ExtensaoArquivo | null {
  return nomeArquivoValido(nome) ? (nome.slice(nome.lastIndexOf(".") + 1) as ExtensaoArquivo) : null;
}

const PREFIXO_URL = "/api/fotos/";

export function urlDoArquivo(nome: string): string {
  return PREFIXO_URL + nome;
}

/** `/api/fotos/<nome>` → nome; `null` para qualquer outro endereço (externo, `javascript:`, `/\\host`...). */
export function nomeDaUrlArquivo(url: string): string | null {
  if (!url.startsWith(PREFIXO_URL)) return null;
  const nome = url.slice(PREFIXO_URL.length);
  return nomeArquivoValido(nome) ? nome : null;
}

/** Endereço aceito para gravar como foto/anexo: só arquivos enviados pelo próprio app. */
export function urlArquivoValida(url: string): boolean {
  return nomeDaUrlArquivo(url) !== null;
}
