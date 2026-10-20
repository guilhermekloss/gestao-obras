import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MaterialInput } from "@/schemas/material";
import {
  chaveMaterial,
  normalizarUnidade,
  type ApelidoCatalogo,
  type MaterialCatalogo,
} from "./materiais";

type Db = Prisma.TransactionClient | typeof prisma;

const SELECAO_CATALOGO = { id: true, nome: true, unidade: true, tipo: true, categoria: true } as const;

export async function carregarBaseMateriais(): Promise<{ catalogo: MaterialCatalogo[]; apelidos: ApelidoCatalogo[] }> {
  const [catalogo, apelidos] = await Promise.all([
    prisma.material.findMany({ where: { ativo: true }, select: SELECAO_CATALOGO, orderBy: { nome: "asc" } }),
    prisma.materialApelido.findMany({
      select: { materialId: true, chave: true, descricaoOriginal: true, fornecedorId: true, codigoProduto: true },
    }),
  ]);
  return { catalogo, apelidos };
}

// Materiais ativos para escolher no lançamento, mais os já usados na nota (mesmo que desativados depois).
export async function listarMateriais(incluirIds: string[] = []): Promise<MaterialCatalogo[]> {
  return prisma.material.findMany({
    where: { OR: [{ ativo: true }, ...(incluirIds.length > 0 ? [{ id: { in: incluirIds } }] : [])] },
    select: SELECAO_CATALOGO,
    orderBy: { nome: "asc" },
  });
}

export async function buscarMaterialPorNome(nome: string, ignorarId?: string, db: Db = prisma) {
  return db.material.findFirst({
    where: { nome: { equals: nome.trim(), mode: "insensitive" }, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    select: SELECAO_CATALOGO,
  });
}

export async function criarMaterialValidado(
  dados: MaterialInput,
  db: Db = prisma,
): Promise<{ ok: true; material: MaterialCatalogo } | { ok: false; erro: string }> {
  const repetido = await buscarMaterialPorNome(dados.nome, undefined, db);
  if (repetido) return { ok: false, erro: `Já existe o material "${repetido.nome}".` };
  const material = await db.material.create({
    data: {
      nome: dados.nome,
      unidade: normalizarUnidade(dados.unidade),
      tipo: dados.tipo,
      categoria: dados.categoria || null,
    },
    select: SELECAO_CATALOGO,
  });
  return { ok: true, material };
}

// A chave do texto aponta para o material escolhido; escolher de novo reaponta (a decisão do usuário vale mais).
// Com código de produto, grava também uma linha por fornecedor + código: a mesma descrição pode mudar, o código não.
type Apelido = { materialId: string; descricao: string; fornecedorId?: string | null; codigoProduto?: string | null };

export async function registrarApelido(db: Db, a: Apelido) {
  await registrarApelidos(db, [a]);
}

// Uma leitura dos nomes para a nota toda; os upserts seguem em ordem (chave repetida: o último item vence).
export async function registrarApelidos(db: Db, apelidos: Apelido[]) {
  const itens = apelidos.map((a) => {
    const descricaoOriginal = a.descricao.trim().slice(0, 500);
    return {
      materialId: a.materialId,
      descricaoOriginal,
      chave: chaveMaterial(descricaoOriginal),
      fornecedorId: a.fornecedorId || null,
      codigoProduto: a.codigoProduto?.trim() || null,
    };
  });
  const ids = [...new Set(itens.filter((i) => i.chave).map((i) => i.materialId))];
  const nomes = new Map(
    ids.length > 0
      ? (await db.material.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((m) => [m.id, m.nome])
      : [],
  );

  for (const { materialId, descricaoOriginal, chave, fornecedorId, codigoProduto } of itens) {
    const nome = nomes.get(materialId);
    if (chave && nome !== undefined && chaveMaterial(nome) !== chave) {
      await db.materialApelido.upsert({
        where: { chave },
        create: { chave, materialId, descricaoOriginal, fornecedorId },
        update: { materialId, descricaoOriginal, fornecedorId },
      });
    }
    if (fornecedorId && codigoProduto) {
      const chaveCodigo = `COD ${fornecedorId} ${codigoProduto}`;
      await db.materialApelido.upsert({
        where: { chave: chaveCodigo },
        create: { chave: chaveCodigo, materialId, descricaoOriginal, fornecedorId, codigoProduto },
        update: { materialId, descricaoOriginal },
      });
    }
  }
}

// Último preço unitário lançado de cada material (do fornecedor pedido, se houver compra dele).
export async function ultimosPrecos(
  materialIds: string[],
  fornecedorId?: string,
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (materialIds.length === 0) return mapa;
  const buscar = (porFornecedor: boolean) =>
    prisma.itemNota.findMany({
      where: {
        materialId: { in: materialIds },
        ...(porFornecedor && fornecedorId ? { nota: { fornecedorId } } : {}),
      },
      distinct: ["materialId"],
      orderBy: [{ materialId: "asc" }, { nota: { dataCompra: "desc" } }],
      select: { materialId: true, unitCents: true },
    });
  if (fornecedorId) for (const i of await buscar(true)) mapa.set(i.materialId!, i.unitCents);
  const faltam = materialIds.filter((id) => !mapa.has(id));
  if (faltam.length > 0) {
    const geral = await prisma.itemNota.findMany({
      where: { materialId: { in: faltam } },
      distinct: ["materialId"],
      orderBy: [{ materialId: "asc" }, { nota: { dataCompra: "desc" } }],
      select: { materialId: true, unitCents: true },
    });
    for (const i of geral) mapa.set(i.materialId!, i.unitCents);
  }
  return mapa;
}
