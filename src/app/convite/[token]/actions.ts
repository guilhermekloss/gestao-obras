"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { registrarAtividade } from "@/lib/atividade";
import { hashToken } from "@/lib/token";
import { CUSTO_BCRYPT } from "@/services/senha";
import { ROLE_LABELS } from "@/services/acesso";
import { cadastroConviteSchema, obrasValidasDoConvite, tokenComFormatoValido } from "@/services/convite";

// devolve o digitado: o React limpa o form após a action (senhas não voltam)
export type EstadoCadastro = { erro?: string; campo?: string; nome?: string; email?: string };

class ErroCadastro extends Error {}

// rota pública: quem autoriza é o token. Consumo condicional na transação:
// envios simultâneos do mesmo link criam no máximo uma conta.
export async function aceitarConvite(
  token: string,
  _anterior: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const digitado = { nome: String(formData.get("nome") ?? ""), email: String(formData.get("email") ?? "") };
  if (!tokenComFormatoValido(token)) return { erro: "Link de convite inválido." };

  const convite = await prisma.convite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!convite) return { erro: "Link de convite inválido." };

  const parsed = cadastroConviteSchema.safeParse({
    nome: formData.get("nome"),
    // e-mail definido no convite prevalece sobre o enviado
    email: convite.email ?? formData.get("email"),
    senha: formData.get("senha"),
    confirmacao: formData.get("confirmacao"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ...digitado, erro: issue.message, campo: String(issue.path[0] ?? "") };
  }
  const d = parsed.data;

  const senhaHash = await hash(d.senha, CUSTO_BCRYPT);
  const agora = new Date();
  let usuario: { id: string; role: keyof typeof ROLE_LABELS };
  try {
    usuario = await prisma.$transaction(async (tx) => {
      const { count } = await tx.convite.updateMany({
        where: { id: convite.id, usadoEm: null, revogadoEm: null, expiraEm: { gt: agora } },
        data: { usadoEm: agora },
      });
      if (count === 0) throw new ErroCadastro("Este convite expirou, foi cancelado ou já foi usado.");

      const repetido = await tx.usuario.findFirst({
        where: { email: { equals: d.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (repetido) throw new ErroCadastro("Já existe uma conta com este e-mail. Entre pela tela de login.");

      const existentes = convite.todasObras
        ? []
        : (await tx.obra.findMany({ where: { id: { in: convite.obraIds } }, select: { id: true } })).map((o) => o.id);
      const criado = await tx.usuario.create({
        data: {
          nome: d.nome,
          email: d.email,
          senhaHash,
          role: convite.role,
          todasObras: convite.todasObras,
          obras: { create: obrasValidasDoConvite(convite.obraIds, existentes).map((obraId) => ({ obraId })) },
        },
        select: { id: true, role: true },
      });
      await tx.convite.update({ where: { id: convite.id }, data: { usuarioId: criado.id } });
      return criado;
    });
  } catch (erro) {
    if (erro instanceof ErroCadastro) return { ...digitado, erro: erro.message };
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return { ...digitado, erro: "Já existe uma conta com este e-mail. Entre pela tela de login." };
    }
    throw erro;
  }

  await registrarAtividade(usuario.id, "convite.aceito", {
    descricao: `Fez o cadastro pelo convite como ${ROLE_LABELS[usuario.role]}`,
    entidade: "usuario",
    entidadeId: usuario.id,
    obraIds: convite.todasObras ? [] : convite.obraIds,
  });

  try {
    await signIn("credentials", {
      email: d.email,
      senha: d.senha,
      redirectTo: usuario.role === "CAMPO" ? "/diario" : "/dashboard",
    });
  } catch (erro) {
    if (erro instanceof AuthError) redirect("/login?cadastro=1");
    throw erro;
  }
  return {};
}
