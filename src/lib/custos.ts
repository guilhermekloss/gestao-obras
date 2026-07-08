import { prisma } from "@/lib/prisma";
import { custoRateado } from "@/services/rateio";

/** Custo realizado por obra: soma dos rateios (total do item × fração). */
export async function realizadoPorObra(): Promise<Map<string, number>> {
  const rateios = await prisma.rateioItem.findMany({
    include: { item: { select: { totalCents: true } } },
  });
  const mapa = new Map<string, number>();
  for (const r of rateios) {
    mapa.set(
      r.obraId,
      (mapa.get(r.obraId) ?? 0) + custoRateado(r.item.totalCents, r.fracaoBp),
    );
  }
  return mapa;
}

/** Custo realizado por etapa de uma obra (chave null = itens sem etapa). */
export async function realizadoPorEtapa(
  obraId: string,
): Promise<Map<string | null, number>> {
  const rateios = await prisma.rateioItem.findMany({
    where: { obraId },
    include: { item: { select: { totalCents: true } } },
  });
  const mapa = new Map<string | null, number>();
  for (const r of rateios) {
    mapa.set(
      r.etapaId,
      (mapa.get(r.etapaId) ?? 0) + custoRateado(r.item.totalCents, r.fracaoBp),
    );
  }
  return mapa;
}

/** Último percentual medido de cada etapa da obra. */
export async function avancoPorEtapa(
  obraId: string,
): Promise<Map<string, number>> {
  const medicoes = await prisma.medicao.findMany({
    where: { etapa: { obraId } },
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });
  const mapa = new Map<string, number>();
  for (const m of medicoes) mapa.set(m.etapaId, m.percentBp); // última vence
  return mapa;
}
