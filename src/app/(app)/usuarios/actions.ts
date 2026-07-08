"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { ActionResult } from "../obras/actions";

const usuarioSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().optional(),
  role: z.enum(["ADMIN", "ESCRITORIO", "CAMPO"]),
  ativo: z.boolean(),
});

function parseUsuario(formData: FormData) {
  return usuarioSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: (formData.get("senha") as string) || undefined,
    role: formData.get("role"),
    ativo: formData.get("ativo") === "on",
  });
}

export async function criarUsuario(formData: FormData): Promise<ActionResult> {
  await exigirPapel("ADMIN");
  const parsed = parseUsuario(formData);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  if (!d.senha || d.senha.length < 6) {
    return { ok: false, erro: "Senha deve ter no mínimo 6 caracteres" };
  }
  const existente = await prisma.usuario.findUnique({ where: { email: d.email } });
  if (existente) return { ok: false, erro: "E-mail já cadastrado" };

  await prisma.usuario.create({
    data: {
      nome: d.nome,
      email: d.email,
      senhaHash: await hash(d.senha, 10),
      role: d.role,
      ativo: d.ativo,
    },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function atualizarUsuario(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const atual = await exigirPapel("ADMIN");
  const parsed = parseUsuario(formData);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.senha && d.senha.length < 6) {
    return { ok: false, erro: "Senha deve ter no mínimo 6 caracteres" };
  }
  if (atual.id === id && (!d.ativo || d.role !== "ADMIN")) {
    return { ok: false, erro: "Você não pode desativar ou rebaixar a si mesmo" };
  }
  const duplicado = await prisma.usuario.findFirst({
    where: { email: d.email, NOT: { id } },
  });
  if (duplicado) return { ok: false, erro: "E-mail já cadastrado" };

  await prisma.usuario.update({
    where: { id },
    data: {
      nome: d.nome,
      email: d.email,
      role: d.role,
      ativo: d.ativo,
      ...(d.senha ? { senhaHash: await hash(d.senha, 10) } : {}),
    },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}
