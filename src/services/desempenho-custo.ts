import { BP_TOTAL } from "./rateio";
import { avancoPonderado } from "./obra";
import { mesesEntre, previstoEtapaNaData, type Dia } from "./cronograma";

// Desempenho de custo pelo valor agregado. Valores em centavos inteiros; frações em base 10000 (BP_TOTAL).

export type EntradaDesempenho = {
  orcamentoCents: number;
  realizadoCents: number;
  /** Avanço físico (última medição), em base 10000. */
  fisicoBp: number;
};

export type Desempenho = EntradaDesempenho & {
  /** Quanto do orçado o físico já "ganhou": orçado × físico. */
  valorAgregadoCents: number;
  /** Índice de desempenho de custo, em base 10000 (10000 = 1,00). null sem realizado. */
  idcBp: number | null;
  /** Custo projetado no fim: realizado ÷ físico; sem físico ou sem realizado, o maior entre orçado e realizado. */
  tendenciaCents: number;
  /** Orçado − tendência: negativo = vai faltar dinheiro. */
  variacaoCents: number;
};

export function valorAgregado(orcamentoCents: number, fisicoBp: number): number {
  return Math.round((orcamentoCents * fisicoBp) / BP_TOTAL);
}

export function idc(valorAgregadoCents: number, realizadoCents: number): number | null {
  return realizadoCents === 0 ? null : Math.round((valorAgregadoCents * BP_TOTAL) / realizadoCents);
}

// Físico sem nada gasto (custo lançado sem etapa, ou ainda não lançado) daria tendência zero e uma
// "sobra" do orçado inteiro: nesse caso vale o orçado, como sem físico.
export function tendencia(orcamentoCents: number, realizadoCents: number, fisicoBp: number): number {
  if (fisicoBp > 0 && realizadoCents > 0) return Math.round((realizadoCents * BP_TOTAL) / fisicoBp);
  return Math.max(orcamentoCents, realizadoCents);
}

export function desempenhoCusto(e: EntradaDesempenho): Desempenho {
  const valorAgregadoCents = valorAgregado(e.orcamentoCents, e.fisicoBp);
  const tendenciaCents = tendencia(e.orcamentoCents, e.realizadoCents, e.fisicoBp);
  return {
    ...e,
    valorAgregadoCents,
    idcBp: idc(valorAgregadoCents, e.realizadoCents),
    tendenciaCents,
    variacaoCents: e.orcamentoCents - tendenciaCents,
  };
}

// Totais da obra: somas por etapa (a tendência também, para cada etapa projetar pelo próprio físico);
// físico ponderado pelo orçado, como em todo o app; IDC recalculado sobre os totais.
export function totalDesempenho(linhas: Desempenho[]): Desempenho {
  const soma = (f: (l: Desempenho) => number) => linhas.reduce((a, l) => a + f(l), 0);
  const orcamentoCents = soma((l) => l.orcamentoCents);
  const realizadoCents = soma((l) => l.realizadoCents);
  const valorAgregadoCents = soma((l) => l.valorAgregadoCents);
  const tendenciaCents = soma((l) => l.tendenciaCents);
  return {
    orcamentoCents,
    realizadoCents,
    fisicoBp: avancoPonderado(linhas.map((l) => ({ orcamentoCents: l.orcamentoCents, percentBp: l.fisicoBp }))),
    valorAgregadoCents,
    idcBp: idc(valorAgregadoCents, realizadoCents),
    tendenciaCents,
    variacaoCents: orcamentoCents - tendenciaCents,
  };
}

// ---------------------------------------------------------------------------
// Desembolso previsto × realizado por mês

/** Datas de entrada: hoje as previstas da etapa; quando houver linha de base, as dela. */
export type EtapaDesembolso = { orcamentoCents: number; inicio: Dia | null; fim: Dia | null };

export type PontoDesembolso = {
  mes: string; // "aaaa-mm"
  previstoCents: number;
  previstoAcumCents: number;
  /** null nos meses depois do corrente. */
  realizadoCents: number | null;
  realizadoAcumCents: number | null;
};

