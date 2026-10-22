import { BP_TOTAL } from "./rateio";
import {
  MARGEM_ATENCAO_BP,
  MARGEM_ATRASO_BP,
  desvioBp,
  idp,
  previstoNaData,
  realizadoNaData,
  type Dia,
  type EtapaPlano,
  type MedicaoPonto,
  type SituacaoEtapa,
} from "./cronograma";

export type AvancoObraHoje = {
  /** previsto até hoje pelo plano atual, ponderado pelo orçado (como no Cronograma) */
  previstoBp: number;
  /** medições até hoje, ponderadas pelo orçado */
  realizadoBp: number;
  desvioBp: number;
  /** base 10000; null quando nada estava previsto ainda */
  idp: number | null;
  situacao: SituacaoEtapa;
};

/**
 * Avanço da obra inteira hoje, com a mesma régua de `situacaoEtapa`, só que sobre os totais ponderados:
 * fim da última etapa vencido sem 100% ou mais de 10 p.p. atrás = Atrasada; mais de 5 p.p. = Atenção.
 */
export function avancoObraHoje(plano: EtapaPlano[], medicoes: MedicaoPonto[], hoje: Dia): AvancoObraHoje {
  const previstoBp = previstoNaData(plano, hoje);
  const realizadoBp = realizadoNaData(plano, medicoes, hoje);
  return {
    previstoBp,
    realizadoBp,
    desvioBp: desvioBp(previstoBp, realizadoBp),
    idp: idp(realizadoBp, previstoBp),
    situacao: situacaoDaObra(plano, previstoBp, realizadoBp, hoje),
  };
}

function situacaoDaObra(plano: EtapaPlano[], previstoBp: number, realizadoBp: number, hoje: Dia): SituacaoEtapa {
  if (realizadoBp >= BP_TOTAL) return "CONCLUIDA";
  const fins = plano
    .filter((e) => e.inicioPrevisto && e.fimPrevisto && e.fimPrevisto >= e.inicioPrevisto)
    .map((e) => e.fimPrevisto as Dia);
  if (fins.length === 0) return "SEM_DATAS";
  if (hoje > fins.reduce((a, b) => (a > b ? a : b))) return "ATRASADA";
  const atraso = previstoBp - realizadoBp;
  if (atraso > MARGEM_ATRASO_BP) return "ATRASADA";
  if (atraso > MARGEM_ATENCAO_BP) return "ATENCAO";
  if (realizadoBp === 0) return "NAO_INICIADA";
  return "EM_DIA";
}
