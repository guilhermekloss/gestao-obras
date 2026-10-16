import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { MAX_BYTES_ARQUIVO } from "@/services/arquivos";
import { guardarArquivo } from "@/services/arquivos-db";

// folga para o envelope multipart além do arquivo
const MAX_CORPO_BYTES = MAX_BYTES_ARQUIVO + 64 * 1024;

export async function POST(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  // recusa antes de ler o corpo, senão um envio enorme iria todo para a memória
  const tamanhoDeclarado = Number(req.headers.get("content-length"));
  if (!Number.isFinite(tamanhoDeclarado) || tamanhoDeclarado <= 0) {
    return NextResponse.json({ erro: "Envio sem tamanho declarado" }, { status: 411 });
  }
  if (tamanhoDeclarado > MAX_CORPO_BYTES) {
    return NextResponse.json({ erro: "Arquivo maior que 8MB" }, { status: 413 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ erro: "Arquivo ausente" }, { status: 400 });
  }
  if (file.size > MAX_BYTES_ARQUIVO) {
    return NextResponse.json({ erro: "Arquivo maior que 8MB" }, { status: 413 });
  }

  const guardado = await guardarArquivo(Buffer.from(await file.arrayBuffer()), usuario.id);
  if (!guardado.ok) {
    eventoSeguranca("upload_recusado", { usuarioId: usuario.id, tamanho: file.size, tipoDeclarado: file.type.slice(0, 80) });
    return NextResponse.json({ erro: "Formato não suportado — envie JPG, PNG, WEBP ou PDF" }, { status: 415 });
  }

  return NextResponse.json({ url: guardado.url });
}
