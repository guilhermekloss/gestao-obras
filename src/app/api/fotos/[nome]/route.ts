import { NextResponse } from "next/server";
import { usuarioAtual, type UsuarioAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { TIPO_MIME, extensaoDoNome, urlDoArquivo } from "@/services/arquivos";

/**
 * Quem pode abrir o arquivo:
 * - ADMIN e ESCRITORIO: todos (veem todas as obras e os lançamentos).
 * - CAMPO: o que ele mesmo enviou e as fotos de RDO das obras liberadas para
 *   ele — nunca anexos de lançamentos (valores financeiros) nem fotos de outras obras.
 */
async function podeVer(usuario: UsuarioAtual, nome: string): Promise<boolean> {
  if (usuario.role !== "CAMPO") return true;

  const enviado = await prisma.arquivo.findUnique({ where: { nome }, select: { enviadoPorId: true } });
  if (enviado?.enviadoPorId === usuario.id) return true;

  const foto = await prisma.foto.findFirst({
    where: {
      url: urlDoArquivo(nome),
      ...(usuario.obrasPermitidas === null ? {} : { diario: { obraId: { in: usuario.obrasPermitidas } } }),
    },
    select: { id: true },
  });
  return foto !== null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ nome: string }> },
) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse(null, { status: 401 });

  const { nome } = await params;
  const extensao = extensaoDoNome(nome);
  if (!extensao) return new NextResponse(null, { status: 404 });

  // sem acesso = 404, como arquivo inexistente: não revela que o arquivo existe
  if (!(await podeVer(usuario, nome))) {
    eventoSeguranca("acesso_negado_arquivo", { usuarioId: usuario.id, arquivo: nome });
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buffer = await storage.ler(nome);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": TIPO_MIME[extensao],
        "Content-Disposition": `inline; filename="${nome}"`,
        // cache só no navegador do próprio usuário e por pouco tempo: acesso retirado deixa de valer logo
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
