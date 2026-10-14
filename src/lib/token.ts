import { createHash, randomBytes } from "node:crypto";

/** Token do link de convite: 32 bytes aleatórios em base64url (43 caracteres). */
export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

/** O banco guarda só o hash — quem lê o banco não consegue montar o link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
