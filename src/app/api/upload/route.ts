import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { MAX_BYTES_ARQUIVO, tipoPeloConteudo } from "@/services/arquivos";

/** Folga para o envelope multipart (cabeçalhos e boundary) além do arquivo. */
const MAX_CORPO_BYTES = MAX_BYTES_ARQUIVO + 64 * 1024;

export async function POST(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  // recusa antes de ler o corpo: sem isso, um envio enorme seria todo carregado na memória
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

  // o tipo vem do conteúdo, não do nome: o arquivo é gravado e servido com a extensão real
  const buffer = Buffer.from(await file.arrayBuffer());
  const extensao = tipoPeloConteudo(buffer);
  if (!extensao) {
    eventoSeguranca("upload_recusado", { usuarioId: usuario.id, tamanho: file.size, tipoDeclarado: file.type.slice(0, 80) });
    return NextResponse.json({ erro: "Formato não suportado — envie JPG, PNG, WEBP ou PDF" }, { status: 415 });
  }

  const url = await storage.salvar(buffer, extensao);
  await prisma.arquivo.create({
    data: { nome: url.slice(url.lastIndexOf("/") + 1), enviadoPorId: usuario.id, tamanhoBytes: buffer.length },
  });
  return NextResponse.json({ url });
}
