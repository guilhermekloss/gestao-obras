import type { ObraAutorizada } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dataParaInput, formatarMesAno, inputParaData } from "@/lib/format";
import type { PontoCurvaSChart } from "./curva-s-chart";
import { carregarLinhaBaseOficial } from "@/services/linha-base-db";
import { planoDaLinhaBase } from "@/services/linha-base";
import {
  curvaS,
  desvioBp,
  diaDoBanco,
  escalaGantt,
  idp,
  pesosDasEtapas,
  previstoEtapaNaData,
  realizadoPorEtapaNaData,
  realizadoNaData,
  previstoNaData,
  situacaoEtapa,
  variacaoDias,
  type Dia,
  type EscalaGantt,
  type EtapaPlano,
  type MedicaoPonto,
  type PontoCurvaS,
  type SituacaoEtapa,
} from "@/services/cronograma";

// nada aqui expõe valores em R$: o orçamento (da etapa e da linha de base) entra só como peso (%)

export type EtapaCronograma = {
  id: string;
  nome: string;
  inicioPrevisto: Dia | null;
  fimPrevisto: Dia | null;
  /** previsto até hoje pelo plano atual (linear nos dias) */
  previstoHojeBp: number;
  /** última medição até hoje */
  realizadoBp: number;
  /** realizado − previsto: negativo = atrás */
  desvioBp: number;
  /** base 10000; null antes do início previsto */
  idp: number | null;
  // null para quem não vê valores financeiros (CAMPO)
  pesoBp: number | null;
  situacao: SituacaoEtapa;
  /** datas da etapa na linha de base oficial; null sem linha de base ou etapa criada depois dela */
  linhaBase: { inicio: Dia | null; fim: Dia | null } | null;
  variacaoInicioDias: number | null;
  variacaoFimDias: number | null;
};

export type Cronograma = {
  hoje: Dia;
  etapas: EtapaCronograma[];
  escala: EscalaGantt | null;
  /** previsto da curva vem da linha de base oficial, quando existe */
  curva: PontoCurvaS[];
  previstoHojeBp: number;
  realizadoHojeBp: number;
  desvioBp: number;
  idp: number | null;
  linhaBase: { id: string; nome: string; criadaEm: Date } | null;
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
  const [etapas, medicoes, linhaBase] = await Promise.all([
    prisma.etapa.findMany({
      where: { obraId },
      orderBy: [{ ordem: "asc" }, { id: "asc" }],
      select: { id: true, nome: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true },
    }),
    prisma.medicao.findMany({
      where: { etapa: { obraId } },
      // mesma ordem de `avancoPorEtapa`: no mesmo dia, a última lançada vence
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { etapaId: true, data: true, percentBp: true },
    }),
    carregarLinhaBaseOficial(obraId),
  ]);

  const hoje = hojeDia();
  const { plano, pontos } = paraPlano(etapas, medicoes);
  // até hoje: medição com data futura não conta como feita
  const ultimo = realizadoPorEtapaNaData(pontos, hoje);
  const pesos = pesosDasEtapas(plano);
  const base = linhaBase ? planoDaLinhaBase(linhaBase) : null;
  const naBase = new Map((linhaBase?.etapas ?? []).flatMap((e) => (e.etapaId ? [[e.etapaId, e] as const] : [])));

  const previstoHojeBp = previstoNaData(plano, hoje);
  const realizadoHojeBp = realizadoNaData(plano, pontos, hoje);

  return {
    hoje,
    etapas: plano.map((p, i) => {
      const realizadoBp = ultimo.get(p.id) ?? 0;
      const previstoEtapa = previstoEtapaNaData(p, hoje);
      const lb = linhaBase ? naBase.get(p.id) : undefined;
      return {
        id: p.id,
        nome: etapas[i].nome,
        inicioPrevisto: p.inicioPrevisto,
        fimPrevisto: p.fimPrevisto,
        previstoHojeBp: previstoEtapa,
        realizadoBp,
        desvioBp: desvioBp(previstoEtapa, realizadoBp),
        idp: idp(realizadoBp, previstoEtapa),
        pesoBp: opcoes.comPesos ? (pesos.get(p.id) ?? 0) : null,
        situacao: situacaoEtapa(p, realizadoBp, hoje),
        linhaBase: lb ? { inicio: lb.inicio, fim: lb.fim } : null,
        variacaoInicioDias: lb ? variacaoDias(p.inicioPrevisto, lb.inicio) : null,
        variacaoFimDias: lb ? variacaoDias(p.fimPrevisto, lb.fim) : null,
      };
    }),
    // só as barras de base que aparecem (etapas atuais) entram no eixo
    escala: escalaGantt(
      plano,
      hoje,
      plano.flatMap((p) => {
        const lb = naBase.get(p.id);
        return lb ? [{ inicioPrevisto: lb.inicio, fimPrevisto: lb.fim }] : [];
      }),
    ),
    curva: curvaS(plano, pontos, hoje, undefined, base),
    previstoHojeBp,
    realizadoHojeBp,
    desvioBp: desvioBp(previstoHojeBp, realizadoHojeBp),
    idp: idp(realizadoHojeBp, previstoHojeBp),
    linhaBase: linhaBase ? { id: linhaBase.id, nome: linhaBase.nome, criadaEm: linhaBase.criadaEm } : null,
  };
}

export function paraGrafico(curva: PontoCurvaS[]): PontoCurvaSChart[] {
  return curva.map((p) => ({
    mes: formatarMesAno(inputParaData(`${p.mes}-15`)),
    previsto: p.previstoBp / 100,
    realizado: p.realizadoBp === null ? null : p.realizadoBp / 100,
  }));
}
