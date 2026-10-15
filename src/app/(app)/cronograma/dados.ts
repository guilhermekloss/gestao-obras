import { prisma } from "@/lib/prisma";
import { dataParaInput, formatarMesAno, inputParaData } from "@/lib/format";
import type { PontoCurvaSChart } from "./curva-s-chart";
import {
  curvaS,
  diaDoBanco,
  escalaGantt,
  pesosDasEtapas,
  realizadoPorEtapaNaData,
  realizadoNaData,
  previstoNaData,
  situacaoEtapa,
  type Dia,
  type EscalaGantt,
  type EtapaPlano,
  type MedicaoPonto,
  type PontoCurvaS,
  type SituacaoEtapa,
} from "@/services/cronograma";

/**
 * Leitura do cronograma de uma obra, já convertida para o formato das funções
 * puras de `services/cronograma.ts`. Compartilhada pela página `/cronograma`,
 * pela aba Cronograma da obra e (as consultas) pelo widget do dashboard.
 *
 * Nada aqui expõe valores em R$: o orçamento entra só como peso (em %).
 */

type EtapaCronograma = {
  id: string;
  nome: string;
  inicioPrevisto: Dia | null;
  fimPrevisto: Dia | null;
  realizadoBp: number;
  /** participação no orçamento da obra — `null` para quem não vê valores financeiros (CAMPO) */
  pesoBp: number | null;
  situacao: SituacaoEtapa;
};

export type Cronograma = {
  hoje: Dia;
  etapas: EtapaCronograma[];
  escala: EscalaGantt | null;
  curva: PontoCurvaS[];
  previstoHojeBp: number;
  realizadoHojeBp: number;
};

/** Dia de hoje no fuso do servidor. */
export function hojeDia(): Dia {
  return dataParaInput(new Date());
}

/** Converte etapas e medições do Prisma para o formato do service. */
export function paraPlano(
  etapas: { id: string; orcamentoCents: number; inicioPrevisto: Date | null; fimPrevisto: Date | null }[],
  medicoes: { etapaId: string; data: Date; percentBp: number }[],
): { plano: EtapaPlano[]; pontos: MedicaoPonto[] } {
  return {
    plano: etapas.map((e) => ({
      id: e.id,
      orcamentoCents: e.orcamentoCents,
      inicioPrevisto: e.inicioPrevisto ? diaDoBanco(e.inicioPrevisto) : null,
      fimPrevisto: e.fimPrevisto ? diaDoBanco(e.fimPrevisto) : null,
    })),
    // a data da medição é gravada ao meio-dia local (`inputParaData`)
    pontos: medicoes.map((m) => ({ etapaId: m.etapaId, data: dataParaInput(m.data), percentBp: m.percentBp })),
  };
}

export async function carregarCronograma(obraId: string, opcoes: { comPesos: boolean }): Promise<Cronograma> {
  const [etapas, medicoes] = await Promise.all([
    prisma.etapa.findMany({
      where: { obraId },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true },
    }),
    prisma.medicao.findMany({
      where: { etapa: { obraId } },
      // mesma ordem de `avancoPorEtapa`: no mesmo dia, a última lançada vence (a ordenação do service é estável)
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { etapaId: true, data: true, percentBp: true },
    }),
  ]);

  const hoje = hojeDia();
  const { plano, pontos } = paraPlano(etapas, medicoes);
  // avanço atual = última medição registrada, mesmo que datada no futuro (igual a `avancoPorEtapa`)
  const ultimo = realizadoPorEtapaNaData(pontos, "9999-12-31");
  const pesos = pesosDasEtapas(plano);

  return {
    hoje,
    etapas: plano.map((p, i) => {
      const realizadoBp = ultimo.get(p.id) ?? 0;
      return {
        id: p.id,
        nome: etapas[i].nome,
        inicioPrevisto: p.inicioPrevisto,
        fimPrevisto: p.fimPrevisto,
        realizadoBp,
        pesoBp: opcoes.comPesos ? (pesos.get(p.id) ?? 0) : null,
        situacao: situacaoEtapa(p, realizadoBp, hoje),
      };
    }),
    escala: escalaGantt(plano, hoje),
    curva: curvaS(plano, pontos, hoje),
    previstoHojeBp: previstoNaData(plano, hoje),
    realizadoHojeBp: realizadoNaData(plano, pontos, "9999-12-31"),
  };
}

/** Curva S em basis points → pontos do gráfico (mês rotulado, percentuais 0–100). */
export function paraGrafico(curva: PontoCurvaS[]): PontoCurvaSChart[] {
  return curva.map((p) => ({
    mes: formatarMesAno(inputParaData(`${p.mes}-15`)),
    previsto: p.previstoBp / 100,
    realizado: p.realizadoBp === null ? null : p.realizadoBp / 100,
  }));
}
