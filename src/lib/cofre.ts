import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Segredos guardados no banco (hoje: o certificado A1 da empresa) cifrados com AES-256-GCM.
// A chave fica fora do banco (CHAVE_COFRE no Secret Manager): quem só tem acesso ao banco ou a um backup
// não consegue usar o certificado. Formato: versão (1 byte) | IV (12) | tag (16) | texto cifrado.

const VERSAO = 1;
const TAM_IV = 12;
const TAM_TAG = 16;

type Env = Record<string, string | undefined>;

export function chaveDoCofre(env: Env = process.env): Buffer {
  const base64 = env.CHAVE_COFRE?.trim();
  if (base64) {
    const chave = Buffer.from(base64, "base64");
    if (chave.length !== 32) throw new Error("CHAVE_COFRE deve ter 32 bytes em base64.");
    return chave;
  }
  // em desenvolvimento e no CI, derivada do AUTH_SECRET para não exigir mais uma variável
  if (env.NODE_ENV !== "production" && env.AUTH_SECRET) {
    return Buffer.from(hkdfSync("sha256", env.AUTH_SECRET, "gestao-obras", "cofre", 32));
  }
  throw new Error("CHAVE_COFRE não configurada.");
}

export function cifrar(texto: string, chave: Buffer = chaveDoCofre()): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(TAM_IV);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  // cópia em ArrayBuffer próprio: é o tipo que o Prisma aceita em campo Bytes
  return new Uint8Array(Buffer.concat([Buffer.from([VERSAO]), iv, cifra.getAuthTag(), corpo]));
}

export function decifrar(dados: Uint8Array, chave: Buffer = chaveDoCofre()): string {
  const buf = Buffer.from(dados);
  if (buf.length < 1 + TAM_IV + TAM_TAG || buf[0] !== VERSAO) throw new Error("Conteúdo cifrado inválido.");
  const iv = buf.subarray(1, 1 + TAM_IV);
  const tag = buf.subarray(1 + TAM_IV, 1 + TAM_IV + TAM_TAG);
  const decifra = createDecipheriv("aes-256-gcm", chave, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(buf.subarray(1 + TAM_IV + TAM_TAG)), decifra.final()]).toString("utf8");
}
