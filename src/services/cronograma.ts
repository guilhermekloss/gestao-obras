import { BP_TOTAL } from "./rateio";
import { avancoPonderado } from "./obra";

/**
 * Cronograma físico: curva S prevista (linha de base das datas previstas das
 * etapas), curva S realizada (histórico de medições) e situação de cada etapa.
 *
 * Tudo aqui trabalha com dias no formato "aaaa-mm-dd" (`Dia`) e meses
 * "aaaa-mm" (`Mes`) — strings sem fuso horário. Quem lê do banco converte:
 * colunas `@db.Date` com `diaDoBanco` (componentes UTC) e datas de medição
 * (meio-dia local, ver `inputParaData`) com `dataParaInput` (componentes locais).
 *
 * O peso de cada etapa segue a mesma regra de `avancoPonderado`: orçamento
 * previsto; se nenhuma etapa tem orçamento, pesos iguais.
 */

export type Dia = string; // "aaaa-mm-dd"
type Mes = string; // "aaaa-mm"

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
  /** null nos meses posteriores ao mês corrente — o realizado ainda não existe. */
  realizadoBp: number | null;
};

export type SituacaoEtapa = "NAO_INICIADA" | "EM_DIA" | "ATRASADA" | "CONCLUIDA" | "SEM_DATAS";

export const ROTULO_SITUACAO: Record<SituacaoEtapa, string> = {
  NAO_INICIADA: "Não iniciada",
  EM_DIA: "Em dia",
  ATRASADA: "Atrasada",
  CONCLUIDA: "Concluída",
  SEM_DATAS: "Sem datas",
};

/** Folga tolerada entre o previsto até hoje e o realizado antes de marcar atraso (10 p.p.). */
const MARGEM_ATRASO_BP = 1000;

const MS_DIA = 86_400_000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Datas

/** Dia de uma coluna `@db.Date` (o Prisma devolve meia-noite UTC). */
export function diaDoBanco(data: Date): Dia {
  return data.toISOString().slice(0, 10);
}

/** Date para gravar numa coluna `@db.Date` (meia-noite UTC do dia). */
export function diaParaBanco(dia: Dia): Date {
  return new Date(`${dia}T00:00:00Z`);
}

/** "aaaa-mm-dd" válido de calendário (rejeita 2026-02-30). */
export function diaValido(dia: string): boolean {
  if (!RE_DIA.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

/** Número de dias desde 1970-01-01 — base de toda a aritmética de datas daqui. */
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

/** Meses de `de` a `ate`, inclusive. */
export function mesesEntre(de: Mes, ate: Mes): Mes[] {
  const meses: Mes[] = [];
  for (let m = de; m <= ate; m = proximoMes(m)) meses.push(m);
  return meses;
}

/** Valida as datas previstas de uma etapa: ambas opcionais, mas o fim não antecede o início. */
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

// ---------------------------------------------------------------------------
// Curva S

/**
 * % previsto de uma etapa ao fim do dia informado: distribuição linear pelos
 * dias corridos entre início e fim (inclusive). Etapa sem datas → 0.
 */
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

/**
 * % acumulado previsto da obra ao fim do dia. Etapas sem datas pesam, mas não
 * avançam — a curva prevista só chega a 100% quando todas as etapas têm datas.
 */
export function previstoNaData(etapas: EtapaPlano[], dia: Dia): number {
  return avancoPonderado(
    etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, percentBp: previstoEtapaNaData(e, dia) })),
  );
}

/** Último % medido de cada etapa até o dia informado (inclusive). */
export function realizadoPorEtapaNaData(medicoes: MedicaoPonto[], dia: Dia): Map<string, number> {
  const ordenadas = [...medicoes].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const mapa = new Map<string, number>();
  for (const m of ordenadas) {
    if (m.data > dia) break;
    mapa.set(m.etapaId, m.percentBp); // última vence
  }
  return mapa;
}

/** % acumulado realizado da obra até o dia, ponderado como `avancoPonderado`. */
export function realizadoNaData(etapas: EtapaPlano[], medicoes: MedicaoPonto[], dia: Dia): number {
  const porEtapa = realizadoPorEtapaNaData(medicoes, dia);
  return avancoPonderado(
    etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, percentBp: porEtapa.get(e.id) ?? 0 })),
  );
}

/**
 * Faixa de meses da curva S de uma obra: do primeiro início previsto (ou da
 * primeira medição, se anterior) até o último fim previsto — estendida até o
 * mês corrente enquanto a obra não chega a 100%, para o atraso aparecer, e até
 * a última medição. `null` quando nenhuma etapa tem datas.
 */
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
  // toda etapa com datas tem início ≤ fim, então de ≤ ate
  const de = mesDoDia(inicios.reduce((a, b) => (a < b ? a : b)));
  let ate = mesDoDia(fins.reduce((a, b) => (a > b ? a : b)));

  const mesHoje = mesDoDia(hoje);
  if (de <= mesHoje && ate < mesHoje && realizadoNaData(etapas, medicoes, hoje) < BP_TOTAL) {
    ate = mesHoje;
  }
  return { de, ate };
}

