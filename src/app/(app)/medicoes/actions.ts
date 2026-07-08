"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { validarAvanco } from "@/services/obra";
import type { ActionResult } from "../obras/actions";

const medicaoSchema = z.object({
  etapaId: z.string().min(1, "Selecione a etapa"),
  data: z.string().min(1, "Data é obrigatória"),
  percent: z.string().min(1, "Informe o percentual"),
  obs: z.string().optional(),
});

export async function criarMedicao(formData: FormData): Promise<ActionResult> {
  const user = await exigirPapel(); // campo pode medir

  const parsed = medicaoSchema.safeParse({
    etapaId: formData.get("etapaId"),
    data: formData.get("data"),
    percent: formData.get("percent"),
    obs: (formData.get("obs") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  const percentBp = Math.round(parseFloat(d.percent.replace(",", ".")) * 100);
  if (Number.isNaN(percentBp)) return { ok: false, erro: "Percentual inválido" };

  const ultima = await prisma.medicao.findFirst({
    where: { etapaId: d.etapaId },
    orderBy: [{ data: "desc" }, { id: "desc" }],
  });
  const valido = validarAvanco(percentBp, ultima?.percentBp ?? 0);
  if (!valido.ok) return { ok: false, erro: valido.erro };

  await prisma.medicao.create({
    data: {
      etapaId: d.etapaId,
      data: new Date(d.data + "T12:00:00"),
      percentBp,
      obs: d.obs || null,
      autorId: user.id,
    },
  });

  revalidatePath("/medicoes");
  return { ok: true };
}

export async function excluirMedicao(id: string): Promise<ActionResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  await prisma.medicao.delete({ where: { id } });
  revalidatePath("/medicoes");
  return { ok: true };
}
