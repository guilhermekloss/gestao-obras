import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

/** Sem uso por 8 horas, a sessão expira (o `proxy.ts` renova o cookie a cada página aberta). */
const SESSAO_OCIOSA_S = 8 * 60 * 60;
/** Mesmo em uso contínuo, um login vale no máximo 7 dias. */
export const SESSAO_ABSOLUTA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parte da configuração do Auth.js sem banco nem bcrypt: usada pelo
 * `proxy.ts` (renovação do cookie) e estendida em `lib/auth.ts` com o login.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSAO_OCIOSA_S },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sv = user.sessaoVersao;
        token.inicio = Date.now();
      }
      // login com mais de 7 dias: encerra mesmo que o cookie continue sendo renovado
      const inicio = typeof token.inicio === "number" ? token.inicio : 0;
      if (Date.now() - inicio > SESSAO_ABSOLUTA_MS) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.nome = (token.name as string) ?? "";
      session.user.role = token.role as Role;
      session.user.sessaoVersao = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
