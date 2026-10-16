import { prisma } from "@/lib/prisma";
import { chaveMes } from "@/lib/format";
import { custoRateado } from "./rateio";

export { chaveMes };

// Realizado = itens × rateio na data da compra; `fluxoMensal` (financeiro.ts) usa as parcelas no vencimento.

type Rateio = { obraId: string; etapaId: string | null; fracaoBp: number };
type NotaComRateio = { itens: { totalCents: number }[]; rateios: Rateio[] };

// Itens somados por nota e só então rateados: o arredondamento é por nota em todas as telas.
export function acumular<N extends NotaComRateio, K>(
  notas: N[],
  chaveDe: (nota: N, rateio: Rateio) => K,
): Map<K, number> {
  const mapa = new Map<K, number>();
  for (const nota of notas) {
    const totalItens = nota.itens.reduce((a, i) => a + i.totalCents, 0);
    for (const r of nota.rateios) {
      const chave = chaveDe(nota, r);
      mapa.set(chave, (mapa.get(chave) ?? 0) + custoRateado(totalItens, r.fracaoBp));
    }
  }
  return mapa;
}

const SELECT_NOTA_COM_RATEIO = {
  dataCompra: true,
  itens: { select: { totalCents: true } },
  rateios: { select: { obraId: true, etapaId: true, fracaoBp: true } },
} as const;

export async function realizadoPorObra(): Promise<Map<string, number>> {
  const notas = await prisma.notaFiscal.findMany({ select: SELECT_NOTA_COM_RATEIO });
  return acumular(notas, (_, r) => r.obraId);
}

export async function realizadoPorEtapa(obraId: string): Promise<Map<string | null, number>> {
  const notas = await prisma.notaFiscal.findMany({
    where: { rateios: { some: { obraId } } },
    select: {
      itens: { select: { totalCents: true } },
      rateios: { where: { obraId }, select: { obraId: true, etapaId: true, fracaoBp: true } },
    },
  });
  return acumular(notas, (_, r) => r.etapaId);
}

export async function realizadoPorEtapaTodas(): Promise<Map<string, number>> {
  const notas = await prisma.notaFiscal.findMany({
    where: { rateios: { some: { etapaId: { not: null } } } },
    select: {
      itens: { select: { totalCents: true } },
      rateios: {
        where: { etapaId: { not: null } },
        select: { obraId: true, etapaId: true, fracaoBp: true },
      },
    },
  });
  const porEtapa = acumular(notas, (_, r) => r.etapaId);
  porEtapa.delete(null);
  return porEtapa as Map<string, number>;
}

export async function realizadoPorMes(
  desde: Date,
): Promise<Map<string, Map<string, number>>> {
  const notas = await prisma.notaFiscal.findMany({
    where: { dataCompra: { gte: desde } },
    select: SELECT_NOTA_COM_RATEIO,
  });
  const porChave = acumular(notas, (nota, r) => `${chaveMes(nota.dataCompra)}::${r.obraId}`);
  const porMes = new Map<string, Map<string, number>>();
  for (const [chave, cents] of porChave) {
    const [mes, obraId] = chave.split("::");
    const linha = porMes.get(mes) ?? new Map<string, number>();
    linha.set(obraId, cents);
    porMes.set(mes, linha);
  }
  return porMes;
}

// Medições em ordem de data e id: no mesmo dia, a última lançada vence, e a última de todas vale (mesmo datada no futuro).
export function ultimoAvancoPorEtapa(medicoes: { etapaId: string; percentBp: number }[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const m of medicoes) mapa.set(m.etapaId, m.percentBp);
  return mapa;
}

export async function avancoPorEtapa(obraId?: string): Promise<Map<string, number>> {
  const medicoes = await prisma.medicao.findMany({
    where: obraId ? { etapa: { obraId } } : {},
    orderBy: [{ data: "asc" }, { id: "asc" }],
    select: { etapaId: true, percentBp: true },
  });
  return ultimoAvancoPorEtapa(medicoes);
}
