import { prisma } from "@/lib/prisma";
import type { Prisma, StatusObra } from "@prisma/client";
import { whereObrasPermitidas, type RestricaoObras } from "./acesso";

export type ObraOption = { id: string; nome: string };
export type ObraParaRateio = ObraOption & { etapas: { id: string; nome: string }[] };

const STATUS_ATIVA: StatusObra[] = ["PLANEJAMENTO", "ANDAMENTO"];

function whereSelecionavel(idsJaUsados: string[], restricao: RestricaoObras = null): Prisma.ObraWhereInput {
  const ativas: Prisma.ObraWhereInput =
    idsJaUsados.length > 0
      ? { OR: [{ status: { in: STATUS_ATIVA } }, { id: { in: idsJaUsados } }] }
      : { status: { in: STATUS_ATIVA } };
  return restricao === null ? ativas : { AND: [ativas, whereObrasPermitidas(restricao)] };
}

/**
 * Todas as obras, para filtros de listagem — o histórico inclui obras já
 * concluídas. Com `restricao` (CAMPO com acesso por obra), só as liberadas.
 */
export async function listarObrasParaFiltro(restricao: RestricaoObras = null): Promise<ObraOption[]> {
  return prisma.obra.findMany({
    where: whereObrasPermitidas(restricao),
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true },
  });
}

/**
 * Obras que podem receber novo trabalho: as ativas (Planejamento/Andamento),
 * mais as que já estão em `idsJaUsados` — para não sumir do formulário ao
 * editar um lançamento antigo cuja obra foi concluída ou pausada depois.
 */
export async function listarObrasAtivas(
  idsJaUsados: string[] = [],
  restricao: RestricaoObras = null,
): Promise<ObraOption[]> {
  return prisma.obra.findMany({
    where: whereSelecionavel(idsJaUsados, restricao),
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

/**
 * Cada etapa escolhida no rateio pertence à obra da mesma linha (o formulário
 * garante, mas a action recebe o que o cliente mandar). `null` = tudo certo.
 */
export async function erroEtapasDoRateio(rateios: { obraId: string; etapaId?: string | null }[]): Promise<string | null> {
  const comEtapa = rateios.filter((r) => r.etapaId);
  if (comEtapa.length === 0) return null;
  const etapas = await prisma.etapa.findMany({
    where: { id: { in: comEtapa.map((r) => r.etapaId!) } },
    select: { id: true, obraId: true },
  });
  const obraDaEtapa = new Map(etapas.map((e) => [e.id, e.obraId]));
  return comEtapa.every((r) => obraDaEtapa.get(r.etapaId!) === r.obraId) ? null : "Etapa do rateio não pertence à obra escolhida";
}
