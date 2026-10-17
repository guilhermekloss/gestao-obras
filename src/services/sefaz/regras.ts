// Política de uso do NFeDistribuicaoDFe (NT 2014.002). Quem descumpre leva cStat 656 e o CNPJ fica bloqueado por 1 h.
// - a consulta parte sempre do ultNSU devolvido na resposta anterior;
// - fim da fila (ultNSU == maxNSU) ou 137 (nada novo): esperar 1 h antes de consultar de novo;
// - 656: esperar o bloqueio passar (voltar antes reinicia a contagem).

const MINUTO = 60 * 1000;

/** Folga de 1 min sobre a 1 h da regra: relógio da Sefaz e do Cloud Scheduler não batem ao segundo. */
export const ESPERA_FIM_DA_FILA_MS = 61 * MINUTO;
export const ESPERA_BLOQUEIO_MS = 65 * MINUTO;
/** Depois de uma falha (rede, Sefaz fora do ar): tenta de novo só daqui a 1 h, sem insistir a cada aba aberta. */
export const ESPERA_APOS_FALHA_MS = 60 * MINUTO;
/** Cada lote traz até 50 documentos; o limite segura a execução dentro do timeout do Cloud Run. */
export const MAX_LOTES_POR_EXECUCAO = 8;
/** Parou no limite com fila ainda: o resto sai numa próxima execução, nunca antes de 1 h (a Sefaz bloqueia pressa). */
export const ESPERA_FILA_RESTANTE_MS = 61 * MINUTO;
/** Validade da trava de execução: passa do pior caso (lotes × timeout + Ciência), some sozinha se a instância morrer. */
export const DURACAO_TRAVA_MS = 6 * MINUTO;
/** A Sefaz aceita até 20 eventos por lote de envio. */
export const MAX_CIENCIAS_POR_EXECUCAO = 20;

export const NSU_ZERO = "000000000000000";

export function normalizarNsu(nsu: string | undefined | null): string {
  return (nsu ?? "").replace(/\D/g, "").padStart(15, "0");
}

export function compararNsu(a: string, b: string): number {
  const x = BigInt(normalizarNsu(a));
  const y = BigInt(normalizarNsu(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

type JanelaCursor = { proximaConsultaEm: Date | null; bloqueadoAte: Date | null };

export type Permissao =
  | { pode: true }
  | { pode: false; motivo: "BLOQUEADO" | "AGUARDANDO"; ate: Date };

export function podeConsultar(cursor: JanelaCursor, agora: Date): Permissao {
  if (cursor.bloqueadoAte && cursor.bloqueadoAte > agora) {
    return { pode: false, motivo: "BLOQUEADO", ate: cursor.bloqueadoAte };
  }
  if (cursor.proximaConsultaEm && cursor.proximaConsultaEm > agora) {
    return { pode: false, motivo: "AGUARDANDO", ate: cursor.proximaConsultaEm };
  }
  return { pode: true };
}

export type RespostaDistribuicao = { cStat: string; ultNsu: string; maxNsu: string };

export type Avaliacao = {
  /** Guarda o ultNSU/maxNSU devolvidos como novo ponto de partida. */
  avancar: boolean;
  /** Ainda há documentos na fila: pode pedir o próximo lote agora. */
  continuar: boolean;
  proximaConsultaEm: Date | null;
  bloqueadoAte: Date | null;
  desfecho: "OK" | "BLOQUEADA" | "REJEITADA";
};

export function avaliarResposta(r: RespostaDistribuicao, agora: Date): Avaliacao {
  const depois = (ms: number) => new Date(agora.getTime() + ms);
  if (r.cStat === "138") {
    const continuar = compararNsu(r.ultNsu, r.maxNsu) < 0;
    return {
      avancar: true,
      continuar,
      proximaConsultaEm: continuar ? null : depois(ESPERA_FIM_DA_FILA_MS),
      bloqueadoAte: null,
      desfecho: "OK",
    };
  }
  if (r.cStat === "137") {
    return {
      avancar: true,
      continuar: false,
      proximaConsultaEm: depois(ESPERA_FIM_DA_FILA_MS),
      bloqueadoAte: null,
      desfecho: "OK",
    };
  }
  if (r.cStat === "656") {
    const ate = depois(ESPERA_BLOQUEIO_MS);
    return { avancar: false, continuar: false, proximaConsultaEm: ate, bloqueadoAte: ate, desfecho: "BLOQUEADA" };
  }
  // rejeição (certificado, CNPJ, schema...): não insiste antes da próxima janela
  return {
    avancar: false,
    continuar: false,
    proximaConsultaEm: depois(ESPERA_FIM_DA_FILA_MS),
    bloqueadoAte: null,
    desfecho: "REJEITADA",
  };
}

/** Ciência registrada (135/136) ou já registrada antes (573, duplicidade) contam como feitas. */
export function cienciaAceita(cStat: string): boolean {
  return cStat === "135" || cStat === "136" || cStat === "573";
}

// Agenda da busca automática: horários fixos de Brasília (UTC−3, sem horário de verão desde 2019).
// Uma ou duas consultas por dia ficam muito acima do piso de 1 h da Sefaz, custam pouco e não perdem nota:
// a Sefaz guarda 90 dias de documentos.

export type Frequencia = "UMA_VEZ_DIA" | "DUAS_VEZES_DIA";

export const HORARIOS_BRASILIA: Record<Frequencia, number[]> = {
  UMA_VEZ_DIA: [7],
  DUAS_VEZES_DIA: [7, 14],
};

export const FREQUENCIA_LABELS: Record<Frequencia, string> = {
  UMA_VEZ_DIA: "Uma vez ao dia (07:00)",
  DUAS_VEZES_DIA: "Duas vezes ao dia (07:00 e 14:00)",
};

const BRASILIA_MENOS_UTC_H = 3;

/** Horários programados dos 3 dias em volta de `agora`, em ordem. */
function horariosProgramados(frequencia: Frequencia, agora: Date): Date[] {
  const dia0 = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const lista: Date[] = [];
  for (const deslocamento of [-1, 0, 1]) {
    for (const h of HORARIOS_BRASILIA[frequencia]) {
      lista.push(new Date(dia0 + deslocamento * 24 * 60 * MINUTO + (h + BRASILIA_MENOS_UTC_H) * 60 * MINUTO));
    }
  }
  return lista.sort((a, b) => a.getTime() - b.getTime());
}

export function ultimoHorarioProgramado(frequencia: Frequencia, agora: Date): Date {
  return horariosProgramados(frequencia, agora).filter((h) => h <= agora).pop()!;
}

export function proximoHorarioProgramado(frequencia: Frequencia, agora: Date): Date {
  return horariosProgramados(frequencia, agora).find((h) => h > agora)!;
}

/** Já passou um horário programado desde a última resposta da Sefaz? Nunca consultada conta como devida. */
export function consultaProgramadaDevida(frequencia: Frequencia, ultimaConsultaEm: Date | null, agora: Date): boolean {
  if (!ultimaConsultaEm) return true;
  return ultimoHorarioProgramado(frequencia, agora) > ultimaConsultaEm;
}
