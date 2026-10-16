"use server";

import { prisma } from "@/lib/prisma";
import { formatarMoeda, moedaParaCents } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { MAX_CENTS } from "@/schemas/comum";

export const salvarOrcamentos = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    obra: (obraId: string, _formData: FormData) => obraId,
    revalidar: (obraId: string, _formData: FormData) => ["/orcamento", `/obras/${obraId}`],
    atividade: "orcamento.salvar",
  },
  async (_user, obraId: string, formData: FormData): Promise<ActionResult> => {
    const etapas = await prisma.etapa.findMany({
      where: { obraId },
      select: { id: true, nome: true, orcamentoCents: true },
    });
    for (const e of etapas) {
      const valor = formData.get(`etapa-${e.id}`);
      if (valor === null) continue;
      const cents = moedaParaCents(String(valor));
      if (cents < 0 || cents > MAX_CENTS) return { ok: false, erro: `${e.nome}: valor fora do limite permitido` };
    }

    await prisma.$transaction(
      etapas
        .map((e) => {
          const valor = formData.get(`etapa-${e.id}`);
          if (valor === null) return null;
          return prisma.etapa.update({
            where: { id: e.id },
            data: { orcamentoCents: moedaParaCents(String(valor)) },
          });
        })
        .filter((op) => op !== null),
    );
    const totalCents = etapas.reduce((acc, e) => {
      const valor = formData.get(`etapa-${e.id}`);
      return acc + (valor === null ? e.orcamentoCents : moedaParaCents(String(valor)));
    }, 0);
    anotarAtividade({
      descricao: `Alterou o orçamento (total ${formatarMoeda(totalCents)})`,
      entidade: "obra",
      entidadeId: obraId,
      obraIds: [obraId],
      valorCents: totalCents,
    });
    return { ok: true };
  },
);
