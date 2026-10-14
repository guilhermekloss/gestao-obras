import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { restricaoDeObras, ultimoAcessoDesatualizado, type RestricaoObras } from "@/services/acesso";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      nome: string;
      email: string;
      role: Role;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const senha = credentials?.senha as string | undefined;
        if (!email || !senha) return null;

        // e-mails são gravados em minúsculas pelo convite; contas antigas podem ter maiúsculas
        const usuario = await prisma.usuario.findFirst({
          where: { email: { equals: email.trim(), mode: "insensitive" } },
        });
        if (!usuario || !usuario.ativo) return null;

        const ok = await compare(senha, usuario.senhaHash);
        if (!ok) return null;

        await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } });

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          role: usuario.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.nome = (token.name as string) ?? "";
      session.user.role = token.role as Role;
      return session;
    },
  },
});

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  /** obras que pode ver — `null` = todas (ver services/acesso.ts) */
  obrasPermitidas: RestricaoObras;
};

/**
 * Usuário da sessão lido do banco a cada requisição: papel, desativação e
 * obras liberadas valem na hora, sem esperar o JWT expirar. `null` quando não
 * há sessão ou a conta foi desativada/removida. Memoizado por requisição.
 */
export const usuarioAtual = cache(async (): Promise<UsuarioAtual | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      todasObras: true,
      ultimoAcessoEm: true,
      obras: { select: { obraId: true } },
    },
  });
  if (!usuario || !usuario.ativo) return null;

  if (ultimoAcessoDesatualizado(usuario.ultimoAcessoEm)) {
    await prisma.usuario
      .update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } })
      .catch((erro) => console.error("Falha ao gravar último acesso", erro));
  }

  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    role: usuario.role,
    obrasPermitidas: restricaoDeObras(usuario),
  };
});

/** Exige sessão com um dos papéis dados; lança erro caso contrário. Usar em toda server action. */
export async function exigirPapel(...papeis: Role[]) {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error("Não autenticado");
  if (papeis.length > 0 && !papeis.includes(usuario.role)) {
    throw new Error("Sem permissão");
  }
  return usuario;
}

/** Exige que o usuário possa ver a obra (CAMPO com acesso por obra). */
export function exigirAcessoObra(usuario: UsuarioAtual, obraId: string) {
  if (usuario.obrasPermitidas !== null && !usuario.obrasPermitidas.includes(obraId)) {
    throw new Error("Você não tem acesso a esta obra");
  }
}
