"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { ActionResult } from "../obras/actions";

export async function pagarParcelas(ids: string[]): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  if (ids.length === 0) return { ok: false, erro: "Nenhuma parcela selecionada" };

  await prisma.parcela.updateMany({
    where: { id: { in: ids }, status: "ABERTA" },
    data: { status: "PAGA", pagaEm: new Date() },
  });
  revalidatePath("/contas");
  revalidatePath("/notas");
  return { ok: true };
}

export async function reabrirParcela(id: string): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  await prisma.parcela.update({
    where: { id },
    data: { status: "ABERTA", pagaEm: null },
  });
  revalidatePath("/contas");
  revalidatePath("/notas");
  return { ok: true };
}
