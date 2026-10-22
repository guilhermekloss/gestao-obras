import { BP_TOTAL } from "./rateio";
import { avancoPonderado } from "./obra";

// Dias são strings sem fuso: `@db.Date` entra por diaDoBanco (UTC); medições (meio-dia local) por dataParaInput.

export type Dia = string;
type Mes = string;

export type EtapaPlano = {
  id: string;
  orcamentoCents: number;
  inicioPrevisto: Dia | null;
  fimPrevisto: Dia | null;
};

export type MedicaoPonto = { etapaId: string; data: Dia; percentBp: number };

export type PontoCurvaS = {
  mes: Mes;
  previstoBp: number;
  realizadoBp: number | null;
};

export type SituacaoEtapa = "NAO_INICIADA" | "EM_DIA" | "ATENCAO" | "ATRASADA" | "CONCLUIDA" | "SEM_DATAS";

export const ROTULO_SITUACAO: Record<SituacaoEtapa, string> = {
  NAO_INICIADA: "Não iniciada",
  EM_DIA: "Em dia",
  ATENCAO: "Atenção",
  ATRASADA: "Atrasada",
  CONCLUIDA: "Concluída",
  SEM_DATAS: "Sem datas",
};

/** Atraso (previsto − realizado) acima disto deixa a etapa Atrasada: 10 p.p. */
export const MARGEM_ATRASO_BP = 1000;
/** Atraso acima disto (e até MARGEM_ATRASO_BP) deixa a etapa em Atenção: 5 p.p. */
export const MARGEM_ATENCAO_BP = 500;

const MS_DIA = 86_400_000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

// @db.Date vem como meia-noite UTC, então aqui toISOString dá o dia certo.
export function diaDoBanco(data: Date): Dia {
  return data.toISOString().slice(0, 10);
}

export function diaParaBanco(dia: Dia): Date {
  return new Date(`${dia}T00:00:00Z`);
}

export function diaValido(dia: string): boolean {
  if (!RE_DIA.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

function numeroDoDia(dia: Dia): number {
  return Math.round(Date.parse(`${dia}T00:00:00Z`) / MS_DIA);
}

function mesDoDia(dia: Dia): Mes {
  return dia.slice(0, 7);
}

function primeiroDiaDoMes(mes: Mes): Dia {
  return `${mes}-01`;
}

function ultimoDiaDoMes(mes: Mes): Dia {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
}

function proximoMes(mes: Mes): Mes {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
}

export function mesesEntre(de: Mes, ate: Mes): Mes[] {
  const meses: Mes[] = [];
  for (let m = de; m <= ate; m = proximoMes(m)) meses.push(m);
  return meses;
}

export function validarDatasEtapa(
  inicio: string | null,
  fim: string | null,
): { ok: boolean; erro?: string } {
  if (inicio && !diaValido(inicio)) return { ok: false, erro: "Data de início inválida" };
  if (fim && !diaValido(fim)) return { ok: false, erro: "Data de fim inválida" };
  if (inicio && fim && fim < inicio) {
    return { ok: false, erro: "O fim previsto não pode ser anterior ao início" };
  }
  return { ok: true };
}

function temDatas<E extends Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">>(
  e: E,
): e is E & { inicioPrevisto: Dia; fimPrevisto: Dia } {
  return !!e.inicioPrevisto && !!e.fimPrevisto && e.fimPrevisto >= e.inicioPrevisto;
}

export function previstoEtapaNaData(
  etapa: Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">,
  dia: Dia,
): number {
  if (!temDatas(etapa)) return 0;
  const ini = numeroDoDia(etapa.inicioPrevisto);
  const duracao = numeroDoDia(etapa.fimPrevisto) - ini + 1;
  const decorridos = numeroDoDia(dia) - ini + 1;
  if (decorridos <= 0) return 0;
  if (decorridos >= duracao) return BP_TOTAL;
  return Math.round((decorridos / duracao) * BP_TOTAL);
}

// Etapas sem datas pesam mas não avançam: o previsto só chega a 100% quando todas têm datas.
export function previstoNaData(etapas: EtapaPlano[], dia: Dia): number {
  return avancoPonderado(
    etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, percentBp: previstoEtapaNaData(e, dia) })),
  );
}

export function realizadoPorEtapaNaData(medicoes: MedicaoPonto[], dia: Dia): Map<string, number> {
  const ordenadas = [...medicoes].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const mapa = new Map<string, number>();
  for (const m of ordenadas) {
    if (m.data > dia) break;
    mapa.set(m.etapaId, m.percentBp);
  }
  return mapa;
}

