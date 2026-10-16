import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Role } from "@prisma/client";
import type { RestricaoObras } from "./acesso";
import { veFinanceiro } from "./acesso";
import { nomeDaUrlArquivo, tipoPeloConteudo, urlDoArquivo } from "./arquivos";

// Ciclo de vida do arquivo enviado: guardar (conteúdo + metadados), quem pode ver, de quem é e o descarte do que ficou sem uso.

type Usuario = { id: string; role: Role; obrasPermitidas: RestricaoObras };

// Tipo pelo conteúdo. Se o registro não for gravado, o arquivo sai do storage: nada fica órfão.
export async function guardarArquivo(
  buffer: Buffer,
  usuarioId: string,
): Promise<{ ok: true; url: string } | { ok: false; motivo: "formato" }> {
  const extensao = tipoPeloConteudo(buffer);
  if (!extensao) return { ok: false, motivo: "formato" };

  const url = await storage.salvar(buffer, extensao);
  const nome = nomeDaUrlArquivo(url);
  try {
    if (!nome) throw new Error("O storage devolveu um endereço fora do padrão");
    await prisma.arquivo.create({ data: { nome, enviadoPorId: usuarioId, tamanhoBytes: buffer.length } });
  } catch (erro) {
    if (nome) await storage.excluir(nome).catch(() => undefined);
    throw erro;
  }
  return { ok: true, url };
}

// ADMIN/ESCRITORIO: tudo. CAMPO: o que enviou e fotos de RDO das suas obras, nunca anexos de lançamentos (valores).
export async function usuarioPodeVerArquivo(usuario: Usuario, nome: string): Promise<boolean> {
  if (veFinanceiro(usuario.role)) return true;

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

// Ligar a um RDO um arquivo alheio (ex.: anexo de lançamento) o exporia a quem vê o RDO.
export async function arquivosSaoDoUsuario(usuarioId: string, urls: string[]): Promise<boolean> {
  const nomes = [...new Set(urls.map((u) => nomeDaUrlArquivo(u)).filter((n): n is string => n !== null))];
  if (nomes.length === 0) return true;
  const proprios = await prisma.arquivo.count({ where: { nome: { in: nomes }, enviadoPorId: usuarioId } });
  return proprios === nomes.length;
}

// Apaga do storage o que nenhuma foto de RDO nem anexo de lançamento usa mais. Falha aqui não desfaz a operação
// de quem chamou: sobra um arquivo, nunca um registro quebrado.
export async function descartarArquivosSemUso(urls: string[]): Promise<void> {
  const porNome = new Map(urls.map((u) => [nomeDaUrlArquivo(u), u] as const));
  porNome.delete(null);
  if (porNome.size === 0) return;
  const candidatas = [...porNome.values()];

  const [fotos, anexos] = await Promise.all([
    prisma.foto.findMany({ where: { url: { in: candidatas } }, select: { url: true } }),
    prisma.notaFiscal.findMany({ where: { anexoUrl: { in: candidatas } }, select: { anexoUrl: true } }),
  ]);
  const emUso = new Set([...fotos.map((f) => f.url), ...anexos.map((a) => a.anexoUrl)]);

  for (const [nome, url] of porNome) {
    if (!nome || emUso.has(url)) continue;
    try {
      await storage.excluir(nome);
      await prisma.arquivo.deleteMany({ where: { nome } });
    } catch (erro) {
      console.error(`Falha ao descartar o arquivo ${nome}`, erro);
    }
  }
}
