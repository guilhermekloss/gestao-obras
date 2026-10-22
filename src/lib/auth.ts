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
  MAX_FALHAS_EMAIL,
  MAX_FALHAS_IP,
  REGRA_LOGIN,
  REGRA_LOGIN_DISPOSITIVO,
  chaveEmail,
  duracaoDoBloqueio,
  limiteAtingido,
} from "@/services/protecao-login";
import {
  aplicarBloqueio,
  bloqueioAtivo,
  bloqueiosRecentes,
  ipDosCabecalhos,
  ipVigiado,
  limparRegistrosDeProtecao,
  ultimoBloqueio,
} from "@/lib/protecao";
import { CUSTO_BCRYPT } from "@/services/senha";
import { registrarAtividade } from "@/lib/atividade";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { dispositivoDosCabecalhos, lembrarDispositivo } from "@/lib/dispositivo";
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

export async function ipDaRequisicao(): Promise<string | null> {
  return ipDosCabecalhos(await headers());
}

const REGRAS_DE_LOGIN = [...Object.values(REGRA_LOGIN), REGRA_LOGIN_DISPOSITIVO];

// Aparelho conhecido usa o limite próprio no lugar do limite do e-mail: quem erra a senha de longe não tranca o dono.
// O limite por IP vale sempre, só para IP fora de IPS_CONFIAVEIS.
export async function bloqueioDoLogin(email: string, ip: string | null, dispositivo: string | null = null) {
  return bloqueioAtivo(REGRAS_DE_LOGIN, [dispositivo ?? email, ...(ipVigiado(ip) ? [ip!] : [])]);
}

// Grava a falha e, se ela fecha o limite, cria o bloqueio — mais longo para quem reincide em 24 h.
export async function registrarFalhaLogin(email: string, ip: string | null, dispositivo: string | null = null) {
  await prisma.tentativaLogin.create({ data: { email, ip, dispositivo, sucesso: false } });

  const agora = new Date();
  const ipDaRegra = ipVigiado(ip);
  const desde = new Date(agora.getTime() - JANELA_MS);
  // de aparelho conhecido conta só o que veio dele; senão, as falhas de aparelhos desconhecidos (login certo zera os dois)
  const regraPrincipal = dispositivo ? REGRA_LOGIN_DISPOSITIVO : REGRA_LOGIN.email;
  const chavePrincipal = dispositivo ?? email;
  const [principais, doIp, bloqueioPrincipal, bloqueioIp] = await Promise.all([
    prisma.tentativaLogin.findMany({
      where: dispositivo
        ? { dispositivo, criadoEm: { gt: desde } }
        : { email, criadoEm: { gt: desde }, OR: [{ dispositivo: null }, { sucesso: true }] },
      select: { sucesso: true, criadoEm: true },
    }),
    ipDaRegra
      ? prisma.tentativaLogin.findMany({ where: { ip: ipDaRegra, sucesso: false, criadoEm: { gt: desde } }, select: { criadoEm: true } })
      : [],
    ultimoBloqueio(regraPrincipal, chavePrincipal),
    ipDaRegra ? ultimoBloqueio(REGRA_LOGIN.ip, ipDaRegra) : null,
  ]);
  const motivo = limiteAtingido(
    principais,
    doIp.map((t) => t.criadoEm),
    agora,
    { email: bloqueioPrincipal?.criadoEm, ip: bloqueioIp?.criadoEm },
  );
  if (!motivo) return;

  const regra = motivo === "email" ? regraPrincipal : REGRA_LOGIN.ip;
  const chave = motivo === "email" ? chavePrincipal : ipDaRegra!;
  const anteriores = await bloqueiosRecentes(regra, chave, agora);
  const ate = new Date(agora.getTime() + duracaoDoBloqueio(motivo, anteriores));
  const descricao =
    motivo === "ip"
      ? `${MAX_FALHAS_IP} falhas de login do mesmo IP em 15 min`
      : dispositivo
        ? `${MAX_FALHAS_EMAIL} senhas erradas seguidas num aparelho conhecido em 15 min`
        : `${MAX_FALHAS_EMAIL} senhas erradas seguidas em 15 min`;
  await aplicarBloqueio(regra, chave, ate, descricao, { email, ip, reincidencia: anteriores });
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
        const ip = request?.headers ? ipDosCabecalhos(request.headers) : null;
        const dispositivo = request?.headers ? dispositivoDosCabecalhos(request.headers, email) : null;

        const bloqueio = await bloqueioDoLogin(email, ip, dispositivo);
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
          await registrarFalhaLogin(email, ip, dispositivo);
          eventoSeguranca("login_falhou", {
            email,
            ip,
            contaExiste: !!usuario,
            contaAtiva: usuario?.ativo ?? false,
            aparelhoConhecido: !!dispositivo,
          });
          return null;
        }
        const lembrado = await lembrarDispositivo(email, dispositivo);
        await prisma.tentativaLogin.create({ data: { email, ip, dispositivo: lembrado ?? dispositivo, sucesso: true } });

        const senhaHash = getRounds(usuario.senhaHash) < CUSTO_BCRYPT ? await hash(senha, CUSTO_BCRYPT) : undefined;
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcessoEm: new Date(), ...(senhaHash ? { senhaHash } : {}) },
        });
        await limparRegistrosDeProtecao().catch((erro) => console.error("Falha ao limpar tentativas de login", erro));
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
  // bloqueios por senha errada depois disto ainda não foram mostrados à pessoa
  avisoDeBloqueioDesde: Date;
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
      bloqueioAvisadoEm: true,
      criadoEm: true,
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
    avisoDeBloqueioDesde: usuario.bloqueioAvisadoEm ?? usuario.criadoEm,
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