export function realizadoNaData(etapas: EtapaPlano[], medicoes: MedicaoPonto[], dia: Dia): number {
  const porEtapa = realizadoPorEtapaNaData(medicoes, dia);
  return avancoPonderado(
    etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, percentBp: porEtapa.get(e.id) ?? 0 })),
  );
}

// Estendida até o mês corrente enquanto a obra não chega a 100%, para o atraso aparecer.
export function faixaDaCurvaS(
  etapas: EtapaPlano[],
  medicoes: MedicaoPonto[],
  hoje: Dia,
): { de: Mes; ate: Mes } | null {
  const comDatas = etapas.filter(temDatas);
  if (comDatas.length === 0) return null;

  const etapaIds = new Set(etapas.map((e) => e.id));
  const datasMedicao = medicoes.filter((m) => etapaIds.has(m.etapaId)).map((m) => m.data);

  const inicios = [...comDatas.map((e) => e.inicioPrevisto), ...datasMedicao];
  const fins = [...comDatas.map((e) => e.fimPrevisto), ...datasMedicao.filter((d) => d <= hoje)];
  const de = mesDoDia(inicios.reduce((a, b) => (a < b ? a : b)));
  let ate = mesDoDia(fins.reduce((a, b) => (a > b ? a : b)));

  const mesHoje = mesDoDia(hoje);
  if (de <= mesHoje && ate < mesHoje && realizadoNaData(etapas, medicoes, hoje) < BP_TOTAL) {
    ate = mesHoje;
  }
  return { de, ate };
}

// Com `base` (linha de base), o previsto vem dela e a faixa cobre também as datas dela;
// o realizado continua pesado pelas etapas atuais.
export function curvaS(
  etapas: EtapaPlano[],
  medicoes: MedicaoPonto[],
  hoje: Dia,
  faixa?: { de: Mes; ate: Mes } | null,
  base?: EtapaPlano[] | null,
): PontoCurvaS[] {
  const meses =
    faixa !== undefined
      ? faixa
      : unirFaixas([faixaDaCurvaS(etapas, medicoes, hoje), base ? faixaDaCurvaS(base, medicoes, hoje) : null]);
  if (!meses) return [];
  const plano = base ?? etapas;
  const mesHoje = mesDoDia(hoje);
  return mesesEntre(meses.de, meses.ate).map((mes) => {
    const fimDoMes = ultimoDiaDoMes(mes);
    return {
      mes,
      previstoBp: previstoNaData(plano, fimDoMes),
      realizadoBp:
        mes > mesHoje ? null : realizadoNaData(etapas, medicoes, mes === mesHoje ? hoje : fimDoMes),
    };
  });
}

export function agregarCurvasS(
  obras: { orcamentoCents: number; curva: PontoCurvaS[] }[],
): PontoCurvaS[] {
  if (obras.length === 0) return [];
  return obras[0].curva.map((ponto, i) => {
    const previstoBp = avancoPonderado(
      obras.map((o) => ({ orcamentoCents: o.orcamentoCents, percentBp: o.curva[i]?.previstoBp ?? 0 })),
    );
    const realizadoBp =
      ponto.realizadoBp === null
        ? null
        : avancoPonderado(
            obras.map((o) => ({
              orcamentoCents: o.orcamentoCents,
              percentBp: o.curva[i]?.realizadoBp ?? 0,
            })),
          );
    return { mes: ponto.mes, previstoBp, realizadoBp };
  });
}

export function unirFaixas(faixas: ({ de: Mes; ate: Mes } | null)[]): { de: Mes; ate: Mes } | null {
  const validas = faixas.filter((f) => f !== null);
  if (validas.length === 0) return null;
  return {
    de: validas.map((f) => f.de).reduce((a, b) => (a < b ? a : b)),
    ate: validas.map((f) => f.ate).reduce((a, b) => (a > b ? a : b)),
  };
}

// ATRASADA: fim previsto passou sem 100%, ou o previsto até hoje supera o realizado em mais que margemBp (10 p.p.).
// ATENCAO: atraso acima de margemAtencaoBp (5 p.p.) e até margemBp. Exatamente 5 p.p. ainda é Em dia; 10 p.p., Atenção.
export function situacaoEtapa(
  etapa: Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">,
  realizadoBp: number,
  hoje: Dia,
  margemBp = MARGEM_ATRASO_BP,
  margemAtencaoBp = MARGEM_ATENCAO_BP,
): SituacaoEtapa {
  if (realizadoBp >= BP_TOTAL) return "CONCLUIDA";
  if (!temDatas(etapa)) return "SEM_DATAS";
  if (hoje > etapa.fimPrevisto) return "ATRASADA";
  const atraso = previstoEtapaNaData(etapa, hoje) - realizadoBp;
  if (atraso > margemBp) return "ATRASADA";
  if (atraso > margemAtencaoBp) return "ATENCAO";
  if (realizadoBp === 0) return "NAO_INICIADA";
  return "EM_DIA";
}

