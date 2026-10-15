/**
 * Proteção do login contra força bruta e "credential stuffing". As regras são
 * puras; quem consulta e grava as tentativas (`TentativaLogin`) é `lib/auth.ts`.
 *
 * - Por e-mail: 5 falhas seguidas em 15 minutos bloqueiam aquele e-mail até a
 *   falha mais antiga da janela sair dela. Um login certo zera a contagem.
 * - Por IP: 30 falhas em 15 minutos bloqueiam o IP (vários e-mails tentados da
 *   mesma origem). O limite é folgado porque o escritório inteiro sai por um IP só.
 *
 * O bloqueio vale também para e-mails que não existem, para a resposta não
 * revelar quais contas existem.
 */
export const JANELA_MS = 15 * 60 * 1000;
export const MAX_FALHAS_EMAIL = 5;
export const MAX_FALHAS_IP = 30;
/** Tentativas guardadas por 90 dias (investigação de incidente); as mais antigas são apagadas. */
export const RETENCAO_TENTATIVAS_DIAS = 90;

type Tentativa = { sucesso: boolean; criadoEm: Date };

type SituacaoLogin = { bloqueado: false } | { bloqueado: true; liberaEm: Date; motivo: "email" | "ip" };

/**
 * `doEmail`: tentativas do e-mail dentro da janela (qualquer ordem).
 * `falhasDoIp`: datas das falhas do IP dentro da janela.
 */
export function situacaoLogin(doEmail: Tentativa[], falhasDoIp: Date[], agora: Date = new Date()): SituacaoLogin {
  const inicio = agora.getTime() - JANELA_MS;
  const recentes = doEmail.filter((t) => t.criadoEm.getTime() > inicio).sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  const ultimoSucesso = recentes.findLast((t) => t.sucesso);
  const falhas = recentes.filter((t) => !t.sucesso && (!ultimoSucesso || t.criadoEm > ultimoSucesso.criadoEm));
  if (falhas.length >= MAX_FALHAS_EMAIL) {
    const liberaEm = new Date(falhas[falhas.length - MAX_FALHAS_EMAIL].criadoEm.getTime() + JANELA_MS);
    return { bloqueado: true, liberaEm, motivo: "email" };
  }

  const falhasIp = falhasDoIp.filter((d) => d.getTime() > inicio).sort((a, b) => a.getTime() - b.getTime());
  if (falhasIp.length >= MAX_FALHAS_IP) {
    const liberaEm = new Date(falhasIp[falhasIp.length - MAX_FALHAS_IP].getTime() + JANELA_MS);
    return { bloqueado: true, liberaEm, motivo: "ip" };
  }
  return { bloqueado: false };
}

/**
 * IP do cliente atrás do Cloud Run: o front-end do Google acrescenta o IP real
 * ao fim do `X-Forwarded-For` (o que vier antes pode ter sido forjado pelo
 * cliente). `saltos` = proxies confiáveis à frente do app (1 = só o Cloud Run;
 * 2 = Load Balancer + Cloud Run).
 */
export function ipDoCliente(xForwardedFor: string | null, saltos = 1): string | null {
  if (!xForwardedFor) return null;
  const ips = xForwardedFor
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  const ip = ips[Math.max(0, ips.length - Math.max(1, saltos))];
  return ip ? ip.slice(0, 64) : null;
}

/** E-mail como chave do bloqueio: minúsculo e com tamanho limitado (o campo vem do cliente). */
export function chaveEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}
