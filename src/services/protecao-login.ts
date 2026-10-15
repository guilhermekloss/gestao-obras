export const JANELA_MS = 15 * 60 * 1000;
export const MAX_FALHAS_EMAIL = 5;
// folgado: o escritório inteiro sai por um IP só
export const MAX_FALHAS_IP = 30;
export const RETENCAO_TENTATIVAS_DIAS = 90;

type Tentativa = { sucesso: boolean; criadoEm: Date };

type SituacaoLogin = { bloqueado: false } | { bloqueado: true; liberaEm: Date; motivo: "email" | "ip" };

// Bloqueia também e-mail inexistente (não revela quais contas existem); login certo zera as falhas do e-mail.
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

// O Google acrescenta o IP real ao fim do X-Forwarded-For; o que vem antes pode ser forjado.
// `saltos` = proxies confiáveis à frente do app (1 = Cloud Run; 2 = Load Balancer + Cloud Run).
export function ipDoCliente(xForwardedFor: string | null, saltos = 1): string | null {
  if (!xForwardedFor) return null;
  const ips = xForwardedFor
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  const ip = ips[Math.max(0, ips.length - Math.max(1, saltos))];
  return ip ? ip.slice(0, 64) : null;
}

export function chaveEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}
