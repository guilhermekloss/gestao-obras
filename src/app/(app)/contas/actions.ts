"use server";

import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";

export const pagarParcelas = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/contas", "/notas"] },
  async (_user, ids: string[]): Promise<ActionResult> => {
    if (ids.length === 0) return { ok: false, erro: "Nenhuma parcela selecionada" };

    await prisma.parcela.updateMany({
      where: { id: { in: ids }, status: "ABERTA" },
      data: { status: "PAGA", pagaEm: new Date() },
    });
    return { ok: true };
  },
);

export const reabrirParcela = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/contas", "/notas"] },
  async (_user, id: string): Promise<ActionResult> => {
    await prisma.parcela.update({
      where: { id },
      data: { status: "ABERTA", pagaEm: null },
    });
    return { ok: true };
  },
);
