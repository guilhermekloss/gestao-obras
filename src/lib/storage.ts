import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Driver de storage de fotos. Implementação local grava em ./uploads e serve
 * via /api/fotos. Para produção, trocar por R2/Supabase mantendo a interface.
 */
export interface StorageDriver {
  salvar(buffer: Buffer, extensao: string): Promise<string>; // retorna URL
  ler(nomeArquivo: string): Promise<Buffer>;
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export const storageLocal: StorageDriver = {
  async salvar(buffer, extensao) {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const nome = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extensao}`;
    await writeFile(path.join(UPLOADS_DIR, nome), buffer);
    return `/api/fotos/${nome}`;
  },
  async ler(nomeArquivo) {
    // impede path traversal
    const seguro = path.basename(nomeArquivo);
    return readFile(path.join(UPLOADS_DIR, seguro));
  },
};

export const storage = storageLocal;
