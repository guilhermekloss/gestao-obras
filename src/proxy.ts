import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { politicaDeConteudo } from "@/lib/csp";

const { auth } = NextAuth(authConfig);

/**
 * Roda antes de cada página:
 * - Content-Security-Policy com nonce novo por requisição: só executam os
 *   scripts que o próprio Next marcou com o nonce (bloqueia XSS por injeção).
 * - Renova o cookie da sessão (expiração por ociosidade em `auth.config.ts`).
 *
 * Não é a barreira de autorização: layouts, páginas e cada server action
 * conferem o usuário no banco (`usuarioAtual`/`exigirPapel`).
 */
export default auth((request) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaDeConteudo(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  matcher: [
    {
      // páginas e server actions; fora: API (tem autenticação própria), estáticos e prefetch
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
