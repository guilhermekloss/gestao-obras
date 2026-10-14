"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CondicaoTrabalho, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inputParaData } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import {
  CLIMAS,
  diffFotos,
  permissaoRdo,
  urlFotoValida,
  validarEfetivo,
  validarEquipamentos,
} from "@/services/rdo";

const climaSchema = z.enum(CLIMAS).optional();

const rdoSchema = z.object({
  obraId: z.string().min(1, "Selecione a obra"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data é obrigatória"),
  climaManha: climaSchema,
  climaTarde: climaSchema,
  condicao: z.enum(CondicaoTrabalho).optional(),
  // quantidades são validadas em detalhe por `validarEfetivo`/`validarEquipamentos`
  efetivo: z.array(z.object({ funcao: z.string(), qtd: z.number() })),
  equipamentos: z.array(z.object({ nome: z.string(), qtd: z.number() })),
  atividades: z.string().trim().min(1, "Descreva as atividades do dia"),
  ocorrencias: z.string().optional(),
  fotos: z.array(
    z.object({
      url: z.string().refine(urlFotoValida, "Foto com endereço inválido"),
      legenda: z.string().optional(),
    }),
  ),
});

export type RdoInput = z.infer<typeof rdoSchema>;

const MSG_DUPLICADO = "Já existe um RDO desta obra nesta data.";

/** Valida o input e devolve os campos prontos para o Prisma (exceto fotos e autor). */
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

/** Violação do @@unique([obraId, data]) — corrida entre a checagem e a gravação. */
function ehDuplicado(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

export const criarRdo = acaoDeEscrita(
  // qualquer papel autenticado (campo incluso)
  { revalidar: (input: RdoInput) => ["/diario", `/obras/${input.obraId}`] },
  async (user, input: RdoInput): Promise<ActionResult & { id?: string }> => {
    const p = prepararRdo(input);
    if (!p.ok) return p;

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
  },
  async (user, id: string, input: RdoInput): Promise<ActionResult> => {
    const rdo = await prisma.diarioObra.findUnique({
      where: { id },
      select: { id: true, obraId: true, autorId: true, createdAt: true, fotos: { select: { id: true, url: true } } },
    });
    if (!rdo) return { ok: false, erro: "RDO não encontrado" };

    const permissao = permissaoRdo(user, rdo);
    if (!permissao.ok) return permissao;

    const p = prepararRdo(input);
    if (!p.ok) return p;

    // mudar obra ou data não pode colidir com outro RDO da mesma obra+data
    const conflito = await prisma.diarioObra.findFirst({
      where: { obraId: p.dados.obraId, data: p.dados.data, id: { not: id } },
      select: { id: true },
    });
    if (conflito) return { ok: false, erro: MSG_DUPLICADO };

    const { removerIds, criar } = diffFotos(rdo.fotos, p.fotos);
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

    // o RDO mudou de obra: a página da obra antiga também lista o RDO
    if (rdo.obraId !== p.dados.obraId) revalidatePath(`/obras/${rdo.obraId}`);
    return { ok: true };
  },
);

/**
 * Exclui o RDO. Com `destino`, redireciona após excluir (usado na página de
 * detalhe, que deixa de existir) — por isso a revalidação é feita aqui dentro
 * e não pela opção `revalidar` do wrapper.
 */
export const excluirRdo = acaoDeEscrita(
  {},
  async (user, id: string, destino?: string): Promise<ActionResult> => {
    const rdo = await prisma.diarioObra.findUnique({
      where: { id },
      select: { obraId: true, autorId: true, createdAt: true },
    });
    if (!rdo) return { ok: false, erro: "RDO não encontrado" };

    const permissao = permissaoRdo(user, rdo);
    if (!permissao.ok) return permissao;

    await prisma.diarioObra.delete({ where: { id } });
    revalidatePath("/diario");
    revalidatePath(`/obras/${rdo.obraId}`);
    // só caminhos internos: evita usar a action como redirecionador aberto
    if (destino?.startsWith("/") && !destino.startsWith("//")) redirect(destino);
    return { ok: true };
  },
);
