"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { exigirAcessoObra } from "@/lib/auth";
import { z } from "zod";
import { anotarAtividade, ignorarAtividade } from "@/lib/atividade";
import { obraSchema, etapaSchema, ETAPAS_PADRAO } from "@/schemas/obra";
import { id as idSchema } from "@/schemas/comum";
import { trocarComVizinha, type DirecaoEtapa } from "@/services/obra";
import { formatarCno, normalizarCno } from "@/services/cno";

function parseObra(formData: FormData) {
  return obraSchema.safeParse({
    nome: formData.get("nome"),
    codigo: formData.get("codigo"),
    cno: (formData.get("cno") as string) || undefined,
    endereco: (formData.get("endereco") as string) || undefined,
    status: formData.get("status"),
    inicioEm: (formData.get("inicioEm") as string) || undefined,
    criarEtapasPadrao: formData.get("criarEtapasPadrao") === "on",
  });
}

export const criarObra = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], revalidar: ["/obras"], atividade: "obra.criar" },
  async (_user, formData: FormData): Promise<ActionResult> => {
    const parsed = parseObra(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const existente = await prisma.obra.findUnique({ where: { codigo: d.codigo } });
    if (existente) return { ok: false, erro: `Já existe uma obra com o código "${d.codigo}"` };

    const obra = await prisma.obra.create({
      data: {
        nome: d.nome,
        codigo: d.codigo,
        cno: d.cno,
        endereco: d.endereco,
        status: d.status,
        inicioEm: d.inicioEm ? new Date(d.inicioEm) : undefined,
        etapas: d.criarEtapasPadrao
          ? { create: ETAPAS_PADRAO.map((nome, i) => ({ nome, ordem: i + 1 })) }
          : undefined,
      },
      select: { id: true },
    });
    anotarAtividade({ descricao: `Cadastrou a obra ${d.nome}`, entidade: "obra", entidadeId: obra.id, obraIds: [obra.id] });
    return { ok: true };
  },
);

export const atualizarObra = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    obra: (id: string, _formData: FormData) => id,
    revalidar: (id: string, _formData: FormData) => ["/obras", `/obras/${id}`],
    atividade: "obra.editar",
  },
  async (_user, id: string, formData: FormData): Promise<ActionResult> => {
    const parsed = parseObra(formData);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const duplicada = await prisma.obra.findFirst({
      where: { codigo: d.codigo, NOT: { id } },
    });
    if (duplicada) return { ok: false, erro: `Já existe uma obra com o código "${d.codigo}"` };

    await prisma.obra.update({
      where: { id },
      data: {
        nome: d.nome,
        codigo: d.codigo,
        cno: d.cno ?? null,
        endereco: d.endereco ?? null,
        status: d.status,
        inicioEm: d.inicioEm ? new Date(d.inicioEm) : null,
      },
    });
    anotarAtividade({ descricao: `Editou a obra ${d.nome}`, entidade: "obra", entidadeId: id, obraIds: [id] });
    return { ok: true };
  },
);

// Chamada ao lançar uma nota cujo CNO não está em nenhuma obra: as próximas notas com ele já vêm ligadas.
export const vincularCnoAObra = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    obra: (obraId: string, _cno: string) => obraId,
    revalidar: (obraId: string, _cno: string) => ["/obras", `/obras/${obraId}`, "/notas/recebidas"],
    atividade: "obra.editar",
  },
  async (_user, obraId: string, cno: string): Promise<ActionResult> => {
    const digitos = normalizarCno(cno);
    if (!digitos) return { ok: false, erro: "O CNO deve ter 12 dígitos (XX.XXX.XXXXX/XX)" };
    const obra = await prisma.obra.findUnique({ where: { id: obraId }, select: { nome: true, cno: true } });
    if (!obra) return { ok: false, erro: "Obra não encontrada" };
    if (obra.cno === digitos) return { ok: true };
    // trocar o CNO de uma obra é decisão de cadastro, não um efeito colateral do lançamento
    if (obra.cno) {
      return {
        ok: false,
        erro: `A obra ${obra.nome} já tem o CNO ${formatarCno(obra.cno)}. Para trocar, edite o cadastro da obra.`,
      };
    }
    await prisma.obra.update({ where: { id: obraId }, data: { cno: digitos } });
    anotarAtividade({
      descricao: `Ligou o CNO ${formatarCno(digitos)} à obra ${obra.nome}`,
      entidade: "obra",
      entidadeId: obraId,
      obraIds: [obraId],
    });
    return { ok: true };
  },
);

// sem `revalidar` no wrapper: redireciona no sucesso e revalida ela mesma
export const excluirObra = acaoDeEscrita(
  { papeis: ["ADMIN"], obra: (id: string) => id, atividade: "obra.excluir" },
  async (_user, id: string): Promise<ActionResult> => {
    const usos = await prisma.rateioNota.count({ where: { obraId: id } });
    if (usos > 0) {
      return {
        ok: false,
        erro: "Obra possui notas fiscais rateadas — não pode ser excluída. Mude o status para Concluída ou Pausada.",
      };
    }
    const obra = await prisma.obra.delete({ where: { id }, select: { nome: true } });
    anotarAtividade({ descricao: `Excluiu a obra ${obra.nome}`, entidade: "obra", entidadeId: id, obraIds: [id] });
    revalidatePath("/obras");
    redirect("/obras");
  },
);

