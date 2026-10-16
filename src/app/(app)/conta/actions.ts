"use server";

import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigirPapel, ipDaRequisicao, signOut, situacaoDoLogin } from "@/lib/auth";
import { registrarAtividade } from "@/lib/atividade";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { chaveEmail } from "@/services/protecao-login";
import { CUSTO_BCRYPT, problemaSenha } from "@/services/senha";

export type EstadoSenha = { erro?: string; campo?: "atual" | "nova" | "confirmacao" };

// exige a senha atual (sessão esquecida aberta não basta) e erros contam no bloqueio do login
export async function alterarMinhaSenha(_anterior: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const atual = await exigirPapel();
  const senhaAtual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: atual.id },
    select: { id: true, email: true, nome: true, senhaHash: true },
  });
  const email = chaveEmail(usuario.email);
  const ip = await ipDaRequisicao();

  if ((await situacaoDoLogin(email, ip)).bloqueado) {
    return { erro: "Muitas tentativas sem sucesso. Aguarde 15 minutos e tente de novo.", campo: "atual" };
  }
  if (!senhaAtual || senhaAtual.length > 1024 || !(await compare(senhaAtual, usuario.senhaHash))) {
    await prisma.tentativaLogin.create({ data: { email, ip, sucesso: false } });
    eventoSeguranca("login_falhou", { email, ip, origem: "troca_de_senha" });
    return { erro: "Senha atual incorreta", campo: "atual" };
  }

  const problema = problemaSenha(nova, { email: usuario.email, nome: usuario.nome });
  if (problema) return { erro: problema, campo: "nova" };
  if (nova === senhaAtual) return { erro: "A senha nova precisa ser diferente da atual", campo: "nova" };
  if (nova !== confirmacao) return { erro: "As senhas não conferem", campo: "confirmacao" };

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await hash(nova, CUSTO_BCRYPT), sessaoVersao: { increment: 1 } },
  });
  await registrarAtividade(usuario.id, "conta.senha", { entidade: "usuario", entidadeId: usuario.id });
  eventoSeguranca("senha_alterada", { usuarioId: usuario.id, ip });
  await signOut({ redirectTo: "/login?senha=1" });
  return {};
}

export async function encerrarMinhasSessoes(): Promise<void> {
  const atual = await exigirPapel();
  await prisma.usuario.update({ where: { id: atual.id }, data: { sessaoVersao: { increment: 1 } } });
  await registrarAtividade(atual.id, "conta.encerrar_sessoes", { entidade: "usuario", entidadeId: atual.id });
  eventoSeguranca("sessao_revogada", { usuarioId: atual.id, porAdmin: null });
  await signOut({ redirectTo: "/login" });
}
