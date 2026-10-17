import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Segredos guardados no banco (hoje: o certificado A1 da empresa) cifrados com AES-256-GCM.
// A chave fica fora do banco: quem só tem acesso ao banco ou a um backup não consegue usar o certificado.
// Formato: origem da chave (1 byte) | IV (12) | tag (16) | texto cifrado.
//   1 = CHAVE_COFRE (Secret Manager, criada pelo Terraform);
//   2 = derivada do AUTH_SECRET (vale enquanto a CHAVE_COFRE não existe na instalação).
// O byte de origem deixa o certificado guardado com uma chave legível depois que a outra aparece.

export type OrigemChave = 1 | 2;
export type ChavesDoCofre = Partial<Record<OrigemChave, Buffer>>;

const TAM_IV = 12;
const TAM_TAG = 16;

type Env = Record<string, string | undefined>;

export function chavesDoCofre(env: Env = process.env): ChavesDoCofre {
  const chaves: ChavesDoCofre = {};
  const base64 = env.CHAVE_COFRE?.trim();
  if (base64) {
    const chave = Buffer.from(base64, "base64");
    if (chave.length !== 32) throw new Error("CHAVE_COFRE deve ter 32 bytes em base64.");
    chaves[1] = chave;
  }
  if (env.AUTH_SECRET) chaves[2] = Buffer.from(hkdfSync("sha256", env.AUTH_SECRET, "gestao-obras", "cofre", 32));
  return chaves;
}

export function cifrar(texto: string, chaves: ChavesDoCofre = chavesDoCofre()): Uint8Array<ArrayBuffer> {
  const origem: OrigemChave | undefined = chaves[1] ? 1 : chaves[2] ? 2 : undefined;
  if (!origem) throw new Error("Sem chave para cifrar: configure CHAVE_COFRE ou AUTH_SECRET.");
  const iv = randomBytes(TAM_IV);
  const cifra = createCipheriv("aes-256-gcm", chaves[origem]!, iv);
  const corpo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  // cópia em ArrayBuffer próprio: é o tipo que o Prisma aceita em campo Bytes
  return new Uint8Array(Buffer.concat([Buffer.from([origem]), iv, cifra.getAuthTag(), corpo]));
}

export function decifrar(dados: Uint8Array, chaves: ChavesDoCofre = chavesDoCofre()): string {
  const buf = Buffer.from(dados);
  const origem = buf[0];
  if (buf.length < 1 + TAM_IV + TAM_TAG || (origem !== 1 && origem !== 2)) throw new Error("Conteúdo cifrado inválido.");
  const chave = chaves[origem];
  if (!chave) throw new Error(origem === 1 ? "CHAVE_COFRE não configurada." : "AUTH_SECRET não configurado.");
  const iv = buf.subarray(1, 1 + TAM_IV);
  const tag = buf.subarray(1 + TAM_IV, 1 + TAM_IV + TAM_TAG);
  const decifra = createDecipheriv("aes-256-gcm", chave, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(buf.subarray(1 + TAM_IV + TAM_TAG)), decifra.final()]).toString("utf8");
}
