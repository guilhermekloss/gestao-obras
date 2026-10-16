import type { ObraAutorizada } from "@/lib/auth";
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

// nada aqui expõe valores em R$: o orçamento entra só como peso (%)

type EtapaCronograma = {
  id: string;
  nome: string;
  inicioPrevisto: Dia | null;
  fimPrevisto: Dia | null;
  realizadoBp: number;
  // null para quem não vê valores financeiros (CAMPO)
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

// no fuso do servidor
export function hojeDia(): Dia {
  return dataParaInput(new Date());
}

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

export async function carregarCronograma(obra: ObraAutorizada, opcoes: { comPesos: boolean }): Promise<Cronograma> {
  const obraId = obra.id;
  const [etapas, medicoes] = await Promise.all([
    prisma.etapa.findMany({
      where: { obraId },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true },
    }),
    prisma.medicao.findMany({
      where: { etapa: { obraId } },
      // mesma ordem de `avancoPorEtapa`: no mesmo dia, a última lançada vence
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { etapaId: true, data: true, percentBp: true },
    }),
  ]);

  const hoje = hojeDia();
  const { plano, pontos } = paraPlano(etapas, medicoes);
  // última medição, mesmo se datada no futuro (igual a `avancoPorEtapa`)
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

export function paraGrafico(curva: PontoCurvaS[]): PontoCurvaSChart[] {
  return curva.map((p) => ({
    mes: formatarMesAno(inputParaData(`${p.mes}-15`)),
    previsto: p.previstoBp / 100,
    realizado: p.realizadoBp === null ? null : p.realizadoBp / 100,
  }));
}
