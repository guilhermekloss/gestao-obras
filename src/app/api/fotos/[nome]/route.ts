import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { storage } from "@/lib/storage";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ nome: string }> },
) {
  if (!(await usuarioAtual())) return new NextResponse(null, { status: 401 });

  const { nome } = await params;
  try {
    const buffer = await storage.ler(nome);
    const ext = nome.split(".").pop() ?? "jpg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
