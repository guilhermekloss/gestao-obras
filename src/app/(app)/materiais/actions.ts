"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { materialSchema } from "@/schemas/material";
import { normalizarUnidade, type MaterialCatalogo } from "@/services/materiais";
import {
  buscarMaterialPorNome,
  criarMaterialValidado,
  registrarApelido,
  ultimosPrecos,
} from "@/services/materiais-db";
import { exigirPapel } from "@/lib/auth";

const PAPEIS = ["ADMIN", "ESCRITORIO"] as const;

function parseMaterial(formData: FormData) {
  return materialSchema.safeParse({
    nome: formData.get("nome"),
    unidade: formData.get("unidade"),
    tipo: formData.get("tipo") || undefined,
    categoria: (formData.get("categoria") as string)?.trim() || undefined,
  });
}

function anotar(descricao: string, id: string) {
  anotarAtividade({ descricao, entidade: "material", entidadeId: id });
}

export const criarMaterial = acaoDeEscrita(
  { papeis: [...PAPEIS], revalidar: ["/materiais"], atividade: "material.criar" },
  async (_user, formData: FormData): Promise<ActionResult> => {
    const parsed = parseMaterial(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const r = await criarMaterialValidado(parsed.data);
    if (!r.ok) return r;
    anotar(`Cadastrou o material ${r.material.nome}`, r.material.id);
    return { ok: true };
  },
);

type CriarMaterialInlineResult = ActionResult & { material?: MaterialCatalogo };

// Usado pelos formulários de lançamento: cadastra e já devolve o material para selecionar.
export const criarMaterialInline = acaoDeEscrita(
  { papeis: [...PAPEIS], revalidar: ["/materiais"], atividade: "material.criar" },
  async (
    _user,
    dados: { nome: string; unidade: string; tipo?: string; categoria?: string },
  ): Promise<CriarMaterialInlineResult> => {
    const parsed = materialSchema.safeParse({ ...dados, categoria: dados.categoria?.trim() || undefined });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const r = await criarMaterialValidado(parsed.data);
    if (!r.ok) return r;
    anotar(`Cadastrou o material ${r.material.nome}`, r.material.id);
    return { ok: true, material: r.material };
  },
);

export const atualizarMaterial = acaoDeEscrita(
  { papeis: [...PAPEIS], revalidar: ["/materiais"], atividade: "material.editar" },
  async (_user, id: string, formData: FormData): Promise<ActionResult> => {
    const parsed = parseMaterial(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;
    const repetido = await buscarMaterialPorNome(d.nome, id);
    if (repetido) return { ok: false, erro: `Já existe o material "${repetido.nome}".` };
    await prisma.material.update({
      where: { id },
      data: { nome: d.nome, unidade: normalizarUnidade(d.unidade), tipo: d.tipo, categoria: d.categoria || null },
    });
    anotar(`Editou o material ${d.nome}`, id);
    return { ok: true };
  },
);

export const excluirMaterial = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/materiais"], atividade: "material.excluir" },
  async (_user, id: string): Promise<ActionResult> => {
    const usos = await prisma.itemNota.count({ where: { materialId: id } });
    if (usos > 0) {
      return { ok: false, erro: `Material usado em ${usos} item(ns) de lançamentos — junte-o a outro material em vez de excluir.` };
    }
    const m = await prisma.material.delete({ where: { id }, select: { nome: true } });
    anotar(`Excluiu o material ${m.nome}`, id);
    return { ok: true };
  },
);

export const mesclarMaterial = acaoDeEscrita(
  { papeis: [...PAPEIS], revalidar: ["/materiais", "/notas"], atividade: "material.mesclar" },
  async (_user, origemId: string, destinoId: string): Promise<ActionResult> => {
    if (origemId === destinoId) return { ok: false, erro: "Escolha outro material para juntar." };
    const [origem, destino] = await Promise.all([
      prisma.material.findUnique({ where: { id: origemId }, select: { nome: true } }),
      prisma.material.findUnique({ where: { id: destinoId }, select: { nome: true } }),
    ]);
    if (!origem || !destino) return { ok: false, erro: "Material não encontrado." };

    await prisma.$transaction(async (tx) => {
      await tx.itemNota.updateMany({ where: { materialId: origemId }, data: { materialId: destinoId } });
      await tx.materialApelido.updateMany({ where: { materialId: origemId }, data: { materialId: destinoId } });
      await registrarApelido(tx, { materialId: destinoId, descricao: origem.nome });
      await tx.material.delete({ where: { id: origemId } });
    });
    anotar(`Juntou o material ${origem.nome} em ${destino.nome}`, destinoId);
    return { ok: true };
  },
);

export const removerApelido = acaoDeEscrita(
  { papeis: [...PAPEIS], revalidar: ["/materiais"], atividade: "material.editar" },
  async (_user, apelidoId: string): Promise<ActionResult> => {
    try {
      const a = await prisma.materialApelido.delete({
        where: { id: apelidoId },
        select: { materialId: true, descricaoOriginal: true, material: { select: { nome: true } } },
      });
      anotar(`Removeu o apelido "${a.descricaoOriginal}" do material ${a.material.nome}`, a.materialId);
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, erro: "Apelido não encontrado." };
      throw e;
    }
  },
);

// Último preço unitário (do fornecedor, se já comprou dele) para sugerir no lançamento.
export async function consultarPrecoSugerido(materialId: string, fornecedorId?: string): Promise<number | null> {
  await exigirPapel(...PAPEIS);
  const mapa = await ultimosPrecos([materialId], fornecedorId || undefined);
  return mapa.get(materialId) ?? null;
}
