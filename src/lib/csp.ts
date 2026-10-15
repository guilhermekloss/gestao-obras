/**
 * Content-Security-Policy das páginas (aplicada pelo `proxy.ts`).
 *
 * - Scripts: só os que levam o nonce da requisição (`strict-dynamic` estende a
 *   confiança aos chunks que eles carregam). Em dev o React precisa de `eval`.
 * - Estilos: `unsafe-inline` porque gráficos, Gantt e toasts usam `style=`; CSS
 *   não executa código, e o risco residual (exfiltração por seletor) é baixo.
 * - Imagens/frames: o próprio app (`/api/fotos`) e `blob:`/`data:` das prévias de foto.
 * - Nada de plugins, `<base>` trocado, formulário para outro site ou o app
 *   dentro de iframe de outra origem (clickjacking).
 */
export function politicaDeConteudo(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}
