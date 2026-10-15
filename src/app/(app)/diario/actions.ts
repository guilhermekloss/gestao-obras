"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CondicaoTrabalho, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inputParaData } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { exigirAcessoObra } from "@/lib/auth";
import { anotarAtividade } from "@/lib/atividade";
import { formatarData } from "@/lib/format";
import { dataIso, id, texto } from "@/schemas/comum";
import { nomeDaUrlArquivo } from "@/services/arquivos";
import {
  CLIMAS,
  dataDoRdo,
  diffFotos,
  permissaoRdo,
  urlFotoValida,
  validarEfetivo,
  validarEquipamentos,
} from "@/services/rdo";

const climaSchema = z.enum(CLIMAS).optional();

const rdoSchema = z.object({
  obraId: id("Selecione a obra"),
  data: dataIso(),
  climaManha: climaSchema,
  climaTarde: climaSchema,
  condicao: z.enum(CondicaoTrabalho).optional(),
  efetivo: z.array(z.object({ funcao: z.string().max(100), qtd: z.number() })).max(100),
  equipamentos: z.array(z.object({ nome: z.string().max(100), qtd: z.number() })).max(100),
  atividades: texto(10_000, "O texto das atividades").trim().min(1, "Descreva as atividades do dia"),
  ocorrencias: texto(10_000, "O texto das ocorrências").optional(),
  fotos: z
    .array(
      z.object({
        url: z.string().refine(urlFotoValida, "Foto com endereço inválido"),
        legenda: texto(300, "A legenda").optional(),
      }),
    )
    .max(60, "No máximo 60 fotos por RDO"),
});

type RdoInput = z.infer<typeof rdoSchema>;

const MSG_DUPLICADO = "Já existe um RDO desta obra nesta data.";

function prepararRdo(input: RdoInput) {
  const parsed = rdoSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  const efetivo = validarEfetivo(d.efetivo);
  if (!efetivo.ok) return { ok: false as const, erro: efetivo.erro };
  const equipamentos = validarEquipamentos(d.equipamentos);
  if (!equipamentos.ok) return { ok: false as const, erro: equipamentos.erro };

  return {
    ok: true as const,
    fotos: d.fotos,
    dados: {
      obraId: d.obraId,
      data: inputParaData(d.data),
      climaManha: d.climaManha ?? null,
      climaTarde: d.climaTarde ?? null,
      condicao: d.condicao ?? null,
      efetivo: efetivo.itens.length > 0 ? efetivo.itens : Prisma.DbNull,
      equipamentos: equipamentos.itens.length > 0 ? equipamentos.itens : Prisma.DbNull,
      atividades: d.atividades,
      ocorrencias: d.ocorrencias?.trim() || null,
    },
  };
}

async function anotarRdo(verbo: string, rdo: { id: string; obraId: string; data: Date }) {
  const obra = await prisma.obra.findUnique({ where: { id: rdo.obraId }, select: { nome: true } });
  anotarAtividade({
    descricao: `${verbo} o RDO de ${formatarData(dataDoRdo(rdo.data))} — ${obra?.nome ?? "obra"}`,
    entidade: "rdo",
    entidadeId: rdo.id,
    obraIds: [rdo.obraId],
  });
}

// só fotos do próprio usuário: ligar ao RDO um arquivo alheio (ex.: anexo de lançamento)
// o exporia a quem vê o RDO (ver api/fotos)
async function fotosSaoDoUsuario(usuarioId: string, urls: string[]): Promise<boolean> {
  const nomes = [...new Set(urls.map((u) => nomeDaUrlArquivo(u)).filter((n) => n !== null))];
  if (nomes.length === 0) return true;
  const proprios = await prisma.arquivo.count({ where: { nome: { in: nomes }, enviadoPorId: usuarioId } });
  return proprios === nomes.length;
}

const MSG_FOTO_ALHEIA = "Foto inválida: envie as fotos de novo por este formulário.";

