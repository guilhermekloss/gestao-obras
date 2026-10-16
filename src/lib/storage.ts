import { mkdir, writeFile, readFile, rm } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Storage } from "@google-cloud/storage";
import { urlDoArquivo } from "@/services/arquivos";

interface StorageDriver {
  salvar(buffer: Buffer, extensao: string): Promise<string>;
  ler(nomeArquivo: string): Promise<Buffer>;
  // ausente não é erro: serve para desfazer um salvar cuja gravação no banco falhou
  excluir(nomeArquivo: string): Promise<void>;
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function novoNome(extensao: string) {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extensao}`;
}

const storageLocal: StorageDriver = {
  async salvar(buffer, extensao) {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const nome = novoNome(extensao);
    await writeFile(path.join(UPLOADS_DIR, nome), buffer);
    return urlDoArquivo(nome);
  },
  async ler(nomeArquivo) {
    // impede path traversal
    const seguro = path.basename(nomeArquivo);
    return readFile(path.join(UPLOADS_DIR, seguro));
  },
  async excluir(nomeArquivo) {
    await rm(path.join(UPLOADS_DIR, path.basename(nomeArquivo)), { force: true });
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
      return urlDoArquivo(nome);
    },
    async ler(nomeArquivo) {
      const [conteudo] = await bucket.file(PREFIXO + path.basename(nomeArquivo)).download();
      return conteudo;
    },
    async excluir(nomeArquivo) {
      await bucket.file(PREFIXO + path.basename(nomeArquivo)).delete({ ignoreNotFound: true });
    },
  };
}

export const storage: StorageDriver = process.env.STORAGE_BUCKET
  ? storageGcs(process.env.STORAGE_BUCKET)
  : storageLocal;
