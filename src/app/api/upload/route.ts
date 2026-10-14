import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { storage } from "@/lib/storage";

const EXTENSOES = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await usuarioAtual())) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ erro: "Arquivo ausente" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ erro: "Arquivo maior que 8MB" }, { status: 413 });
  }
  const extensao = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  if (!EXTENSOES.has(extensao)) {
    return NextResponse.json({ erro: "Formato não suportado — envie JPG, PNG, WEBP ou PDF" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await storage.salvar(buffer, extensao === "jpeg" ? "jpg" : extensao);
  return NextResponse.json({ url });
}
