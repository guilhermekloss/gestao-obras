"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { obraSchema, etapaSchema, ETAPAS_PADRAO } from "@/schemas/obra";

export type ActionResult = { ok: boolean; erro?: string };

function parseObra(formData: FormData) {
  return obraSchema.safeParse({
    nome: formData.get("nome"),
    codigo: formData.get("codigo"),
    cno: (formData.get("cno") as string) || undefined,
    endereco: (formData.get("endereco") as string) || undefined,
    status: formData.get("status"),
    inicioEm: (formData.get("inicioEm") as string) || undefined,
    criarEtapasPadrao: formData.get("criarEtapasPadrao") === "on",
  });
}

export async function criarObra(formData: FormData): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const parsed = parseObra(formData);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  const existente = await prisma.obra.findUnique({ where: { codigo: d.codigo } });
  if (existente) return { ok: false, erro: `Já existe uma obra com o código "${d.codigo}"` };

  await prisma.obra.create({
    data: {
      nome: d.nome,
      codigo: d.codigo,
      cno: d.cno,
      endereco: d.endereco,
      status: d.status,
      inicioEm: d.inicioEm ? new Date(d.inicioEm) : undefined,
      etapas: d.criarEtapasPadrao
        ? { create: ETAPAS_PADRAO.map((nome, i) => ({ nome, ordem: i + 1 })) }
        : undefined,
    },
  });
  revalidatePath("/obras");
  return { ok: true };
}

export async function atualizarObra(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const parsed = parseObra(formData);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  const duplicada = await prisma.obra.findFirst({
    where: { codigo: d.codigo, NOT: { id } },
  });
  if (duplicada) return { ok: false, erro: `Já existe uma obra com o código "${d.codigo}"` };

  await prisma.obra.update({
    where: { id },
    data: {
      nome: d.nome,
      codigo: d.codigo,
      cno: d.cno ?? null,
      endereco: d.endereco ?? null,
      status: d.status,
      inicioEm: d.inicioEm ? new Date(d.inicioEm) : null,
    },
  });
  revalidatePath("/obras");
  revalidatePath(`/obras/${id}`);
  return { ok: true };
}

export async function excluirObra(id: string): Promise<ActionResult> {
  await exigirPapel("ADMIN");
  const usos = await prisma.rateioItem.count({ where: { obraId: id } });
  if (usos > 0) {
    return {
      ok: false,
      erro: "Obra possui notas fiscais rateadas — não pode ser excluída. Mude o status para Concluída ou Pausada.",
    };
  }
  await prisma.obra.delete({ where: { id } });
  revalidatePath("/obras");
  redirect("/obras");
}

export async function criarEtapa(
  obraId: string,
  formData: FormData,
): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const parsed = etapaSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

  const ultima = await prisma.etapa.findFirst({
    where: { obraId },
    orderBy: { ordem: "desc" },
  });
  await prisma.etapa.create({
    data: { obraId, nome: parsed.data.nome, ordem: (ultima?.ordem ?? 0) + 1 },
  });
  revalidatePath(`/obras/${obraId}`);
  return { ok: true };
}

export async function excluirEtapa(id: string): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const etapa = await prisma.etapa.findUnique({
    where: { id },
    include: { _count: { select: { medicoes: true, rateios: true } } },
  });
  if (!etapa) return { ok: false, erro: "Etapa não encontrada" };
  if (etapa._count.medicoes > 0 || etapa._count.rateios > 0) {
    return { ok: false, erro: "Etapa possui medições ou custos vinculados — não pode ser excluída." };
  }
  await prisma.etapa.delete({ where: { id } });
  revalidatePath(`/obras/${etapa.obraId}`);
  return { ok: true };
}
