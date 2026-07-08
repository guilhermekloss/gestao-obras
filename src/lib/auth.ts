import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

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

        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario || !usuario.ativo) return null;

        const ok = await compare(senha, usuario.senhaHash);
        if (!ok) return null;

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

/** Exige sessão com um dos papéis dados; lança erro caso contrário. Usar em toda server action. */
export async function exigirPapel(...papeis: Role[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado");
  if (papeis.length > 0 && !papeis.includes(session.user.role)) {
    throw new Error("Sem permissão");
  }
  return session.user;
}
