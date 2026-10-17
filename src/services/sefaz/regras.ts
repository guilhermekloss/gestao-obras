// Política de uso do NFeDistribuicaoDFe (NT 2014.002). Quem descumpre leva cStat 656 e o CNPJ fica bloqueado por 1 h.
// - a consulta parte sempre do ultNSU devolvido na resposta anterior;
// - fim da fila (ultNSU == maxNSU) ou 137 (nada novo): esperar 1 h antes de consultar de novo;
// - 656: esperar o bloqueio passar (voltar antes reinicia a contagem).

const MINUTO = 60 * 1000;

/** Folga de 1 min sobre a 1 h da regra: relógio da Sefaz e do Cloud Scheduler não batem ao segundo. */
export const ESPERA_FIM_DA_FILA_MS = 61 * MINUTO;
export const ESPERA_BLOQUEIO_MS = 65 * MINUTO;
/** Depois de uma falha (rede, Sefaz fora do ar): não insiste a cada aba aberta nem enche o histórico de erros. */
export const ESPERA_APOS_FALHA_MS = 10 * MINUTO;
/** Cada lote traz até 50 documentos; o limite segura a execução dentro do timeout do Cloud Run. */
export const MAX_LOTES_POR_EXECUCAO = 8;
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
