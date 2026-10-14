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
import {
  SENHA_MINIMA,
  VALIDADE_PADRAO_DIAS,
  calcularExpiracao,
  mensagemConvite,
  normalizarEmail,
  novoConviteSchema,
  obrasValidasDoConvite,
  statusConvite,
} from "@/services/convite";

const usuarioSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().trim().transform(normalizarEmail).pipe(z.email("E-mail inválido")),
  senha: z.string().optional(),
  role: z.enum(["ADMIN", "ESCRITORIO", "CAMPO"]),
  ativo: z.boolean(),
  todasObras: z.boolean(),
  obraIds: z.array(z.string().min(1)),
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

const MSG_SENHA = `Senha deve ter no mínimo ${SENHA_MINIMA} caracteres`;

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

    if (!d.senha || d.senha.length < SENHA_MINIMA) return { ok: false, erro: MSG_SENHA };
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
        senhaHash: await hash(d.senha, 10),
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

    if (d.senha && d.senha.length < SENHA_MINIMA) return { ok: false, erro: MSG_SENHA };
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

    await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: {
          nome: d.nome,
          email: d.email,
          role: d.role,
          ativo: d.ativo,
          todasObras: acesso.todasObras,
          ...(d.senha ? { senhaHash: await hash(d.senha, 10) } : {}),
        },
      }),
      prisma.usuarioObra.deleteMany({ where: { usuarioId: id } }),
      prisma.usuarioObra.createMany({ data: acesso.obraIds.map((obraId) => ({ usuarioId: id, obraId })) }),
    ]);

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
