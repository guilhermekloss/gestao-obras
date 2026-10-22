import { cache } from "react";
import { headers } from "next/headers";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare, getRounds, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Obra, Role } from "@prisma/client";
import { podeVerObra, restricaoDeObras, ultimoAcessoDesatualizado, type RestricaoObras } from "@/services/acesso";
import {
  JANELA_MS,
  JANELA_REINCIDENCIA_MS,
  MAX_FALHAS_EMAIL,
  MAX_FALHAS_IP,
  REGRA_LOGIN,
  RETENCAO_TENTATIVAS_DIAS,
  chaveEmail,
  duracaoDoBloqueio,
  faixasDeIp,
  ipConfiavel,
  ipDoCliente,
  limiteAtingido,
  type MotivoBloqueio,
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

const FAIXAS_CONFIAVEIS = faixasDeIp(process.env.IPS_CONFIAVEIS ?? "");

// IP confiável (escritório) fica fora do limite por IP; o limite por e-mail vale sempre.
function chavesDoLogin(email: string, ip: string | null): { motivo: MotivoBloqueio; chave: string }[] {
  return [{ motivo: "email", chave: email }, ...(ip && !ipConfiavel(ip, FAIXAS_CONFIAVEIS) ? [{ motivo: "ip" as const, chave: ip }] : [])];
}

export async function bloqueioDoLogin(email: string, ip: string | null) {
  return prisma.bloqueio.findFirst({
    where: { chave: { in: chavesDoLogin(email, ip).map((c) => c.chave) }, ate: { gt: new Date() }, liberadoEm: null },
    orderBy: { ate: "desc" },
    select: { regra: true, ate: true },
  });
}

// Grava a falha e, se ela fecha o limite, cria o bloqueio — mais longo para quem reincide em 24 h.
export async function registrarFalhaLogin(email: string, ip: string | null) {
  await prisma.tentativaLogin.create({ data: { email, ip, sucesso: false } });

  const agora = new Date();
  const chaves = chavesDoLogin(email, ip);
  const ipVigiado = chaves.find((c) => c.motivo === "ip")?.chave ?? null;
  const ultimoBloqueio = (chave: string | null) =>
    chave
      ? prisma.bloqueio.findFirst({ where: { chave }, orderBy: { criadoEm: "desc" }, select: { criadoEm: true } })
      : null;
  const desde = new Date(agora.getTime() - JANELA_MS);
  const [doEmail, doIp, bloqueioEmail, bloqueioIp] = await Promise.all([
    prisma.tentativaLogin.findMany({ where: { email, criadoEm: { gt: desde } }, select: { sucesso: true, criadoEm: true } }),
    ipVigiado
      ? prisma.tentativaLogin.findMany({ where: { ip: ipVigiado, sucesso: false, criadoEm: { gt: desde } }, select: { criadoEm: true } })
      : [],
    ultimoBloqueio(email),
    ultimoBloqueio(ipVigiado),
  ]);
  const motivo = limiteAtingido(
    doEmail,
    doIp.map((t) => t.criadoEm),
    agora,
    { email: bloqueioEmail?.criadoEm, ip: bloqueioIp?.criadoEm },
  );
  if (!motivo) return;

  const chave = motivo === "email" ? email : ipVigiado!;
  const anteriores = await prisma.bloqueio.count({
    where: { chave, liberadoEm: null, criadoEm: { gt: new Date(agora.getTime() - JANELA_REINCIDENCIA_MS) } },
  });
  const ate = new Date(agora.getTime() + duracaoDoBloqueio(motivo, anteriores));
  await prisma.bloqueio.create({
    data: {
      regra: REGRA_LOGIN[motivo],
      chave,
      ate,
      motivo:
        motivo === "email"
          ? `${MAX_FALHAS_EMAIL} senhas erradas seguidas em 15 min`
          : `${MAX_FALHAS_IP} falhas de login do mesmo IP em 15 min`,
    },
  });
  eventoSeguranca("bloqueio_aplicado", { regra: REGRA_LOGIN[motivo], email, ip, ate: ate.toISOString(), reincidencia: anteriores });
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

        const bloqueio = await bloqueioDoLogin(email, ip);
        if (bloqueio) {
          eventoSeguranca("login_bloqueado", { email, ip, regra: bloqueio.regra, liberaEm: bloqueio.ate.toISOString() });
          throw new LoginBloqueado();
        }

        // contas antigas podem ter e-mail com maiúsculas
        const usuario = await prisma.usuario.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
        const senhaCerta = await compare(senha, usuario?.senhaHash ?? HASH_FALSO);
        const ok = !!usuario && usuario.ativo && senhaCerta;

        if (!ok) {
          await registrarFalhaLogin(email, ip);
          eventoSeguranca("login_falhou", { email, ip, contaExiste: !!usuario, contaAtiva: usuario?.ativo ?? false });
          return null;
        }
        await prisma.tentativaLogin.create({ data: { email, ip, sucesso: true } });

        const senhaHash = getRounds(usuario.senhaHash) < CUSTO_BCRYPT ? await hash(senha, CUSTO_BCRYPT) : undefined;
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcessoEm: new Date(), ...(senhaHash ? { senhaHash } : {}) },
        });
        const retencao = { criadoEm: { lt: new Date(Date.now() - RETENCAO_TENTATIVAS_DIAS * 86_400_000) } };
        await Promise.all([prisma.tentativaLogin.deleteMany({ where: retencao }), prisma.bloqueio.deleteMany({ where: retencao })]).catch(
          (erro) => console.error("Falha ao limpar tentativas de login", erro),
        );
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
  assistentePendente: boolean;
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
      assistenteVistoEm: true,
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
    assistentePendente: usuario.assistenteVistoEm === null,
  };
});

declare const autorizada: unique symbol;
// Obra que o usuário pode ver. Só `obraAutorizada` cria o valor: as abas e os carregadores pedem este tipo, não um id solto.
export type ObraAutorizada = Obra & { readonly [autorizada]: true };

// Sem acesso e obra inexistente dão o mesmo null: quem não tem acesso não descobre se a obra existe.
export async function obraAutorizada(usuario: UsuarioAtual, obraId: string): Promise<ObraAutorizada | null> {
  if (!podeVerObra(usuario.obrasPermitidas, obraId)) return null;
  return (await prisma.obra.findUnique({ where: { id: obraId } })) as ObraAutorizada | null;
}

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