export const criarEtapa = acaoDeEscrita(
  {
    papeis: ["ADMIN", "ESCRITORIO"],
    obra: (obraId: string, _formData: FormData) => obraId,
    revalidar: (obraId: string, _formData: FormData) => [`/obras/${obraId}`],
    atividade: "etapa.criar",
  },
  async (_user, obraId: string, formData: FormData): Promise<ActionResult> => {
    const parsed = etapaSchema.safeParse({ nome: formData.get("nome") });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const ultima = await prisma.etapa.findFirst({
      where: { obraId },
      orderBy: { ordem: "desc" },
    });
    await prisma.etapa.create({
      data: { obraId, nome: parsed.data.nome, ordem: (ultima?.ordem ?? 0) + 1 },
    });
    anotarAtividade({ descricao: `Criou a etapa ${parsed.data.nome}`, entidade: "obra", entidadeId: obraId, obraIds: [obraId] });
    return { ok: true };
  },
);

export const excluirEtapa = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], atividade: "etapa.excluir" },
  async (user, id: string): Promise<ActionResult> => {
    const etapa = await prisma.etapa.findUnique({
      where: { id },
      include: { obra: { select: { nome: true } }, _count: { select: { medicoes: true, rateios: true } } },
    });
    if (!etapa) return { ok: false, erro: "Etapa não encontrada" };
    exigirAcessoObra(user, etapa.obraId, "Etapa não encontrada");
    if (etapa._count.medicoes > 0 || etapa._count.rateios > 0) {
      return { ok: false, erro: "Etapa possui avanço lançado ou custos vinculados — não pode ser excluída." };
    }
    await prisma.etapa.delete({ where: { id } });
    anotarAtividade({
      descricao: `Excluiu a etapa ${etapa.nome} (${etapa.obra.nome})`,
      entidade: "obra",
      entidadeId: etapa.obraId,
      obraIds: [etapa.obraId],
    });
    revalidatePath(`/obras/${etapa.obraId}`);
    return { ok: true };
  },
);

// a etapa aparece no cronograma, no orçamento e no dashboard
function revalidarEtapas(obraId: string) {
  for (const caminho of [`/obras/${obraId}`, "/cronograma", "/orcamento", "/dashboard"]) revalidatePath(caminho);
}

export const renomearEtapa = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], atividade: "etapa.renomear" },
  async (user, id: string, formData: FormData): Promise<ActionResult> => {
    const idValido = idSchema().safeParse(id);
    if (!idValido.success) return { ok: false, erro: "Etapa não encontrada" };
    const parsed = etapaSchema.safeParse({ nome: String(formData.get("nome") ?? "").trim() });
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

    const etapa = await prisma.etapa.findUnique({
      where: { id: idValido.data },
      select: { nome: true, obraId: true, obra: { select: { nome: true } } },
    });
    if (!etapa) return { ok: false, erro: "Etapa não encontrada" };
    exigirAcessoObra(user, etapa.obraId, "Etapa não encontrada");
    if (etapa.nome === parsed.data.nome) {
      ignorarAtividade();
      return { ok: true };
    }

    await prisma.etapa.update({ where: { id: idValido.data }, data: { nome: parsed.data.nome } });
    anotarAtividade({
      descricao: `Renomeou a etapa ${etapa.nome} para ${parsed.data.nome} (${etapa.obra.nome})`,
      entidade: "obra",
      entidadeId: etapa.obraId,
      obraIds: [etapa.obraId],
    });
    revalidarEtapas(etapa.obraId);
    return { ok: true };
  },
);

const direcaoSchema = z.enum(["cima", "baixo"]);

// Troca a etapa de lugar com a vizinha e renumera 1..n: ordens repetidas ou com buracos (dados antigos) se acertam.
export const moverEtapa = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], atividade: "etapa.reordenar" },
  async (user, id: string, direcao: DirecaoEtapa): Promise<ActionResult> => {
    const idValido = idSchema().safeParse(id);
    const direcaoValida = direcaoSchema.safeParse(direcao);
    if (!idValido.success || !direcaoValida.success) return { ok: false, erro: "Etapa não encontrada" };

    const etapa = await prisma.etapa.findUnique({
      where: { id: idValido.data },
      select: { nome: true, obraId: true, obra: { select: { nome: true } } },
    });
    if (!etapa) return { ok: false, erro: "Etapa não encontrada" };
    exigirAcessoObra(user, etapa.obraId, "Etapa não encontrada");

    const movida = await prisma.$transaction(async (tx) => {
      // trava a obra: dois cliques seguidos não embaralham a ordem
      await tx.$queryRaw`SELECT id FROM "Obra" WHERE id = ${etapa.obraId} FOR UPDATE`;
      const etapas = await tx.etapa.findMany({
        where: { obraId: etapa.obraId },
        orderBy: [{ ordem: "asc" }, { id: "asc" }],
        select: { id: true, ordem: true },
      });
      const novaOrdem = trocarComVizinha(
        etapas.map((e) => e.id),
        idValido.data,
        direcaoValida.data,
      );
      if (!novaOrdem) return false;
      const atual = new Map(etapas.map((e) => [e.id, e.ordem]));
      for (const [i, etapaId] of novaOrdem.entries()) {
        if (atual.get(etapaId) !== i + 1) await tx.etapa.update({ where: { id: etapaId }, data: { ordem: i + 1 } });
      }
      return true;
    });
    // já está na ponta: nada muda, nada a registrar
    if (!movida) {
      ignorarAtividade();
      return { ok: true };
    }
    anotarAtividade({
      descricao: `Moveu a etapa ${etapa.nome} para ${direcaoValida.data} (${etapa.obra.nome})`,
      entidade: "obra",
      entidadeId: etapa.obraId,
      obraIds: [etapa.obraId],
    });
    revalidarEtapas(etapa.obraId);
    return { ok: true };
  },
);
