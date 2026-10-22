import { prisma } from "@/lib/prisma";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { JANELA_REINCIDENCIA_MS, RETENCAO_TENTATIVAS_DIAS, faixasDeIp, ipConfiavel } from "@/services/protecao-login";
import { REGRAS, RETENCAO_INFRACOES_DIAS, duracaoDaRegra, limiteDaRegraAtingido, type RegraAtiva } from "@/services/protecao-ativa";

const FAIXAS_CONFIAVEIS = faixasDeIp(process.env.IPS_CONFIAVEIS ?? "");

// ignoreip: IP confiável (escritório) não entra nas regras por IP. Sem IP (dev local), a regra por IP não se aplica.
export function ipVigiado(ip: string | null): string | null {
  return ip && !ipConfiavel(ip, FAIXAS_CONFIAVEIS) ? ip : null;
}

export async function bloqueioAtivo(regras: string[], chaves: string[]) {
  if (chaves.length === 0) return null;
  return prisma.bloqueio.findFirst({
    where: { regra: { in: regras }, chave: { in: chaves }, ate: { gt: new Date() }, liberadoEm: null },
    orderBy: { ate: "desc" },
    select: { regra: true, ate: true },
  });
}

// Bloqueios da mesma regra e chave nas últimas 24 h, sem os que o admin liberou: base do bloqueio progressivo.
export async function bloqueiosRecentes(regra: string, chave: string, agora: Date): Promise<number> {
  return prisma.bloqueio.count({
    where: { regra, chave, liberadoEm: null, criadoEm: { gt: new Date(agora.getTime() - JANELA_REINCIDENCIA_MS) } },
  });
}

export async function ultimoBloqueio(regra: string, chave: string) {
  return prisma.bloqueio.findFirst({ where: { regra, chave }, orderBy: { criadoEm: "desc" }, select: { criadoEm: true } });
}

// Grava a ocorrência e, se ela fecha o limite, cria o bloqueio. Devolve até quando bloqueou (ou null).
export async function registrarInfracao(regra: RegraAtiva, chave: string): Promise<Date | null> {
  const def = REGRAS[regra];
  await prisma.infracao.create({ data: { regra, chave } });

  const agora = new Date();
  const [ocorrencias, ultimo] = await Promise.all([
    prisma.infracao.findMany({
      where: { regra, chave, criadoEm: { gt: new Date(agora.getTime() - def.janelaMs) } },
      select: { criadoEm: true },
    }),
    ultimoBloqueio(regra, chave),
  ]);
  if (!limiteDaRegraAtingido(regra, ocorrencias.map((o) => o.criadoEm), agora, ultimo?.criadoEm)) return null;

  const anteriores = await bloqueiosRecentes(regra, chave, agora);
  const ate = new Date(agora.getTime() + duracaoDaRegra(regra, anteriores));
  await prisma.bloqueio.create({ data: { regra, chave, ate, motivo: def.motivo } });
  eventoSeguranca("bloqueio_aplicado", { regra, chave, ate: ate.toISOString(), reincidencia: anteriores });
  return ate;
}

// Limite de uso (IA, OCR): recusa se já bloqueado; senão conta este uso. A chamada que fecha o limite ainda passa.
export async function consumirLimite(regra: RegraAtiva, chave: string): Promise<void> {
  if (await bloqueioAtivo([regra], [chave])) throw new Error(REGRAS[regra].mensagem);
  await registrarInfracao(regra, chave);
}

export async function limparRegistrosDeProtecao(agora: Date = new Date()) {
  const dias = (n: number) => ({ criadoEm: { lt: new Date(agora.getTime() - n * 86_400_000) } });
  await Promise.all([
    prisma.tentativaLogin.deleteMany({ where: dias(RETENCAO_TENTATIVAS_DIAS) }),
    prisma.bloqueio.deleteMany({ where: dias(RETENCAO_TENTATIVAS_DIAS) }),
    prisma.infracao.deleteMany({ where: dias(RETENCAO_INFRACOES_DIAS) }),
  ]);
}
