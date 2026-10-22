import { hkdfSync } from "node:crypto";
import { cookies } from "next/headers";
import { VALIDADE_DISPOSITIVO_MS, emitirDispositivo, lerDispositivo, nomeDoCookie, valorDoCookie } from "@/services/dispositivo";

// Chave própria, derivada do AUTH_SECRET: trocar o AUTH_SECRET (incidente) invalida também os aparelhos conhecidos.
function chave(): Buffer | null {
  const segredo = process.env.AUTH_SECRET;
  return segredo ? Buffer.from(hkdfSync("sha256", segredo, "gestao-obras", "dispositivo", 32)) : null;
}

export function dispositivoDosCabecalhos(cabecalhos: Headers, email: string): string | null {
  const k = chave();
  return k ? lerDispositivo(valorDoCookie(cabecalhos.get("cookie"), nomeDoCookie(email)), email, k) : null;
}

export async function dispositivoDaRequisicao(email: string): Promise<string | null> {
  const k = chave();
  return k ? lerDispositivo((await cookies()).get(nomeDoCookie(email))?.value, email, k) : null;
}

// Depois de um login certo: renova o cookie (mesmo id se o aparelho já era conhecido).
export async function lembrarDispositivo(email: string, id: string | null): Promise<string | null> {
  const k = chave();
  if (!k) return null;
  const emitido = emitirDispositivo(email, k, new Date(), id ?? undefined);
  try {
    (await cookies()).set(nomeDoCookie(email), emitido.valor, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: VALIDADE_DISPOSITIVO_MS / 1000,
    });
  } catch (erro) {
    // fora de server action ou route handler o cookie não pode ser gravado: segue sem lembrar o aparelho
    console.error("Não foi possível gravar o cookie de aparelho conhecido", erro);
    return null;
  }
  return emitido.id;
}
