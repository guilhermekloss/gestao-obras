"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { obraSchema, etapaSchema, ETAPAS_PADRAO } from "@/schemas/obra";

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

export const criarObra = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/obras"] },
  async (_user, formData: FormData): Promise<ActionResult> => {
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
    return { ok: true };
  },
);

export const atualizarObra = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: (id: string, _formData: FormData) => ["/obras", `/obras/${id}`] },
  async (_user, id: string, formData: FormData): Promise<ActionResult> => {
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
    return { ok: true };
  },
);

/** A única action que redireciona no sucesso — revalida/redireciona ela mesma. */
export async function excluirObra(id: string): Promise<ActionResult> {
  await exigirPapel("ADMIN");
  const usos = await prisma.rateioNota.count({ where: { obraId: id } });
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

export const criarEtapa = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: (obraId: string, _formData: FormData) => [`/obras/${obraId}`] },
  async (_user, obraId: string, formData: FormData): Promise<ActionResult> => {
    const parsed = etapaSchema.safeParse({ nome: formData.get("nome") });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const ultima = await prisma.etapa.findFirst({
      where: { obraId },
      orderBy: { ordem: "desc" },
    });
    await prisma.etapa.create({
      data: { obraId, nome: parsed.data.nome, ordem: (ultima?.ordem ?? 0) + 1 },
    });
    return { ok: true };
  },
);

export const excluirEtapa = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"] },
  async (_user, id: string): Promise<ActionResult> => {
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
  },
);
