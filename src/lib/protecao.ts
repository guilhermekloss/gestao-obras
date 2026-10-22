import { prisma } from "@/lib/prisma";
import { eventoSeguranca } from "@/lib/log-seguranca";
import {
  JANELA_REINCIDENCIA_MS,
  RETENCAO_TENTATIVAS_DIAS,
  faixasDeIp,
  ipConfiavel,
  ipDoCliente,
} from "@/services/protecao-login";
import {
  REGRAS,
  REGRAS_DO_SITE,
  RETENCAO_INFRACOES_DIAS,
  contaParaRecidiva,
  duracaoDaRegra,
  limiteDaRegraAtingido,
  type RegraAtiva,
} from "@/services/protecao-ativa";

const FAIXAS_CONFIAVEIS = faixasDeIp(process.env.IPS_CONFIAVEIS ?? "");
const SALTOS_PROXY = Number(process.env.PROXY_SALTOS ?? 1) || 1;

export function ipDosCabecalhos(cabecalhos: Headers): string | null {
  return ipDoCliente(cabecalhos.get("x-forwarded-for"), SALTOS_PROXY);
}

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

// Único lugar que cria bloqueio automático: registra o evento e, para IP, confere a recidiva.
export async function aplicarBloqueio(
  regra: string,
  chave: string,
  ate: Date,
  motivo: string,
  dados: Record<string, string | number | boolean | null> = {},
) {
  await prisma.bloqueio.create({ data: { regra, chave, ate, motivo } });
  esquecerIpDoCache(chave);
  eventoSeguranca("bloqueio_aplicado", { regra, chave, ate: ate.toISOString(), ...dados });
  if (contaParaRecidiva(regra)) await avaliarRecidiva(chave);
}

// recidive: 3 bloqueios do mesmo IP em 24 h, por qualquer regra, tiram o IP do site (24 h; 7 dias se repetir).
async function avaliarRecidiva(ip: string) {
  const agora = new Date();
  const desde = new Date(agora.getTime() - REGRAS.recidiva.janelaMs);
  const [bloqueios, ultimo] = await Promise.all([
    prisma.bloqueio.findMany({
      where: { chave: ip, liberadoEm: null, criadoEm: { gt: desde }, regra: { notIn: ["recidiva", "manual"] } },
      select: { criadoEm: true },
    }),
    ultimoBloqueio("recidiva", ip),
  ]);
  if (!limiteDaRegraAtingido("recidiva", bloqueios.map((b) => b.criadoEm), agora, ultimo?.criadoEm)) return;
  const anteriores = await prisma.bloqueio.count({
    where: { regra: "recidiva", chave: ip, liberadoEm: null, criadoEm: { gt: new Date(agora.getTime() - 7 * 86_400_000) } },
  });
  const ate = new Date(agora.getTime() + duracaoDaRegra("recidiva", anteriores));
  await prisma.bloqueio.create({ data: { regra: "recidiva", chave: ip, ate, motivo: REGRAS.recidiva.motivo } });
  esquecerIpDoCache(ip);
  eventoSeguranca("bloqueio_aplicado", { regra: "recidiva", chave: ip, ate: ate.toISOString(), reincidencia: anteriores });
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
  await aplicarBloqueio(regra, chave, ate, def.motivo, { reincidencia: anteriores });
  return ate;
}

// Cache curto por instância para o proxy.ts não ir ao banco em toda navegação. O Next não garante que o módulo
// do proxy fique vivo entre requisições: sem cache, só consulta mais vezes. Liberação demora até CACHE_MS a valer.
const CACHE_MS = 30_000;
const cacheDoSite = new Map<string, { ate: number | null; valeAte: number }>();

export async function ipForaDoSite(ip: string): Promise<boolean> {
  const agora = Date.now();
  const guardado = cacheDoSite.get(ip);
  if (guardado && guardado.valeAte > agora) return guardado.ate !== null && guardado.ate > agora;

  const bloqueio = await bloqueioAtivo(REGRAS_DO_SITE, [ip]);
  if (cacheDoSite.size > 10_000) cacheDoSite.clear();
  cacheDoSite.set(ip, { ate: bloqueio?.ate.getTime() ?? null, valeAte: agora + CACHE_MS });
  return bloqueio !== null;
}

export function esquecerIpDoCache(ip: string) {
  cacheDoSite.delete(ip);
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