export type Desembolso = {
  pontos: PontoDesembolso[];
  /** Orçado das etapas sem datas válidas: fica fora do previsto mensal. */
  semDatasCents: number;
};

function comDatas(e: EtapaDesembolso): e is EtapaDesembolso & { inicio: Dia; fim: Dia } {
  return !!e.inicio && !!e.fim && e.fim >= e.inicio;
}

function ultimoDiaDoMes(mes: string): Dia {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
}

const menor = (a: string, b: string) => (a < b ? a : b);
const maior = (a: string, b: string) => (a > b ? a : b);

/**
 * Previsto: o orçado de cada etapa distribuído em linha reta entre início e fim, lido no fim de
 * cada mês (`previstoEtapaNaData`). O mês recebe a diferença do acumulado, então a soma dos meses
 * fecha no orçado das etapas com datas, sem sobra de arredondamento.
 * Realizado: centavos por "aaaa-mm" (itens × rateio na data da compra).
 */
export function desembolsoMensal(
  etapas: EtapaDesembolso[],
  realizadoPorMes: Map<string, number>,
  hoje: Dia,
): Desembolso {
  const planejadas = etapas.filter(comDatas);
  const semDatasCents = etapas.filter((e) => !comDatas(e)).reduce((a, e) => a + e.orcamentoCents, 0);

  const mesesRealizado = [...realizadoPorMes.entries()].filter(([, v]) => v !== 0).map(([m]) => m);
  const inicios = [...planejadas.map((e) => e.inicio.slice(0, 7)), ...mesesRealizado];
  const fins = [...planejadas.map((e) => e.fim.slice(0, 7)), ...mesesRealizado];
  if (inicios.length === 0) return { pontos: [], semDatasCents };

  const de = inicios.reduce(menor);
  const ate = fins.reduce(maior);
  const mesHoje = hoje.slice(0, 7);

  let previstoAntes = 0;
  let realizadoAcum = 0;
  const pontos = mesesEntre(de, ate).map((mes) => {
    const fimDoMes = ultimoDiaDoMes(mes);
    const previstoAcumCents = planejadas.reduce(
      (a, e) => a + Math.round((e.orcamentoCents * previstoEtapaNaData({ inicioPrevisto: e.inicio, fimPrevisto: e.fim }, fimDoMes)) / BP_TOTAL),
      0,
    );
    const previstoCents = previstoAcumCents - previstoAntes;
    previstoAntes = previstoAcumCents;

    if (mes > mesHoje) {
      return { mes, previstoCents, previstoAcumCents, realizadoCents: null, realizadoAcumCents: null };
    }
    const realizadoCents = realizadoPorMes.get(mes) ?? 0;
    realizadoAcum += realizadoCents;
    return { mes, previstoCents, previstoAcumCents, realizadoCents, realizadoAcumCents: realizadoAcum };
  });

  return { pontos, semDatasCents };
}

/**
 * Etapas do desembolso previsto: as da linha de base oficial quando existe (o compromisso firmado,
 * com o orçado e as datas da foto, inclusive etapas excluídas depois); senão, as atuais.
 */
export function etapasDoDesembolso(
  atuais: EtapaDesembolso[],
  linhaBase: { etapas: { orcamentoCents: number; inicio: Dia | null; fim: Dia | null }[] } | null,
): { etapas: EtapaDesembolso[]; origem: "linha-base" | "plano-atual" } {
  if (!linhaBase) return { etapas: atuais, origem: "plano-atual" };
  return {
    etapas: linhaBase.etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, inicio: e.inicio, fim: e.fim })),
    origem: "linha-base",
  };
}

/** A coluna de uma obra no `realizadoPorMes` de todas (mês → obra → centavos). */
export function realizadoMensalDaObra(
  porMes: Map<string, Map<string, number>>,
  obraId: string,
): Map<string, number> {
  const coluna = new Map<string, number>();
  for (const [mes, porObra] of porMes) {
    const cents = porObra.get(obraId);
    if (cents !== undefined) coluna.set(mes, cents);
  }
  return coluna;
}
