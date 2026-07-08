"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { ActionResult } from "../obras/actions";

const rdoSchema = z.object({
  obraId: z.string().min(1, "Selecione a obra"),
  data: z.string().min(1, "Data é obrigatória"),
  clima: z.string().optional(),
  efetivo: z.array(z.object({ funcao: z.string().min(1), qtd: z.number().int().min(1) })),
  atividades: z.string().min(1, "Descreva as atividades do dia"),
  ocorrencias: z.string().optional(),
  fotos: z.array(z.object({ url: z.string(), legenda: z.string().optional() })),
});

export type RdoInput = z.infer<typeof rdoSchema>;

export async function criarRdo(input: RdoInput): Promise<ActionResult> {
  const user = await exigirPapel(); // qualquer papel autenticado (campo incluso)

  const parsed = rdoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  const data = new Date(d.data + "T12:00:00");
  const existente = await prisma.diarioObra.findUnique({
    where: { obraId_data: { obraId: d.obraId, data } },
  });
  if (existente) {
    return { ok: false, erro: "Já existe um RDO desta obra nesta data." };
  }

  await prisma.diarioObra.create({
    data: {
      obraId: d.obraId,
      data,
      clima: d.clima || null,
      efetivo: d.efetivo.length > 0 ? d.efetivo : undefined,
      atividades: d.atividades,
      ocorrencias: d.ocorrencias || null,
      autorId: user.id,
      fotos: { create: d.fotos.map((f) => ({ url: f.url, legenda: f.legenda || null })) },
    },
  });

  revalidatePath("/diario");
  return { ok: true };
}

export async function excluirRdo(id: string): Promise<ActionResult> {
  const user = await exigirPapel();
  const rdo = await prisma.diarioObra.findUnique({ where: { id } });
  if (!rdo) return { ok: false, erro: "RDO não encontrado" };
  // campo só exclui o próprio RDO
  if (user.role === "CAMPO" && rdo.autorId !== user.id) {
    return { ok: false, erro: "Sem permissão para excluir este RDO" };
  }
  await prisma.diarioObra.delete({ where: { id } });
  revalidatePath("/diario");
  return { ok: true };
}
