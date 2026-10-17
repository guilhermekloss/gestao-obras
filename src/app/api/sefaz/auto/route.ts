import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { sincronizar } from "@/services/sefaz/sincronizar";

// Gatilho de quem está com o sistema aberto (components/captura-automatica.tsx): faz a captura andar sem agendador
// externo. A janela de 1 h da Sefaz, a trava por CNPJ e o limite de lotes ficam em sincronizar(), então chamar
// a mais só resulta em "pulada". O Cloud Scheduler (/api/sefaz/sincronizar) continua valendo para rodar à noite.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const usuario = await usuarioAtual();
  if (!usuario || (usuario.role !== "ADMIN" && usuario.role !== "ESCRITORIO")) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const r = await sincronizar({ origem: "AGENDADA" });
  const novos = r.ok ? r.resultados.reduce((a, x) => a + x.docsNovos, 0) : 0;
  return NextResponse.json({ ok: r.ok, novos }, { headers: { "Cache-Control": "no-store" } });
}
