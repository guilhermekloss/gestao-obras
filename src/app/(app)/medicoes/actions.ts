"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validarAvanco } from "@/services/obra";
import { inputParaData, percentEditavelParaBp } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";

const medicaoSchema = z.object({
  etapaId: z.string().min(1, "Selecione a etapa"),
  data: z.string().min(1, "Data é obrigatória"),
  percent: z.string().min(1, "Informe o percentual"),
  obs: z.string().optional(),
});

export const criarMedicao = acaoDeEscrita(
  { revalidar: ["/medicoes"] }, // campo pode medir — qualquer papel autenticado
  async (user, formData: FormData): Promise<ActionResult> => {
    const parsed = medicaoSchema.safeParse({
      etapaId: formData.get("etapaId"),
      data: formData.get("data"),
      percent: formData.get("percent"),
      obs: (formData.get("obs") as string) || undefined,
    });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const percentBp = percentEditavelParaBp(d.percent);
    if (percentBp === null) return { ok: false, erro: "Percentual inválido" };

    const ultima = await prisma.medicao.findFirst({
      where: { etapaId: d.etapaId },
      orderBy: [{ data: "desc" }, { id: "desc" }],
    });
    const valido = validarAvanco(percentBp, ultima?.percentBp ?? 0);
    if (!valido.ok) return { ok: false, erro: valido.erro };

    await prisma.medicao.create({
      data: {
        etapaId: d.etapaId,
        data: inputParaData(d.data),
        percentBp,
        obs: d.obs || null,
        autorId: user.id,
      },
    });
    return { ok: true };
  },
);

export const excluirMedicao = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/medicoes"] },
  async (_user, id: string): Promise<ActionResult> => {
    await prisma.medicao.delete({ where: { id } });
    return { ok: true };
  },
);
