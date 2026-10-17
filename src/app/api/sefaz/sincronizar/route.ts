import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { sincronizar } from "@/services/sefaz/sincronizar";

// Chamado pelo Cloud Scheduler a cada 20 min com token OIDC da service account do agendador.
// O /api fica fora do proxy.ts e o Cloud Run é público: a autenticação é toda aqui.
// As regras da Sefaz (janela de 1 h, bloqueio) são aplicadas em sincronizar(): chamar a mais só dá PULADA.

export const dynamic = "force-dynamic";
// pior caso: 8 lotes × 25 s + Ciência; o Cloud Run corta em 300 s
export const maxDuration = 300;

const oauth = new OAuth2Client();

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function autorizado(req: Request): Promise<boolean> {
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;

  // só fora de produção: para disparar à mão em desenvolvimento/homologação
  const tokenTeste = process.env.SEFAZ_TOKEN_TESTE;
  if (process.env.NODE_ENV !== "production" && tokenTeste && iguais(token, tokenTeste)) return true;

  const email = process.env.SEFAZ_AGENDADOR_EMAIL;
  const audiencia = process.env.APP_URL ? `${process.env.APP_URL}/api/sefaz/sincronizar` : undefined;
  if (!email || !audiencia) return false;
  try {
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: audiencia });
    const payload = ticket.getPayload();
    return payload?.email === email && payload.email_verified === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!(await autorizado(req))) {
    eventoSeguranca("sefaz_gatilho_recusado", {});
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const r = await sincronizar({ origem: "AGENDADA" });
  // 200 mesmo com a captura desligada ou a Sefaz fora: o agendador não tem o que refazer, e o painel mostra o erro
  return NextResponse.json(
    r.ok ? { ok: true, resultados: r.resultados.map(({ cnpj, status, docsNovos, ciencias }) => ({ cnpj, status, docsNovos, ciencias })) } : r,
    { headers: { "Cache-Control": "no-store" } },
  );
}
