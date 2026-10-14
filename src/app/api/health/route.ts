import { NextResponse } from "next/server";

/** Probe de saúde do Cloud Run e smoke test do deploy. Público e sem acesso ao banco. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
