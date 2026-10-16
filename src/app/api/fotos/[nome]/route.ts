import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { TIPO_MIME, extensaoDoNome } from "@/services/arquivos";
import { usuarioPodeVerArquivo } from "@/services/arquivos-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ nome: string }> },
) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse(null, { status: 401 });

  const { nome } = await params;
  const extensao = extensaoDoNome(nome);
  if (!extensao) return new NextResponse(null, { status: 404 });

  // sem acesso = 404: não revela que o arquivo existe
  if (!(await usuarioPodeVerArquivo(usuario, nome))) {
    eventoSeguranca("acesso_negado_arquivo", { usuarioId: usuario.id, arquivo: nome });
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buffer = await storage.ler(nome);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": TIPO_MIME[extensao],
        "Content-Disposition": `inline; filename="${nome}"`,
        // cache privado e curto: acesso retirado deixa de valer logo
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
