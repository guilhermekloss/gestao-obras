/**
 * Utilitários compartilhados entre o gerador do corpus e o avaliador.
 */
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MidiaDocumento } from "@/services/leitor-nativo/tipos";

/** "Hoje" fixo das avaliações: as datas do corpus são todas anteriores ou iguais. */
export const HOJE = "2026-10-15";

const RAIZ_REPO = path.resolve(import.meta.dirname, "..", "..");
export const DIR_FIXTURES = path.join(RAIZ_REPO, "src", "services", "leitor-nativo", "__fixtures__");
export const DIR_SAIDA_PADRAO = path.join(os.tmpdir(), "leitor-nativo-corpus");

export function midiaDoArquivo(arquivo: string): MidiaDocumento | null {
  const ext = path.extname(arquivo).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return null;
}

/** pdf = PDF digital; foto = JPEG fotografado; imagem = PNG/WebP limpo (render direto). */
export type Origem = "pdf" | "foto" | "imagem";

export function origemDoArquivo(arquivo: string): Origem {
  const m = midiaDoArquivo(arquivo);
  return m === "application/pdf" ? "pdf" : m === "image/jpeg" ? "foto" : "imagem";
}

type EntradaCorpus = { id: string; esperado: string; arquivos: string[] };

/**
 * Para cada `<id>.esperado.json` do diretório, os arquivos `<id>.<variante>.<ext>`
 * ou `<id>.<ext>` com mídia suportada.
 */
export function listarCorpus(dir: string): EntradaCorpus[] {
  if (!existsSync(dir)) throw new Error(`diretório não encontrado: ${dir}`);
  const nomes = readdirSync(dir).sort();
  return nomes
    .filter((n) => n.endsWith(".esperado.json"))
    .map((n) => {
      const id = n.slice(0, -".esperado.json".length);
      const arquivos = nomes
        .filter((a) => a.startsWith(`${id}.`) && midiaDoArquivo(a) !== null)
        .map((a) => path.join(dir, a));
      return { id, esperado: path.join(dir, n), arquivos };
    });
}

export function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function temFlag(nome: string): boolean {
  return process.argv.includes(nome);
}

export function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
