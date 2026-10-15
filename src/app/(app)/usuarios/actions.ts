"use server";

import { z } from "zod";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { gerarToken, hashToken } from "@/lib/token";
import { ROLE_LABELS } from "@/services/acesso";
import { CUSTO_BCRYPT, problemaSenha } from "@/services/senha";
import { eventoSeguranca } from "@/lib/log-seguranca";
import {
  VALIDADE_PADRAO_DIAS,
  calcularExpiracao,
  mensagemConvite,
  normalizarEmail,
  novoConviteSchema,
  obrasValidasDoConvite,
  statusConvite,
} from "@/services/convite";

const usuarioSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(120, "O nome pode ter no máximo 120 caracteres"),
  email: z.string().trim().max(254).transform(normalizarEmail).pipe(z.email("E-mail inválido")),
  senha: z.string().optional(),
  role: z.enum(["ADMIN", "ESCRITORIO", "CAMPO"]),
  ativo: z.boolean(),
  todasObras: z.boolean(),
  obraIds: z.array(z.string().min(1).max(64)).max(500),
});

function parseUsuario(formData: FormData) {
  return usuarioSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: (formData.get("senha") as string) || undefined,
    role: formData.get("role"),
    ativo: formData.get("ativo") === "on",
    // o campo só aparece para CAMPO; sem ele, vale "todas"
    todasObras: formData.get("todasObras") !== null ? formData.get("todasObras") === "on" : true,
    obraIds: formData.getAll("obraIds").map(String),
  });
}

/** Erro de regra dentro da transação (vira mensagem para o admin). */
class ErroUsuario extends Error {}

/** Acesso por obra só existe para CAMPO; nos outros papéis grava "todas". */
async function acessoObras(role: Role, todasObras: boolean, obraIds: string[]) {
  if (role !== "CAMPO" || todasObras) return { todasObras: true, obraIds: [] as string[] };
  const existentes = await prisma.obra.findMany({ where: { id: { in: obraIds } }, select: { id: true } });
  return { todasObras: false, obraIds: obrasValidasDoConvite(obraIds, existentes.map((o) => o.id)) };
}

export const criarUsuario = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/usuarios"], atividade: "usuario.criar" },
  async (_user, formData: FormData): Promise<ActionResult> => {
    const parsed = parseUsuario(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const problema = problemaSenha(d.senha ?? "", { email: d.email, nome: d.nome });
    if (problema) return { ok: false, erro: problema };
    const existente = await prisma.usuario.findFirst({
      where: { email: { equals: d.email, mode: "insensitive" } },
    });
    if (existente) return { ok: false, erro: "E-mail já cadastrado" };

    const acesso = await acessoObras(d.role, d.todasObras, d.obraIds);
    if (!acesso.todasObras && acesso.obraIds.length === 0) {
      return { ok: false, erro: "Escolha ao menos uma obra ou marque “Todas as obras”" };
    }
    const usuario = await prisma.usuario.create({
      data: {
        nome: d.nome,
        email: d.email,
        senhaHash: await hash(d.senha!, CUSTO_BCRYPT),
        role: d.role,
        ativo: d.ativo,
        todasObras: acesso.todasObras,
        obras: { create: acesso.obraIds.map((obraId) => ({ obraId })) },
      },
      select: { id: true },
    });
    anotarAtividade({
      descricao: `Cadastrou ${d.nome} como ${ROLE_LABELS[d.role]}`,
      entidade: "usuario",
      entidadeId: usuario.id,
      obraIds: acesso.obraIds,
    });
    return { ok: true };
  },
);

