import { prisma } from "@/lib/prisma";
import type { Prisma, StatusObra } from "@prisma/client";
import { whereObrasPermitidas, type RestricaoObras } from "./acesso";
import { normalizarCno } from "./cno";

type ObraOption = { id: string; nome: string };
type ObraParaRateio = ObraOption & { cno: string | null; etapas: { id: string; nome: string }[] };
export type ObraDoCno = { id: string; nome: string; ativa: boolean };

const STATUS_ATIVA: StatusObra[] = ["PLANEJAMENTO", "ANDAMENTO"];

function whereSelecionavel(idsJaUsados: string[], restricao: RestricaoObras = null): Prisma.ObraWhereInput {
  const ativas: Prisma.ObraWhereInput =
    idsJaUsados.length > 0
      ? { OR: [{ status: { in: STATUS_ATIVA } }, { id: { in: idsJaUsados } }] }
      : { status: { in: STATUS_ATIVA } };
  return restricao === null ? ativas : { AND: [ativas, whereObrasPermitidas(restricao)] };
}

export async function listarObrasParaFiltro(restricao: RestricaoObras = null): Promise<ObraOption[]> {
  return prisma.obra.findMany({
    where: whereObrasPermitidas(restricao),
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true },
  });
}

// Inclui `idsJaUsados` para a obra concluída/pausada não sumir ao editar um lançamento antigo.
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

export async function listarObrasParaRateio(idsJaUsados: string[] = []): Promise<ObraParaRateio[]> {
  return prisma.obra.findMany({
    where: whereSelecionavel(idsJaUsados),
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      nome: true,
      cno: true,
      etapas: { orderBy: { ordem: "asc" }, select: { id: true, nome: true } },
    },
  });
}

// Obras com o CNO citado na nota; `ativa` = aparece no rateio (concluída/pausada não é pré-escolhida).
export async function obrasPorCno(cno: string | null): Promise<ObraDoCno[]> {
  const digitos = normalizarCno(cno);
  if (!digitos) return [];
  const obras = await prisma.obra.findMany({
    where: { cno: digitos },
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true, status: true },
  });
  return obras.map((o) => ({ id: o.id, nome: o.nome, ativa: STATUS_ATIVA.includes(o.status) }));
}

export async function erroEtapasDoRateio(
  rateios: { obraId: string; etapaId?: string | null }[],
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  const comEtapa = rateios.filter((r) => r.etapaId);
  if (comEtapa.length === 0) return null;
  const etapas = await db.etapa.findMany({
    where: { id: { in: comEtapa.map((r) => r.etapaId!) } },
    select: { id: true, obraId: true },
  });
  const obraDaEtapa = new Map(etapas.map((e) => [e.id, e.obraId]));
  return comEtapa.every((r) => obraDaEtapa.get(r.etapaId!) === r.obraId) ? null : "Etapa do rateio não pertence à obra escolhida";
}
