import { REGRA_LOGIN } from "./protecao-login";

// "Jails" além do login (que tem regra própria em protecao-login.ts: login certo zera as falhas).
// falha = sinal de abuso (link inválido, arquivo falso); uso = limite de custo (IA, OCR), conta toda chamada.
export type RegraAtiva = "convite" | "upload" | "sefaz" | "assistente" | "leitura";

type DefinicaoRegra = {
  rotulo: string;
  chave: "ip" | "usuario";
  tipo: "falha" | "uso";
  max: number;
  janelaMs: number;
  // cresce a cada reincidência em 24 h e para no último
  duracoesMs: readonly number[];
  motivo: string;
  // vai para a tela de quem foi barrado
  mensagem: string;
};

const MIN = 60_000;

export const REGRAS: Record<RegraAtiva, DefinicaoRegra> = {
  convite: {
    rotulo: "Links de convite",
    chave: "ip",
    tipo: "falha",
    max: 10,
    janelaMs: 15 * MIN,
    duracoesMs: [15 * MIN, 60 * MIN, 6 * 60 * MIN, 24 * 60 * MIN],
    motivo: "10 links de convite inexistentes em 15 min",
    mensagem: "Muitos links de convite inválidos a partir desta rede. Aguarde e tente de novo.",
  },
  upload: {
    rotulo: "Envio de arquivos",
    chave: "usuario",
    tipo: "falha",
    max: 10,
    janelaMs: 10 * MIN,
    duracoesMs: [30 * MIN, 2 * 60 * MIN, 6 * 60 * MIN],
    motivo: "10 arquivos recusados (formato falso) em 10 min",
    mensagem: "Muitos arquivos recusados seguidos. Aguarde alguns minutos e tente de novo.",
  },
  sefaz: {
    rotulo: "Gatilho da Sefaz",
    chave: "ip",
    tipo: "falha",
    max: 5,
    janelaMs: 60 * MIN,
    duracoesMs: [60 * MIN, 6 * 60 * MIN, 24 * 60 * MIN],
    motivo: "5 chamadas sem autorização à captura da Sefaz em 1 h",
    mensagem: "Muitas tentativas",
  },
  assistente: {
    rotulo: "Assistente com IA",
    chave: "usuario",
    tipo: "uso",
    max: 20,
    janelaMs: 10 * MIN,
    duracoesMs: [10 * MIN],
    motivo: "20 perguntas ao assistente em 10 min",
    mensagem: "Você fez muitas perguntas seguidas. Aguarde alguns minutos.",
  },
  leitura: {
    rotulo: "Leitura de notas",
    chave: "usuario",
    tipo: "uso",
    max: 30,
    janelaMs: 10 * MIN,
    duracoesMs: [10 * MIN],
    motivo: "30 leituras automáticas de documento em 10 min",
    mensagem: "Você pediu muitas leituras de documento seguidas. Aguarde alguns minutos.",
  },
};

export const RETENCAO_INFRACOES_DIAS = 7;

export const ROTULO_REGRA: Record<string, string> = {
  [REGRA_LOGIN.email]: "Login (e-mail)",
  [REGRA_LOGIN.ip]: "Login (IP)",
  ...Object.fromEntries(Object.entries(REGRAS).map(([regra, d]) => [regra, d.rotulo])),
};

export function regraAtiva(regra: string): regra is RegraAtiva {
  return Object.hasOwn(REGRAS, regra);
}

// `desde`: último bloqueio da mesma regra e chave — o que já rendeu bloqueio (ou foi liberado) não conta de novo.
export function limiteDaRegraAtingido(regra: RegraAtiva, ocorrencias: Date[], agora: Date = new Date(), desde?: Date | null): boolean {
  const corte = Math.max(agora.getTime() - REGRAS[regra].janelaMs, desde?.getTime() ?? -Infinity);
  return ocorrencias.filter((d) => d.getTime() > corte).length >= REGRAS[regra].max;
}

// `anteriores` = bloqueios da mesma regra e chave nas últimas 24 h que o admin não liberou.
export function duracaoDaRegra(regra: RegraAtiva, anteriores: number): number {
  const duracoes = REGRAS[regra].duracoesMs;
  return duracoes[Math.min(Math.max(0, anteriores), duracoes.length - 1)];
}
