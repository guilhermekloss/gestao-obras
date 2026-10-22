import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { politicaDeConteudo } from "@/lib/csp";
import { ipDosCabecalhos, ipForaDoSite, ipVigiado, registrarInfracao } from "@/lib/protecao";
import { caminhoDeVarredura } from "@/services/protecao-ativa";

const { auth } = NextAuth(authConfig);

const PAGINA_BLOQUEADA = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Acesso bloqueado</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>Acesso bloqueado temporariamente</h1>
<p>Muitas requisições suspeitas saíram desta rede, e o acesso foi suspenso por um tempo.</p>
<p>Se você usa o sistema, avise o administrador: ele pode liberar em Usuários → Bloqueios.</p></body></html>`;

// Varredura e reincidência (Fail2ban): o IP barrado sai do site inteiro. Banco fora do ar não derruba o site.
async function barreira(cabecalhos: Headers, caminho: string): Promise<Response | null> {
  const ip = ipVigiado(ipDosCabecalhos(cabecalhos));
  if (!ip) return null;
  try {
    if (await ipForaDoSite(ip)) {
      return new NextResponse(PAGINA_BLOQUEADA, {
        status: 403,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (caminhoDeVarredura(caminho)) {
      await registrarInfracao("varredura", ip);
      return new NextResponse(null, { status: 404 });
    }
  } catch (erro) {
    console.error("Falha ao conferir bloqueio do IP", erro);
  }
  return null;
}

// Não é a barreira de autorização: páginas e server actions conferem o usuário no banco.
export default auth(async (request) => {
  const barrado = await barreira(request.headers, request.nextUrl.pathname);
  if (barrado) return barrado;
  // /api/auth (login direto do Auth.js) passa só pela barreira, sem CSP
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

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
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // O resto do /api fica fora: o proxy guarda o corpo da requisição na memória, e o upload recusa pelo tamanho antes de ler.
    // As rotas de /api exigem sessão ou têm regra própria (Sefaz); o login direto do Auth.js precisa da barreira.
    "/api/auth/:path*",
  ],
};
