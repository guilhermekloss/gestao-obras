// Envio de arquivo pelo navegador (POST /api/upload): 8 MB em rede móvel ruim cabem folgados em 60 s;
// sem prazo, uma conexão travada deixa o botão em "enviando" para sempre.
export const PRAZO_ENVIO_MS = 60_000;

export const MSG_ENVIO_DEMOROU = "O envio demorou demais — verifique a conexão e tente de novo.";

export function enviarArquivo(arquivo: Blob): Promise<Response> {
  const fd = new FormData();
  fd.append("file", arquivo);
  return fetch("/api/upload", { method: "POST", body: fd, signal: AbortSignal.timeout(PRAZO_ENVIO_MS) });
}

export function estourouPrazo(erro: unknown): boolean {
  return erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
}
