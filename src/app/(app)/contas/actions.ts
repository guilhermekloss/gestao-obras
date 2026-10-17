"use server";

import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade, ignorarAtividade } from "@/lib/atividade";
import { formatarMoeda } from "@/lib/format";
import { validarDataPagamento } from "@/services/parcelas";

export const pagarParcelas = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/contas", "/notas"], atividade: "parcela.pagar" },
  async (_user, ids: string[], dataPagamento?: string): Promise<ActionResult> => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length > 64) || ids.length > 1000) {
      return { ok: false, erro: "Seleção inválida" };
    }
    if (ids.length === 0) return { ok: false, erro: "Nenhuma parcela selecionada" };
    // sem data (chamadas antigas) = agora
    let pagaEm = new Date();
    if (dataPagamento !== undefined) {
      const data = validarDataPagamento(dataPagamento);
      if (!data.ok) return { ok: false, erro: data.erro };
      pagaEm = data.data;
    }

    const abertas = await prisma.parcela.findMany({
      where: { id: { in: ids }, status: "ABERTA" },
      select: { id: true, valorCents: true, notaId: true, nota: { select: { rateios: { select: { obraId: true } } } } },
    });
    await prisma.parcela.updateMany({
      where: { id: { in: abertas.map((p) => p.id) }, status: "ABERTA" },
      data: { status: "PAGA", pagaEm },
    });

    if (abertas.length === 0) {
      ignorarAtividade(); // já estavam pagas: nada mudou
      return { ok: true };
    }
    const totalCents = abertas.reduce((acc, p) => acc + p.valorCents, 0);
    const notas = new Set(abertas.map((p) => p.notaId));
    anotarAtividade({
      descricao: `Pagou ${abertas.length} parcela${abertas.length === 1 ? "" : "s"} (${formatarMoeda(totalCents)})`,
      entidade: "nota",
      entidadeId: notas.size === 1 ? abertas[0].notaId : undefined,
      obraIds: abertas.flatMap((p) => p.nota.rateios.map((r) => r.obraId)),
      valorCents: totalCents,
    });
    return { ok: true };
  },
);

export const reabrirParcela = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/contas", "/notas"], atividade: "parcela.reabrir" },
  async (_user, id: string): Promise<ActionResult> => {
    const parcela = await prisma.parcela.update({
      where: { id },
      data: { status: "ABERTA", pagaEm: null },
      select: {
        numero: true,
        valorCents: true,
        nota: {
          select: {
            id: true,
            numero: true,
            fornecedor: { select: { nome: true } },
            rateios: { select: { obraId: true } },
          },
        },
      },
    });
    anotarAtividade({
      descricao: `Reabriu a parcela ${parcela.numero} do lançamento ${parcela.nota.numero} — ${parcela.nota.fornecedor.nome}`,
      entidade: "nota",
      entidadeId: parcela.nota.id,
      obraIds: parcela.nota.rateios.map((r) => r.obraId),
      valorCents: parcela.valorCents,
    });
    return { ok: true };
  },
);
