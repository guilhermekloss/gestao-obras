// Caminho montado em tempo de execução: com `require.resolve` literal o bundler do Next embutiria o arquivo.
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

export function arquivoDoPacote(pacote: string, arquivo: string): string {
  const chave = `${pacote}/${arquivo}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  let achado = subindoAte(process.cwd(), chave);
  if (!achado) {
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
    }
  }
  if (!achado) throw new Error(`Arquivo ${chave} não encontrado em node_modules (cwd ${process.cwd()})`);
  cache.set(chave, achado);
  return achado;
}
