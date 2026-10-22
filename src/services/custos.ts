import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { chaveMes, dataParaInput } from "@/lib/format";
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

// Uma leitura por requisição para todo o dashboard (cache() só memoiza no render); compartilhado, não mutar.
export const notasParaAnalise = cache(async () =>
  prisma.notaFiscal.findMany({
    select: {
      id: true,
      numero: true,
      tipoDocumento: true,
      totalCents: true,
      dataCompra: true,
      fornecedorId: true,
      fornecedor: { select: { nome: true } },
      itens: { select: { descricao: true, unidade: true, tipo: true, qtde: true, totalCents: true } },
      rateios: { select: { obraId: true, etapaId: true, fracaoBp: true } },
    },
  }),
);

export const medicoesTodas = cache(async () =>
  prisma.medicao.findMany({
    orderBy: [{ data: "asc" }, { id: "asc" }],
    select: { etapaId: true, data: true, percentBp: true },
  }),
);

export async function realizadoPorObra(): Promise<Map<string, number>> {
  return acumular(await notasParaAnalise(), (_, r) => r.obraId);
}

// Só as notas com rateio na obra, e só os rateios dela; uma leitura por requisição para etapa e mês.
const notasDaObra = cache(async (obraId: string) =>
  prisma.notaFiscal.findMany({
    where: { rateios: { some: { obraId } } },
    select: {
      dataCompra: true,
      itens: { select: { totalCents: true } },
      rateios: { where: { obraId }, select: { obraId: true, etapaId: true, fracaoBp: true } },
    },
  }),
);

export async function realizadoPorEtapa(obraId: string): Promise<Map<string | null, number>> {
  return acumular(await notasDaObra(obraId), (_, r) => r.etapaId);
}

// "aaaa-mm" → centavos da obra no mês da compra, desde a primeira nota (mesma base de `realizadoPorMes`).
export async function realizadoPorMesDaObra(obraId: string): Promise<Map<string, number>> {
  return acumular(await notasDaObra(obraId), (nota) => chaveMes(nota.dataCompra));
}

// Rateio sem etapa cai na chave null e sai; os outros rateios da mesma nota não mudam.
export async function realizadoPorEtapaTodas(): Promise<Map<string, number>> {
  const porEtapa = acumular(await notasParaAnalise(), (_, r) => r.etapaId);
  porEtapa.delete(null);
  return porEtapa as Map<string, number>;
}

export async function realizadoPorMes(
  desde: Date,
): Promise<Map<string, Map<string, number>>> {
  const notas = (await notasParaAnalise()).filter((n) => n.dataCompra.getTime() >= desde.getTime());
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

// Igual, mas só com medições até o dia `ate` ("aaaa-mm-dd", dia local: a medição é gravada ao meio-dia local),
// como no Cronograma: medição datada no futuro ainda não foi feita.
export function ultimoAvancoAte(
  medicoes: { etapaId: string; data: Date; percentBp: number }[],
  ate: string,
): Map<string, number> {
  return ultimoAvancoPorEtapa(medicoes.filter((m) => dataParaInput(m.data) <= ate));
}

/**
 * Último avanço de cada etapa. Com `ate` (dia "aaaa-mm-dd"), só medições até esse dia: é o que vale para
 * avanço físico de hoje (desempenho de custo, alertas, resumo da obra). Sem `ate`, a última de todas.
 */
export async function avancoPorEtapa(obraId?: string, opcoes: { ate?: string } = {}): Promise<Map<string, number>> {
  const { ate } = opcoes;
  if (!obraId) {
    const todas = await medicoesTodas();
    return ate ? ultimoAvancoAte(todas, ate) : ultimoAvancoPorEtapa(todas);
  }
  const medicoes = await prisma.medicao.findMany({
    where: { etapa: { obraId } },
    orderBy: [{ data: "asc" }, { id: "asc" }],
    select: { etapaId: true, data: true, percentBp: true },
  });
  return ate ? ultimoAvancoAte(medicoes, ate) : ultimoAvancoPorEtapa(medicoes);
}
