import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Storage } from "@google-cloud/storage";

/**
 * Driver de storage de fotos e anexos. Os arquivos são sempre servidos via
 * /api/fotos (com sessão), nunca por URL pública do bucket.
 * - Local: grava em ./uploads (desenvolvimento).
 * - GCS: grava no bucket de `STORAGE_BUCKET` (produção no Cloud Run, cujo disco
 *   é efêmero). Credenciais vêm da service account do serviço (ADC).
 */
export interface StorageDriver {
  salvar(buffer: Buffer, extensao: string): Promise<string>; // retorna URL
  ler(nomeArquivo: string): Promise<Buffer>;
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function novoNome(extensao: string) {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extensao}`;
}

export const storageLocal: StorageDriver = {
  async salvar(buffer, extensao) {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const nome = novoNome(extensao);
    await writeFile(path.join(UPLOADS_DIR, nome), buffer);
    return `/api/fotos/${nome}`;
  },
  async ler(nomeArquivo) {
    // impede path traversal
    const seguro = path.basename(nomeArquivo);
    return readFile(path.join(UPLOADS_DIR, seguro));
  },
};

export function storageGcs(bucketName: string): StorageDriver {
  const bucket = new Storage().bucket(bucketName);
  const PREFIXO = "uploads/";
  return {
    async salvar(buffer, extensao) {
      const nome = novoNome(extensao);
      // ifGenerationMatch: 0 — nunca sobrescreve um objeto existente
      await bucket.file(PREFIXO + nome).save(buffer, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } });
      return `/api/fotos/${nome}`;
    },
    async ler(nomeArquivo) {
      const [conteudo] = await bucket.file(PREFIXO + path.basename(nomeArquivo)).download();
      return conteudo;
    },
  };
}

export const storage: StorageDriver = process.env.STORAGE_BUCKET
  ? storageGcs(process.env.STORAGE_BUCKET)
  : storageLocal;