/** Desvio do realizado em relação ao previsto, em pontos-base: negativo = atrás do previsto. */
export function desvioBp(previstoBp: number, realizadoBp: number): number {
  return realizadoBp - previstoBp;
}

/**
 * Índice de desempenho de prazo (IDP): realizado ÷ previsto, em base 10000 (10000 = 1,00).
 * Abaixo de 10000 a obra anda mais devagar que o planejado. `null` quando nada estava previsto ainda.
 */
export function idp(realizadoBp: number, previstoBp: number): number | null {
  if (previstoBp <= 0) return null;
  return Math.round((realizadoBp / previstoBp) * BP_TOTAL);
}

/** Dias entre a data da linha de base e a atual: positivo = atrasou (foi para depois), negativo = adiantou. */
export function variacaoDias(atual: Dia | null, base: Dia | null): number | null {
  if (!atual || !base) return null;
  return numeroDoDia(atual) - numeroDoDia(base);
}

export type EscalaGantt = {
  inicio: Dia;
  fim: Dia;
  totalDias: number;
  meses: { mes: Mes; esquerdaPct: number; larguraPct: number }[];
  hojePct: number | null;
};

const MESES_EXTENSAO_HOJE = 12;

// `base`: datas da linha de base, para a barra dela caber no eixo.
export function escalaGantt(
  etapas: Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">[],
  hoje: Dia,
  base: Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">[] = [],
): EscalaGantt | null {
  const comDatas = [...etapas, ...base].filter(temDatas);
  if (comDatas.length === 0) return null;

  const mesIni = mesDoDia(comDatas.map((e) => e.inicioPrevisto).reduce((a, b) => (a < b ? a : b)));
  let mesFim = mesDoDia(comDatas.map((e) => e.fimPrevisto).reduce((a, b) => (a > b ? a : b)));
  const mesHoje = mesDoDia(hoje);
  if (mesHoje > mesFim && mesesEntre(mesFim, mesHoje).length - 1 <= MESES_EXTENSAO_HOJE) {
    mesFim = mesHoje;
  }

  const inicio = primeiroDiaDoMes(mesIni);
  const fim = ultimoDiaDoMes(mesFim);
  const n0 = numeroDoDia(inicio);
  const totalDias = numeroDoDia(fim) - n0 + 1;
  const pct = (dias: number) => (dias / totalDias) * 100;

  const meses = mesesEntre(mesIni, mesFim).map((mes) => {
    const a = numeroDoDia(primeiroDiaDoMes(mes)) - n0;
    const b = numeroDoDia(ultimoDiaDoMes(mes)) - n0 + 1;
    return { mes, esquerdaPct: pct(a), larguraPct: pct(b - a) };
  });

  const nHoje = numeroDoDia(hoje) - n0;
  const hojePct = nHoje >= 0 && nHoje < totalDias ? pct(nHoje + 0.5) : null;

  return { inicio, fim, totalDias, meses, hojePct };
}

export function posicaoNoGantt(
  escala: EscalaGantt,
  inicio: Dia,
  fim: Dia,
): { esquerdaPct: number; larguraPct: number } {
  const n0 = numeroDoDia(escala.inicio);
  const a = Math.max(0, numeroDoDia(inicio) - n0);
  const b = Math.min(escala.totalDias, numeroDoDia(fim) - n0 + 1);
  return {
    esquerdaPct: (a / escala.totalDias) * 100,
    larguraPct: (Math.max(0, b - a) / escala.totalDias) * 100,
  };
}

export function duracaoEmDias(inicio: Dia, fim: Dia): number {
  return numeroDoDia(fim) - numeroDoDia(inicio) + 1;
}

export function pesosDasEtapas(etapas: { id: string; orcamentoCents: number }[]): Map<string, number> {
  const total = etapas.reduce((a, e) => a + e.orcamentoCents, 0);
  return new Map(
    etapas.map((e) => [
      e.id,
      total === 0 ? Math.round(BP_TOTAL / etapas.length) : Math.round((e.orcamentoCents / total) * BP_TOTAL),
    ]),
  );
}
