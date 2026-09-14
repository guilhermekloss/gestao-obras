import { prisma } from "@/lib/prisma";
import type { Prisma, StatusObra } from "@prisma/client";

export type ObraOption = { id: string; nome: string };
export type ObraParaRateio = ObraOption & { etapas: { id: string; nome: string }[] };

const STATUS_ATIVA: StatusObra[] = ["PLANEJAMENTO", "ANDAMENTO"];

function whereSelecionavel(idsJaUsados: string[]): Prisma.ObraWhereInput {
  return idsJaUsados.length > 0
    ? { OR: [{ status: { in: STATUS_ATIVA } }, { id: { in: idsJaUsados } }] }
    : { status: { in: STATUS_ATIVA } };
}

/** Todas as obras, para filtros de listagem — o histórico inclui obras já concluídas. */
export async function listarObrasParaFiltro(): Promise<ObraOption[]> {
  return prisma.obra.findMany({ orderBy: { codigo: "asc" }, select: { id: true, nome: true } });
}

/**
 * Obras que podem receber novo trabalho: as ativas (Planejamento/Andamento),
 * mais as que já estão em `idsJaUsados` — para não sumir do formulário ao
 * editar um lançamento antigo cuja obra foi concluída ou pausada depois.
 */
export async function listarObrasAtivas(idsJaUsados: string[] = []): Promise<ObraOption[]> {
  return prisma.obra.findMany({
    where: whereSelecionavel(idsJaUsados),
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true },
  });
}

/** Mesma regra de `listarObrasAtivas`, com as etapas — para o rateio da NF. */
export async function listarObrasParaRateio(idsJaUsados: string[] = []): Promise<ObraParaRateio[]> {
  return prisma.obra.findMany({
    where: whereSelecionavel(idsJaUsados),
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      nome: true,
      etapas: { orderBy: { ordem: "asc" }, select: { id: true, nome: true } },
    },
  });
}
