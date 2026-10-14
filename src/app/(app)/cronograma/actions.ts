"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validarAvanco } from "@/services/obra";
import { diaParaBanco, validarDatasEtapa } from "@/services/cronograma";
import { inputParaData, percentEditavelParaBp } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";

const ROTAS = ["/cronograma", "/dashboard"];

/** Revalida também a página da obra (aba Cronograma e avanço no Resumo). */
function revalidarObra(obraId: string) {
  revalidatePath(`/obras/${obraId}`);
}

/** Salva as datas previstas de todas as etapas da obra de uma vez (campos inicio-<id> / fim-<id>). */
export const salvarDatasEtapas = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ROTAS },
  async (_user, obraId: string, formData: FormData): Promise<ActionResult> => {
    const etapas = await prisma.etapa.findMany({
      where: { obraId },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true },
    });

    const alteracoes: { id: string; inicio: string | null; fim: string | null }[] = [];
    for (const e of etapas) {
      const ini = formData.get(`inicio-${e.id}`);
      const fim = formData.get(`fim-${e.id}`);
      if (ini === null && fim === null) continue; // etapa fora do formulário
      const inicio = String(ini ?? "").trim() || null;
      const termino = String(fim ?? "").trim() || null;
      const valido = validarDatasEtapa(inicio, termino);
      if (!valido.ok) return { ok: false, erro: `${e.nome}: ${valido.erro}` };
      alteracoes.push({ id: e.id, inicio, fim: termino });
    }

    await prisma.$transaction(
      alteracoes.map((a) =>
        prisma.etapa.update({
          where: { id: a.id },
          data: {
            inicioPrevisto: a.inicio ? diaParaBanco(a.inicio) : null,
            fimPrevisto: a.fim ? diaParaBanco(a.fim) : null,
          },
        }),
      ),
    );
    revalidarObra(obraId);
    return { ok: true };
  },
);

const medicaoSchema = z.object({
  etapaId: z.string().min(1, "Selecione a etapa"),
  data: z.string().min(1, "Data é obrigatória"),
  percent: z.string().min(1, "Informe o percentual"),
  obs: z.string().optional(),
});

/** Lança o avanço físico acumulado de uma etapa — o campo pode lançar (qualquer papel). */
export const criarMedicao = acaoDeEscrita(
  { revalidar: ROTAS },
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

    const etapa = await prisma.etapa.findUnique({ where: { id: d.etapaId }, select: { obraId: true } });
    if (!etapa) return { ok: false, erro: "Etapa não encontrada" };

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
    revalidarObra(etapa.obraId);
    return { ok: true };
  },
);

export const excluirMedicao = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ROTAS },
  async (_user, id: string): Promise<ActionResult> => {
    const medicao = await prisma.medicao.delete({
      where: { id },
      select: { etapa: { select: { obraId: true } } },
    });
    revalidarObra(medicao.etapa.obraId);
    return { ok: true };
  },
);
