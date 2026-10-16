import { cache } from "react";
import { headers } from "next/headers";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare, getRounds, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { restricaoDeObras, ultimoAcessoDesatualizado, type RestricaoObras } from "@/services/acesso";
import {
  JANELA_MS,
  RETENCAO_TENTATIVAS_DIAS,
  chaveEmail,
  ipDoCliente,
  situacaoLogin,
} from "@/services/protecao-login";
import { CUSTO_BCRYPT } from "@/services/senha";
import { registrarAtividade } from "@/lib/atividade";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { authConfig } from "@/lib/auth.config";

declare module "next-auth" {
  interface User {
    role: Role;
    sessaoVersao: number;
  }
  interface Session {
    user: {
      id: string;
      nome: string;
      email: string;
      role: Role;
      sessaoVersao: number;
    };
  }
}

// Hash de senha descartada: comparado quando o e-mail não existe, para o tempo não revelar quais contas existem.
const HASH_FALSO = "$2b$12$3jha7dHldLxAzlLApFbReeifFbAPaw.SDhWQIBIGnaYKiBHLYEUgm";

export class LoginBloqueado extends CredentialsSignin {
  code = "bloqueado";
}

const SALTOS_PROXY = Number(process.env.PROXY_SALTOS ?? 1) || 1;

export async function ipDaRequisicao(): Promise<string | null> {
  return ipDoCliente((await headers()).get("x-forwarded-for"), SALTOS_PROXY);
}

export async function situacaoDoLogin(email: string, ip: string | null) {
  const desde = new Date(Date.now() - JANELA_MS);
  const [doEmail, doIp] = await Promise.all([
    prisma.tentativaLogin.findMany({
      where: { email, criadoEm: { gt: desde } },
      select: { sucesso: true, criadoEm: true },
    }),
    ip
      ? prisma.tentativaLogin.findMany({
          where: { ip, sucesso: false, criadoEm: { gt: desde } },
          select: { criadoEm: true },
        })
      : [],
  ]);
  return situacaoLogin(doEmail, doIp.map((t) => t.criadoEm));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === "string" ? chaveEmail(credentials.email) : "";
        const senha = typeof credentials?.senha === "string" ? credentials.senha : "";
        if (!email || !senha || senha.length > 1024) return null;
        const ip = ipDoCliente(request?.headers?.get("x-forwarded-for") ?? null, SALTOS_PROXY);

        const situacao = await situacaoDoLogin(email, ip);
        if (situacao.bloqueado) {
          eventoSeguranca("login_bloqueado", { email, ip, motivo: situacao.motivo, liberaEm: situacao.liberaEm.toISOString() });
          throw new LoginBloqueado();
        }

        // contas antigas podem ter e-mail com maiúsculas
        const usuario = await prisma.usuario.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
        const senhaCerta = await compare(senha, usuario?.senhaHash ?? HASH_FALSO);
        const ok = !!usuario && usuario.ativo && senhaCerta;

        await prisma.tentativaLogin.create({ data: { email, ip, sucesso: ok } });
        if (!ok) {
          eventoSeguranca("login_falhou", { email, ip, contaExiste: !!usuario, contaAtiva: usuario?.ativo ?? false });
          return null;
        }

        const senhaHash = getRounds(usuario.senhaHash) < CUSTO_BCRYPT ? await hash(senha, CUSTO_BCRYPT) : undefined;
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcessoEm: new Date(), ...(senhaHash ? { senhaHash } : {}) },
        });
        await prisma.tentativaLogin
          .deleteMany({ where: { criadoEm: { lt: new Date(Date.now() - RETENCAO_TENTATIVAS_DIAS * 86_400_000) } } })
          .catch((erro) => console.error("Falha ao limpar tentativas de login", erro));
        await registrarAtividade(usuario.id, "conta.login", { entidade: "usuario", entidadeId: usuario.id });

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          role: usuario.role,
          sessaoVersao: usuario.sessaoVersao,
        };
      },
    }),
  ],
});

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  obrasPermitidas: RestricaoObras;
};

// Lido do banco a cada requisição (papel/desativação/revogação valem sem esperar o JWT); cache() memoiza por requisição.
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
      sessaoVersao: true,
      obras: { select: { obraId: true } },
    },
  });
  if (!usuario || !usuario.ativo) return null;
  if (usuario.sessaoVersao !== session.user.sessaoVersao) {
    eventoSeguranca("sessao_revogada", { usuarioId: usuario.id });
    return null;
  }

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

export async function exigirPapel(...papeis: Role[]) {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error("Não autenticado");
  if (papeis.length > 0 && !papeis.includes(usuario.role)) {
    throw new Error("Sem permissão");
  }
  return usuario;
}

// Mesma mensagem de registro inexistente: quem não tem acesso não descobre se a obra existe.
export function exigirAcessoObra(usuario: UsuarioAtual, obraId: string, mensagem = "Registro não encontrado") {
  if (usuario.obrasPermitidas !== null && !usuario.obrasPermitidas.includes(obraId)) {
    throw new Error(mensagem);
  }
}