export const atualizarUsuario = acaoDeEscrita(
  {
    papeis: ["ADMIN"],
    revalidar: (id: string, _formData: FormData) => ["/usuarios", `/usuarios/${id}`],
    atividade: "usuario.editar",
  },
  async (atual, id: string, formData: FormData): Promise<ActionResult> => {
    const parsed = parseUsuario(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const problema = d.senha ? problemaSenha(d.senha, { email: d.email, nome: d.nome }) : null;
    if (problema) return { ok: false, erro: problema };
    if (atual.id === id && (!d.ativo || d.role !== "ADMIN")) {
      return { ok: false, erro: "Você não pode desativar ou rebaixar a si mesmo" };
    }
    const duplicado = await prisma.usuario.findFirst({
      where: { email: { equals: d.email, mode: "insensitive" }, NOT: { id } },
    });
    if (duplicado) return { ok: false, erro: "E-mail já cadastrado" };

    const antes = await prisma.usuario.findUnique({
      where: { id },
      select: { nome: true, role: true, ativo: true, todasObras: true, obras: { select: { obraId: true } } },
    });
    if (!antes) return { ok: false, erro: "Usuário não encontrado" };

    const acesso = await acessoObras(d.role, d.todasObras, d.obraIds);
    if (!acesso.todasObras && acesso.obraIds.length === 0) {
      return { ok: false, erro: "Escolha ao menos uma obra ou marque “Todas as obras”" };
    }

    const senhaHash = d.senha ? await hash(d.senha, CUSTO_BCRYPT) : undefined;
    // senha redefinida ou acesso desativado: derruba as sessões abertas (um login roubado deixa de valer)
    const revogarSessoes = !!senhaHash || (antes.ativo && !d.ativo);
    try {
      await prisma.$transaction(
        async (tx) => {
          // nunca deixa o sistema sem um administrador ativo (dois admins rebaixando um ao outro ao mesmo tempo)
          if (antes.role === "ADMIN" && antes.ativo && (d.role !== "ADMIN" || !d.ativo)) {
            const outrosAdmins = await tx.usuario.count({ where: { role: "ADMIN", ativo: true, NOT: { id } } });
            if (outrosAdmins === 0) throw new ErroUsuario("É preciso manter ao menos um administrador ativo");
          }
          await tx.usuario.update({
            where: { id },
            data: {
              nome: d.nome,
              email: d.email,
              role: d.role,
              ativo: d.ativo,
              todasObras: acesso.todasObras,
              ...(senhaHash ? { senhaHash } : {}),
              ...(revogarSessoes ? { sessaoVersao: { increment: 1 } } : {}),
            },
          });
          await tx.usuarioObra.deleteMany({ where: { usuarioId: id } });
          await tx.usuarioObra.createMany({ data: acesso.obraIds.map((obraId) => ({ usuarioId: id, obraId })) });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (erro) {
      if (erro instanceof ErroUsuario) return { ok: false, erro: erro.message };
      throw erro;
    }
    if (revogarSessoes) eventoSeguranca("sessao_revogada", { usuarioId: id, porAdmin: atual.id });

    const obrasAntes = antes.todasObras ? null : antes.obras.map((o) => o.obraId).sort().join();
    const obrasDepois = acesso.todasObras ? null : [...acesso.obraIds].sort().join();
    const mudancas = [
      antes.role !== d.role && `papel ${ROLE_LABELS[antes.role]} → ${ROLE_LABELS[d.role]}`,
      antes.ativo !== d.ativo && (d.ativo ? "reativou o acesso" : "desativou o acesso"),
      obrasAntes !== obrasDepois &&
        (acesso.todasObras ? "liberou todas as obras" : `limitou a ${acesso.obraIds.length} obra(s)`),
      d.senha && "redefiniu a senha",
    ].filter(Boolean);
    anotarAtividade({
      descricao: `Alterou ${d.nome}${mudancas.length > 0 ? `: ${mudancas.join(", ")}` : ""}`,
      entidade: "usuario",
      entidadeId: id,
      obraIds: acesso.obraIds,
    });
    return { ok: true };
  },
);

/** Desconecta o usuário de todos os aparelhos (celular perdido, saída da empresa, suspeita de senha vazada). */
export const encerrarSessoesUsuario = acaoDeEscrita(
  {
    papeis: ["ADMIN"],
    revalidar: (id: string) => [`/usuarios/${id}`],
    atividade: "usuario.editar",
  },
  async (atual, id: string): Promise<ActionResult> => {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { sessaoVersao: { increment: 1 } },
      select: { nome: true },
    });
    eventoSeguranca("sessao_revogada", { usuarioId: id, porAdmin: atual.id });
    anotarAtividade({ descricao: `Encerrou as sessões de ${usuario.nome} em todos os aparelhos`, entidade: "usuario", entidadeId: id });
    return { ok: true };
  },
);

/** Endereço público do app, para montar o link do convite. */
async function urlBase(): Promise<string> {
  const configurada = process.env.APP_URL ?? process.env.AUTH_URL;
  if (configurada) return configurada.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type ConviteGerado = ActionResult & {
  link?: string;
  mensagem?: string;
  email?: string | null;
};

async function montarLink(token: string, c: { nome: string | null; role: Role; expiraEm: Date }) {
  const link = `${await urlBase()}/convite/${token}`;
  return {
    link,
    mensagem: mensagemConvite({ link, nome: c.nome, papel: ROLE_LABELS[c.role], expiraEm: c.expiraEm }),
  };
}

export const criarConvite = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/usuarios"], atividade: "convite.criar" },
  async (user, formData: FormData): Promise<ConviteGerado> => {
    const parsed = novoConviteSchema.safeParse({
      nome: (formData.get("nome") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      role: formData.get("role"),
      todasObras: formData.get("todasObras") !== null ? formData.get("todasObras") === "on" : true,
      obraIds: formData.getAll("obraIds").map(String),
      validadeDias: formData.get("validadeDias") ?? VALIDADE_PADRAO_DIAS,
    });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    if (d.email) {
      const existente = await prisma.usuario.findFirst({
        where: { email: { equals: d.email, mode: "insensitive" } },
        select: { nome: true },
      });
      if (existente) return { ok: false, erro: `Este e-mail já é de ${existente.nome} — edite o usuário em vez de convidar.` };
    }

    const acesso = await acessoObras(d.role, d.todasObras, d.obraIds);
    if (!acesso.todasObras && acesso.obraIds.length === 0) {
      return { ok: false, erro: "Escolha ao menos uma obra ou marque “Todas as obras”" };
    }

    const token = gerarToken();
    const convite = await prisma.convite.create({
      data: {
        tokenHash: hashToken(token),
        nome: d.nome || null,
        email: d.email ?? null,
        role: d.role,
        todasObras: acesso.todasObras,
        obraIds: acesso.obraIds,
        criadoPorId: user.id,
        expiraEm: calcularExpiracao(d.validadeDias),
      },
    });
    anotarAtividade({
      descricao: `Gerou convite de ${ROLE_LABELS[d.role]}${d.nome ? ` para ${d.nome}` : d.email ? ` para ${d.email}` : ""}`,
      entidade: "convite",
      entidadeId: convite.id,
      obraIds: acesso.obraIds,
    });
    return { ok: true, email: convite.email, ...(await montarLink(token, convite)) };
  },
);

/**
 * O link só existe no momento em que é gerado (o banco guarda o hash). Para
 * reenviar, gera-se um token novo — o link antigo deixa de funcionar — e o
 * prazo recomeça.
 */
export const renovarConvite = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/usuarios"], atividade: "convite.renovar" },
  async (_user, id: string): Promise<ConviteGerado> => {
    const atual = await prisma.convite.findUnique({ where: { id } });
    if (!atual) return { ok: false, erro: "Convite não encontrado" };
    if (statusConvite(atual) === "ACEITO") return { ok: false, erro: "Este convite já foi usado" };

    const token = gerarToken();
    const convite = await prisma.convite.update({
      where: { id },
      data: {
        tokenHash: hashToken(token),
        revogadoEm: null,
        expiraEm: calcularExpiracao(VALIDADE_PADRAO_DIAS),
      },
    });
    anotarAtividade({
      descricao: `Gerou um novo link para o convite${convite.nome ? ` de ${convite.nome}` : ""}`,
      entidade: "convite",
      entidadeId: id,
    });
    return { ok: true, email: convite.email, ...(await montarLink(token, convite)) };
  },
);

export const revogarConvite = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/usuarios"], atividade: "convite.revogar" },
  async (_user, id: string): Promise<ActionResult> => {
    const { count } = await prisma.convite.updateMany({
      where: { id, usadoEm: null, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    if (count === 0) return { ok: false, erro: "Convite já usado ou cancelado" };
    const convite = await prisma.convite.findUnique({ where: { id }, select: { nome: true, email: true } });
    anotarAtividade({
      descricao: `Cancelou o convite${convite?.nome ? ` de ${convite.nome}` : convite?.email ? ` de ${convite.email}` : ""}`,
      entidade: "convite",
      entidadeId: id,
    });
    return { ok: true };
  },
);
