"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validarAvancoNaSerie } from "@/services/obra";
import { diaParaBanco, validarDatasEtapa } from "@/services/cronograma";
import { formatarPercentBp, inputParaData, percentEditavelParaBp } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { exigirAcessoObra } from "@/lib/auth";
import { anotarAtividade } from "@/lib/atividade";
import { dataIso, id, texto } from "@/schemas/comum";

const ROTAS = ["/cronograma", "/dashboard"];

function revalidarObra(obraId: string) {
  revalidatePath(`/obras/${obraId}`);
}

export const salvarDatasEtapas = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    obra: (obraId: string, _formData: FormData) => obraId,
    revalidar: ROTAS,
    atividade: "cronograma.datas",
  },
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
    anotarAtividade({
      descricao: `Alterou as datas previstas de ${alteracoes.length} etapa${alteracoes.length === 1 ? "" : "s"}`,
      entidade: "obra",
      entidadeId: obraId,
      obraIds: [obraId],
    });
    revalidarObra(obraId);
    return { ok: true };
  },
);

const medicaoSchema = z.object({
  etapaId: id("Selecione a etapa"),
  data: dataIso(),
  percent: z.string().min(1, "Informe o percentual").max(20),
  obs: texto(1000, "A observação").optional(),
});

// qualquer papel: o campo pode lançar
export const criarMedicao = acaoDeEscrita(
  { revalidar: ROTAS, atividade: "medicao.criar" },
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

    const etapa = await prisma.etapa.findUnique({
      where: { id: d.etapaId },
      select: { obraId: true, nome: true, obra: { select: { nome: true } } },
    });
    if (!etapa) return { ok: false, erro: "Etapa não encontrada" };
    exigirAcessoObra(user, etapa.obraId, "Etapa não encontrada");

    const existentes = await prisma.medicao.findMany({
      where: { etapaId: d.etapaId },
      select: { id: true, data: true, percentBp: true },
    });
    const valido = validarAvancoNaSerie({ data: d.data, percentBp }, existentes);
    if (!valido.ok) return { ok: false, erro: valido.erro };

    const medicao = await prisma.medicao.create({
      data: {
        etapaId: d.etapaId,
        data: inputParaData(d.data),
        percentBp,
        obs: d.obs || null,
        autorId: user.id,
      },
      select: { id: true },
    });
    anotarAtividade({
      descricao: `Lançou ${formatarPercentBp(percentBp)} de avanço em ${etapa.nome} (${etapa.obra.nome})`,
      entidade: "medicao",
      entidadeId: medicao.id,
      obraIds: [etapa.obraId],
    });
    revalidarObra(etapa.obraId);
    return { ok: true };
  },
);

export const excluirMedicao = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ROTAS, atividade: "medicao.excluir" },
  async (user, id: string): Promise<ActionResult> => {
    const existente = await prisma.medicao.findUnique({ where: { id }, select: { etapa: { select: { obraId: true } } } });
    if (!existente) return { ok: false, erro: "Avanço não encontrado" };
    exigirAcessoObra(user, existente.etapa.obraId, "Avanço não encontrado");
    const medicao = await prisma.medicao.delete({
      where: { id },
      select: { percentBp: true, etapa: { select: { obraId: true, nome: true, obra: { select: { nome: true } } } } },
    });
    anotarAtividade({
      descricao: `Excluiu o avanço de ${formatarPercentBp(medicao.percentBp)} em ${medicao.etapa.nome} (${medicao.etapa.obra.nome})`,
      entidade: "medicao",
      entidadeId: id,
      obraIds: [medicao.etapa.obraId],
    });
    revalidarObra(medicao.etapa.obraId);
    return { ok: true };
  },
);
