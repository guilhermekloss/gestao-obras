import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Cookie de aparelho conhecido (OWASP, "device cookies"): depois de um login certo, o navegador ganha um cookie
// assinado. Falhas vindas dele contam num limite só dele; falhas de aparelho desconhecido contam no e-mail.
// Assim quem erra a senha de longe não tranca o dono da conta, que entra do aparelho de sempre.
// O cookie não leva o e-mail em claro: só um hash curto, para casar com o e-mail digitado.

export const VALIDADE_DISPOSITIVO_MS = 90 * 24 * 60 * 60 * 1000;

function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("base64url").slice(0, 16);
}

// Um cookie por conta: no computador do escritório várias pessoas entram do mesmo navegador.
export function nomeDoCookie(email: string): string {
  return `dispositivo-${hashEmail(email).slice(0, 10)}`;
}

function assinar(corpo: string, chave: Buffer): string {
  return createHmac("sha256", chave).update(corpo).digest("base64url");
}

export function emitirDispositivo(email: string, chave: Buffer, agora: Date = new Date(), id?: string) {
  const dispositivo = id ?? randomBytes(16).toString("base64url");
  const corpo = `${hashEmail(email)}.${dispositivo}.${agora.getTime() + VALIDADE_DISPOSITIVO_MS}`;
  return { id: dispositivo, valor: `${corpo}.${assinar(corpo, chave)}` };
}

// Devolve o id do aparelho se o cookie é deste e-mail, foi assinado por esta chave e não venceu.
export function lerDispositivo(valor: string | undefined, email: string, chave: Buffer, agora: Date = new Date()): string | null {
  if (!valor || valor.length > 200) return null;
  const partes = valor.split(".");
  if (partes.length !== 4) return null;
  const [hash, id, expira, assinatura] = partes;
  const esperada = Buffer.from(assinar(`${hash}.${id}.${expira}`, chave));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  if (hash !== hashEmail(email) || !/^[A-Za-z0-9_-]{16,32}$/.test(id)) return null;
  return Number(expira) > agora.getTime() ? id : null;
}

export function valorDoCookie(cabecalho: string | null, nome: string): string | undefined {
  for (const parte of (cabecalho ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return undefined;
}