// @@unique([obraId, data]): corrida entre a checagem e a gravação
function ehDuplicado(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

export const criarRdo = acaoDeEscrita(
  // qualquer papel autenticado (campo incluso)
  { revalidar: (input: RdoInput) => ["/diario", `/obras/${input.obraId}`], atividade: "rdo.criar" },
  async (user, input: RdoInput): Promise<ActionResult & { id?: string }> => {
    const p = prepararRdo(input);
    if (!p.ok) return p;
    exigirAcessoObra(user, p.dados.obraId);
    if (!(await fotosSaoDoUsuario(user.id, p.fotos.map((f) => f.url)))) return { ok: false, erro: MSG_FOTO_ALHEIA };

    const existente = await prisma.diarioObra.findUnique({
      where: { obraId_data: { obraId: p.dados.obraId, data: p.dados.data } },
      select: { id: true },
    });
    if (existente) return { ok: false, erro: MSG_DUPLICADO };

    try {
      const rdo = await prisma.diarioObra.create({
        data: {
          ...p.dados,
          autorId: user.id,
          fotos: { create: p.fotos.map((f) => ({ url: f.url, legenda: f.legenda?.trim() || null })) },
        },
        select: { id: true },
      });
      await anotarRdo("Registrou", { id: rdo.id, obraId: p.dados.obraId, data: p.dados.data });
      return { ok: true, id: rdo.id };
    } catch (erro) {
      if (ehDuplicado(erro)) return { ok: false, erro: MSG_DUPLICADO };
      throw erro;
    }
  },
);

export const atualizarRdo = acaoDeEscrita(
  {
    revalidar: (id: string, input: RdoInput) => [
      "/diario",
      `/diario/${id}`,
      `/obras/${input.obraId}`,
    ],
    atividade: "rdo.editar",
  },
  async (user, id: string, input: RdoInput): Promise<ActionResult> => {
    const rdo = await prisma.diarioObra.findUnique({
      where: { id },
      select: { id: true, obraId: true, autorId: true, createdAt: true, fotos: { select: { id: true, url: true } } },
    });
    if (!rdo) return { ok: false, erro: "RDO não encontrado" };
    exigirAcessoObra(user, rdo.obraId, "RDO não encontrado");

    const permissao = permissaoRdo(user, rdo);
    if (!permissao.ok) return permissao;

    const p = prepararRdo(input);
    if (!p.ok) return p;
    exigirAcessoObra(user, p.dados.obraId);

    const conflito = await prisma.diarioObra.findFirst({
      where: { obraId: p.dados.obraId, data: p.dados.data, id: { not: id } },
      select: { id: true },
    });
    if (conflito) return { ok: false, erro: MSG_DUPLICADO };

    const { removerIds, criar } = diffFotos(rdo.fotos, p.fotos);
    if (!(await fotosSaoDoUsuario(user.id, criar.map((f) => f.url)))) return { ok: false, erro: MSG_FOTO_ALHEIA };
    try {
      await prisma.diarioObra.update({
        where: { id },
        data: {
          ...p.dados,
          fotos: {
            deleteMany: removerIds.length > 0 ? { id: { in: removerIds } } : undefined,
            create: criar,
          },
        },
      });
    } catch (erro) {
      if (ehDuplicado(erro)) return { ok: false, erro: MSG_DUPLICADO };
      throw erro;
    }

    await anotarRdo("Editou", { id, obraId: p.dados.obraId, data: p.dados.data });
    if (rdo.obraId !== p.dados.obraId) revalidatePath(`/obras/${rdo.obraId}`);
    return { ok: true };
  },
);

// revalida aqui, não pelo `revalidar` do wrapper: com `destino`, redireciona após excluir
export const excluirRdo = acaoDeEscrita(
  { atividade: "rdo.excluir" },
  async (user, id: string, destino?: string): Promise<ActionResult> => {
    const rdo = await prisma.diarioObra.findUnique({
      where: { id },
      select: { obraId: true, data: true, autorId: true, createdAt: true },
    });
    if (!rdo) return { ok: false, erro: "RDO não encontrado" };
    exigirAcessoObra(user, rdo.obraId, "RDO não encontrado");

    const permissao = permissaoRdo(user, rdo);
    if (!permissao.ok) return permissao;

    await prisma.diarioObra.delete({ where: { id } });
    await anotarRdo("Excluiu", { id, obraId: rdo.obraId, data: rdo.data });
    revalidatePath("/diario");
    revalidatePath(`/obras/${rdo.obraId}`);
    // só páginas do diário: evita usar a action como redirecionador aberto (`//host`, `/\\host`)
    if (destino && /^\/diario(\/[\w-]*)*(\?[\w=&-]*)?$/.test(destino)) redirect(destino);
    return { ok: true };
  },
);