/**
 * Curva S mensal: % acumulado previsto ao fim de cada mês e realizado ao fim
 * de cada mês (no mês corrente, até hoje; nos meses futuros, null).
 * Sem `faixa`, usa `faixaDaCurvaS`; retorna [] quando não há datas.
 */
export function curvaS(
  etapas: EtapaPlano[],
  medicoes: MedicaoPonto[],
  hoje: Dia,
  faixa: { de: Mes; ate: Mes } | null = faixaDaCurvaS(etapas, medicoes, hoje),
): PontoCurvaS[] {
  if (!faixa) return [];
  const mesHoje = mesDoDia(hoje);
  return mesesEntre(faixa.de, faixa.ate).map((mes) => {
    const fimDoMes = ultimoDiaDoMes(mes);
    return {
      mes,
      previstoBp: previstoNaData(etapas, fimDoMes),
      realizadoBp:
        mes > mesHoje ? null : realizadoNaData(etapas, medicoes, mes === mesHoje ? hoje : fimDoMes),
    };
  });
}

/**
 * Agrega curvas S de várias obras (mesma faixa de meses) com a regra de
 * `avancoPonderado`: peso = orçamento total da obra; se nenhuma tem, pesos iguais.
 */
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

/** União das faixas de várias obras (para agregá-las num mesmo eixo). */
export function unirFaixas(faixas: ({ de: Mes; ate: Mes } | null)[]): { de: Mes; ate: Mes } | null {
  const validas = faixas.filter((f) => f !== null);
  if (validas.length === 0) return null;
  return {
    de: validas.map((f) => f.de).reduce((a, b) => (a < b ? a : b)),
    ate: validas.map((f) => f.ate).reduce((a, b) => (a > b ? a : b)),
  };
}

// ---------------------------------------------------------------------------
// Situação das etapas

/**
 * Situação da etapa hoje:
 * - CONCLUIDA: medida em 100% (com ou sem datas);
 * - SEM_DATAS: falta início ou fim previsto;
 * - ATRASADA: o fim previsto já passou sem 100%, ou o previsto até hoje supera
 *   o realizado em mais que `margemBp`;
 * - NAO_INICIADA: nada medido ainda (e dentro da margem);
 * - EM_DIA: o resto.
 */
export function situacaoEtapa(
  etapa: Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">,
  realizadoBp: number,
  hoje: Dia,
  margemBp = MARGEM_ATRASO_BP,
): SituacaoEtapa {
  if (realizadoBp >= BP_TOTAL) return "CONCLUIDA";
  if (!temDatas(etapa)) return "SEM_DATAS";
  if (hoje > etapa.fimPrevisto) return "ATRASADA";
  if (previstoEtapaNaData(etapa, hoje) - realizadoBp > margemBp) return "ATRASADA";
  if (realizadoBp === 0) return "NAO_INICIADA";
  return "EM_DIA";
}

// ---------------------------------------------------------------------------
// Gantt

export type EscalaGantt = {
  inicio: Dia;
  fim: Dia;
  totalDias: number;
  meses: { mes: Mes; esquerdaPct: number; larguraPct: number }[];
  /** Posição do marcador de hoje; null quando hoje está fora da escala. */
  hojePct: number | null;
};

/** Até quantos meses depois do fim previsto o eixo se estende para mostrar o hoje. */
const MESES_EXTENSAO_HOJE = 12;

/**
 * Eixo de tempo do Gantt: meses inteiros do primeiro início ao último fim
 * previsto, estendido até o mês corrente se a obra estiver além do plano (até
 * 12 meses). `null` quando nenhuma etapa tem datas.
 */
export function escalaGantt(
  etapas: Pick<EtapaPlano, "inicioPrevisto" | "fimPrevisto">[],
  hoje: Dia,
): EscalaGantt | null {
  const comDatas = etapas.filter(temDatas);
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
  // o marcador fica no meio do dia de hoje
  const hojePct = nHoje >= 0 && nHoje < totalDias ? pct(nHoje + 0.5) : null;

  return { inicio, fim, totalDias, meses, hojePct };
}

/** Posição (em % da largura do eixo) da barra de uma etapa de `inicio` a `fim`, inclusive. */
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

/** Duração em dias corridos (inclusive) — para exibição. */
export function duracaoEmDias(inicio: Dia, fim: Dia): number {
  return numeroDoDia(fim) - numeroDoDia(inicio) + 1;
}

/** Peso de cada etapa na obra em basis points (mesma regra de `avancoPonderado`) — exibição sem R$. */
export function pesosDasEtapas(etapas: { id: string; orcamentoCents: number }[]): Map<string, number> {
  const total = etapas.reduce((a, e) => a + e.orcamentoCents, 0);
  return new Map(
    etapas.map((e) => [
      e.id,
      total === 0 ? Math.round(BP_TOTAL / etapas.length) : Math.round((e.orcamentoCents / total) * BP_TOTAL),
    ]),
  );
}
