/**
 * Localiza arquivos de dados dentro de `node_modules` (o .wasm do zxing e o
 * `por.traineddata.gz` do Tesseract), para ler do disco e nunca baixar de CDN.
 *
 * Precisa funcionar em dois cenários:
 * - vitest / `next dev`: `process.cwd()` é a raiz do projeto;
 * - `output: "standalone"` no Cloud Run: o `server.js` faz `chdir` para a
 *   pasta dele (`/app`), onde fica o `node_modules` copiado pelo tracing
 *   (os arquivos entram via `outputFileTracingIncludes` no next.config.ts).
 *
 * Não usa `require.resolve` com literal porque o bundler do Next tentaria
 * resolver/embutir o arquivo; aqui o caminho é montado em tempo de execução.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const cache = new Map<string, string>();

function subindoAte(inicio: string, relativo: string): string | null {
  let dir = inicio;
  for (;;) {
    const candidato = path.join(dir, "node_modules", relativo);
    if (fs.existsSync(candidato)) return candidato;
    const pai = path.dirname(dir);
    if (pai === dir) return null;
    dir = pai;
  }
}

/**
 * Caminho absoluto de `node_modules/<pacote>/<arquivo>`. Lança erro (para log)
 * se não achar — quem chama converte numa mensagem amigável.
 */
export function arquivoDoPacote(pacote: string, arquivo: string): string {
  const chave = `${pacote}/${arquivo}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  let achado = subindoAte(process.cwd(), chave);
  if (!achado) {
    // Plano B: a resolução do Node a partir do cwd (ex.: node_modules num nível acima, com links)
    try {
      const req = createRequire(path.join(process.cwd(), "noop.js"));
      const principal = req.resolve(pacote);
      const marcador = `${path.sep}node_modules${path.sep}${pacote.split("/").join(path.sep)}${path.sep}`;
      const i = principal.lastIndexOf(marcador);
      if (i >= 0) {
        const candidato = path.join(principal.slice(0, i + marcador.length), arquivo);
        if (fs.existsSync(candidato)) achado = candidato;
      }
    } catch {
      // segue para o erro abaixo
    }
  }
  if (!achado) throw new Error(`Arquivo ${chave} não encontrado em node_modules (cwd ${process.cwd()})`);
  cache.set(chave, achado);
  return achado;
}
