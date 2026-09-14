"use server";

import { prisma } from "@/lib/prisma";
import { moedaParaCents } from "@/lib/format";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";

/** Salva os orçamentos de todas as etapas da obra de uma vez (campos etapa-<id>). */
export const salvarOrcamentos = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    revalidar: (obraId: string, _formData: FormData) => ["/orcamento", `/obras/${obraId}`],
  },
  async (_user, obraId: string, formData: FormData): Promise<ActionResult> => {
    const etapas = await prisma.etapa.findMany({
      where: { obraId },
      select: { id: true },
    });

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
    return { ok: true };
  },
);
