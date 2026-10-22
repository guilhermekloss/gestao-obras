import { timingSafeEqual } from "node:crypto";

export const JANELA_MS = 15 * 60 * 1000;
export const MAX_FALHAS_EMAIL = 5;
// folgado: o escritório inteiro sai por um IP só
export const MAX_FALHAS_IP = 30;
export const RETENCAO_TENTATIVAS_DIAS = 90;

// Banimento cresce a cada reincidência em 24 h (bantime.increment do Fail2ban). O e-mail cresce pouco:
// quem erra a senha do e-mail é muitas vezes o atacante tentando trancar a conta da vítima, não a vítima.
export const DURACOES_BLOQUEIO_MS: Record<MotivoBloqueio, readonly number[]> = {
  email: [15, 30, 60].map((m) => m * 60_000),
  ip: [15, 60, 6 * 60, 24 * 60].map((m) => m * 60_000),
};
export const JANELA_REINCIDENCIA_MS = 24 * 60 * 60 * 1000;

type Tentativa = { sucesso: boolean; criadoEm: Date };

export type MotivoBloqueio = "email" | "ip";

export const REGRA_LOGIN: Record<MotivoBloqueio, string> = { email: "login-email", ip: "login-ip" };
// Aparelho conhecido (cookie assinado): no lugar do limite do e-mail, para quem entra do aparelho de sempre.
export const REGRA_LOGIN_DISPOSITIVO = "login-dispositivo";

// Falhas que bastam para bloquear agora. Bloqueia também e-mail inexistente (não revela quais contas existem);
// login certo zera as falhas do e-mail. `desde`: último bloqueio de cada chave — falhas que já renderam
// um bloqueio (ou que o admin liberou) não contam de novo.
export function limiteAtingido(
  doEmail: Tentativa[],
  falhasDoIp: Date[],
  agora: Date = new Date(),
  desde: { email?: Date | null; ip?: Date | null } = {},
): MotivoBloqueio | null {
  const inicio = agora.getTime() - JANELA_MS;
  const corteEmail = Math.max(inicio, desde.email?.getTime() ?? -Infinity);
  const recentes = doEmail.filter((t) => t.criadoEm.getTime() > corteEmail);
  const ultimoSucesso = Math.max(-Infinity, ...recentes.filter((t) => t.sucesso).map((t) => t.criadoEm.getTime()));
  if (recentes.filter((t) => !t.sucesso && t.criadoEm.getTime() > ultimoSucesso).length >= MAX_FALHAS_EMAIL) return "email";

  const corteIp = Math.max(inicio, desde.ip?.getTime() ?? -Infinity);
  if (falhasDoIp.filter((d) => d.getTime() > corteIp).length >= MAX_FALHAS_IP) return "ip";
  return null;
}

export type SituacaoBloqueio = "ativo" | "expirado" | "liberado";

export function situacaoDoBloqueio(b: { ate: Date; liberadoEm: Date | null }, agora: Date = new Date()): SituacaoBloqueio {
  if (b.liberadoEm) return "liberado";
  return b.ate > agora ? "ativo" : "expirado";
}

// `anteriores` = bloqueios da mesma chave nas últimas 24 h que não foram liberados pelo admin.
export function duracaoDoBloqueio(motivo: MotivoBloqueio, anteriores: number): number {
  const duracoes = DURACOES_BLOQUEIO_MS[motivo];
  return duracoes[Math.min(Math.max(0, anteriores), duracoes.length - 1)];
}

type Faixa = { v6: boolean; rede: bigint; prefixo: number };

function ipParaNumero(ip: string): { v6: boolean; n: bigint } | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const partes = ip.split(".").map(Number);
    if (partes.some((p) => p > 255)) return null;
    return { v6: false, n: partes.reduce((acc, p) => (acc << BigInt(8)) | BigInt(p), BigInt(0)) };
  }
  if (!ip.includes(":") || !/^[0-9a-f:.]+$/i.test(ip)) return null;
  // IPv4 no fim (::ffff:1.2.3.4) vira dois grupos hexadecimais
  const v4 = ip.match(/(\d{1,3}(\.\d{1,3}){3})$/);
  let texto = ip;
  if (v4) {
    const n = ipParaNumero(v4[1]);
    if (!n) return null;
    texto = ip.slice(0, -v4[1].length) + `${(n.n >> BigInt(16)).toString(16)}:${(n.n & BigInt(0xffff)).toString(16)}`;
  }
  const lados = texto.split("::");
  if (lados.length > 2) return null;
  const grupos = (lado: string) => (lado ? lado.split(":") : []);
  const esquerda = grupos(lados[0]);
  const direita = lados.length === 2 ? grupos(lados[1]) : [];
  const faltam = 8 - esquerda.length - direita.length;
  if (lados.length === 2 ? faltam < 1 : faltam !== 0) return null;
  const todos = [...esquerda, ...Array<string>(lados.length === 2 ? faltam : 0).fill("0"), ...direita];
  if (todos.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return { v6: true, n: todos.reduce((acc, g) => (acc << BigInt(16)) | BigInt(parseInt(g, 16)), BigInt(0)) };
}

export function ipValido(ip: string): boolean {
  return ipParaNumero(ip) !== null;
}

// IPS_CONFIAVEIS (ignoreip do Fail2ban): "200.1.2.3, 200.1.2.0/24, 2804:14c::/32". Entrada inválida é ignorada.
export function faixasDeIp(texto: string): Faixa[] {
  return texto
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((item) => {
      const [endereco, prefixoTexto, ...resto] = item.split("/");
      const ip = ipParaNumero(endereco);
      const bits = ip?.v6 ? 128 : 32;
      const prefixo = prefixoTexto === undefined ? bits : /^\d{1,3}$/.test(prefixoTexto) ? Number(prefixoTexto) : NaN;
      if (!ip || resto.length > 0 || !(prefixo >= 0 && prefixo <= bits)) return [];
      return [{ v6: ip.v6, rede: ip.n >> BigInt(bits - prefixo), prefixo }];
    });
}

// IP confiável não é bloqueado por IP; o limite por e-mail continua valendo para ele.
export function ipConfiavel(ip: string | null, faixas: Faixa[]): boolean {
  const n = ip ? ipParaNumero(ip) : null;
  if (!n) return false;
  const bits = n.v6 ? 128 : 32;
  return faixas.some((f) => f.v6 === n.v6 && n.n >> BigInt(bits - f.prefixo) === f.rede);
}

// Com o Load Balancer na frente, o IP real fica um salto antes. Mas a URL run.app continua aberta: quem chama direto
// poderia forjar esse salto. Por isso os 2 saltos só valem quando o LB injetou o cabeçalho secreto (BORDA_SEGREDO).
export function saltosDaRequisicao(segredoRecebido: string | null, segredoDaBorda: string, saltosPadrao: number): number {
  if (!segredoDaBorda) return saltosPadrao;
  const a = Buffer.from(segredoRecebido ?? "");
  const b = Buffer.from(segredoDaBorda);
  return a.length === b.length && timingSafeEqual(a, b) ? 2 : 1;
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
