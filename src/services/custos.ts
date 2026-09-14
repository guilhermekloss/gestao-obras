import { prisma } from "@/lib/prisma";
import { custoRateado } from "./rateio";

/**
 * Custo realizado: quanto já foi comprado (soma dos itens de NF × rateio),
 * agregado por obra, por etapa dentro de uma obra, ou por mês.
 *
 * Distinto de `services/financeiro.ts#fluxoMensal`, que soma o valor das
 * *parcelas* (quando o dinheiro sai) em vez do total dos *itens* (quando a
 * compra foi feita) — duas datas e duas tabelas diferentes para a mesma
 * pergunta "quanto por obra", ambas via `custoRateado`.
 */

type Rateio = { obraId: string; etapaId: string | null; fracaoBp: number };
type NotaComRateio = { itens: { totalCents: number }[]; rateios: Rateio[] };

/**
 * Núcleo comum: para cada nota, distribui a soma dos totais dos seus itens
 * pelo rateio da nota e acumula num mapa por chave (obraId, etapaId, mês...).
 * Uma nota sem rateio não contribui (nenhuma chave sabe atribuí-la).
 */
function acumular<N extends NotaComRateio, K>(
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

/** Custo realizado por obra, em todo o histórico. */
export async function realizadoPorObra(): Promise<Map<string, number>> {
  const notas = await prisma.notaFiscal.findMany({ select: SELECT_NOTA_COM_RATEIO });
  return acumular(notas, (_, r) => r.obraId);
}

/** Custo realizado por etapa de uma obra (chave null = rateio sem etapa). */
export async function realizadoPorEtapa(obraId: string): Promise<Map<string | null, number>> {
  const notas = await prisma.notaFiscal.findMany({
    where: { rateios: { some: { obraId } } },
    select: {
      itens: { select: { totalCents: true } },
      // uma nota pode ratear para outras obras também — só a fração desta importa
      rateios: { where: { obraId }, select: { obraId: true, etapaId: true, fracaoBp: true } },
    },
  });
  return acumular(notas, (_, r) => r.etapaId);
}

/** Custo realizado por mês (aaaa-mm) × obra, desde a data informada. */
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

function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Último percentual medido de cada etapa da obra. */
export async function avancoPorEtapa(obraId: string): Promise<Map<string, number>> {
  const medicoes = await prisma.medicao.findMany({
    where: { etapa: { obraId } },
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });
  const mapa = new Map<string, number>();
  for (const m of medicoes) mapa.set(m.etapaId, m.percentBp); // última vence
  return mapa;
}
