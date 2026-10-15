import { subDays } from "date-fns";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  linkAtividade,
  resumirPorObra,
  tiposDaCategoria,
  type CategoriaAtividade,
} from "@/services/atividade";
import { statusConvite } from "@/services/convite";

/** Login, troca de senha e encerramento de sessão aparecem no histórico, mas não contam como produção. */
const SEM_EVENTOS_DE_CONTA = { NOT: { tipo: { startsWith: "conta." } } } satisfies Prisma.AtividadeWhereInput;

/** Mapa id → nome das obras citadas, para não fazer join em cada linha. */
async function nomesDasObras(ids: Iterable<string>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const obras = await prisma.obra.findMany({ where: { id: { in: unicos } }, select: { id: true, nome: true } });
  return new Map(obras.map((o) => [o.id, o.nome]));
}

function contagemPor<T extends string | null>(linhas: { chave: T; n: number }[]): Map<string, number> {
  return new Map(linhas.filter((l) => l.chave !== null).map((l) => [l.chave as string, l.n]));
}

/** Lista de usuários com o que cada um fez nos últimos 30 dias, a partir dos próprios registros. */
export async function carregarListaUsuarios(agora: Date = new Date()) {
  const desde = subDays(agora, 30);
  const [usuarios, rdos, notas, medicoes, acoes, convitesPendentes] = await Promise.all([
    prisma.usuario.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        todasObras: true,
        criadoEm: true,
        ultimoAcessoEm: true,
        obras: { select: { obraId: true, obra: { select: { nome: true } } }, orderBy: { obra: { codigo: "asc" } } },
      },
    }),
    prisma.diarioObra.groupBy({ by: ["autorId"], where: { createdAt: { gte: desde } }, _count: true }),
    prisma.notaFiscal.groupBy({ by: ["createdBy"], where: { createdAt: { gte: desde } }, _count: true }),
    prisma.medicao.groupBy({ by: ["autorId"], where: { data: { gte: desde } }, _count: true }),
    prisma.atividade.groupBy({ by: ["usuarioId"], where: { criadoEm: { gte: desde }, ...SEM_EVENTOS_DE_CONTA }, _count: true }),
    prisma.convite.findMany({
      where: { usadoEm: null, revogadoEm: null, expiraEm: { gt: agora } },
      select: { id: true },
    }),
  ]);

  const rdosPor = contagemPor(rdos.map((r) => ({ chave: r.autorId, n: r._count })));
  const notasPor = contagemPor(notas.map((r) => ({ chave: r.createdBy, n: r._count })));
  const medicoesPor = contagemPor(medicoes.map((r) => ({ chave: r.autorId, n: r._count })));
  const acoesPor = contagemPor(acoes.map((r) => ({ chave: r.usuarioId, n: r._count })));

  return {
    usuarios: usuarios.map((u) => ({
      ...u,
      nomesObras: u.obras.map((o) => o.obra.nome),
      ultimos30: {
        rdos: rdosPor.get(u.id) ?? 0,
        lancamentos: notasPor.get(u.id) ?? 0,
        avancos: medicoesPor.get(u.id) ?? 0,
        acoes: acoesPor.get(u.id) ?? 0,
      },
    })),
    convitesPendentes: convitesPendentes.length,
  };
}

export type UsuarioDaLista = Awaited<ReturnType<typeof carregarListaUsuarios>>["usuarios"][number];

export async function carregarConvites(agora: Date = new Date()) {
  const convites = await prisma.convite.findMany({
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: {
      criadoPor: { select: { id: true, nome: true } },
      usuario: { select: { id: true, nome: true } },
    },
  });
  const obras = await nomesDasObras(convites.flatMap((c) => c.obraIds));
  return convites.map((c) => ({
    id: c.id,
    nome: c.nome,
    email: c.email,
    role: c.role,
    todasObras: c.todasObras,
    nomesObras: c.obraIds.map((id) => obras.get(id)).filter((n): n is string => !!n),
    criadoPor: c.criadoPor,
    criadoEm: c.criadoEm,
    expiraEm: c.expiraEm,
    usadoEm: c.usadoEm,
    usuario: c.usuario,
    status: statusConvite(c, agora),
  }));
}

export type ConviteDaLista = Awaited<ReturnType<typeof carregarConvites>>[number];

export type FiltroAtividades = {
  usuarioId?: string;
  obraId?: string;
  categoria?: CategoriaAtividade;
};

export const ATIVIDADES_POR_PAGINA = 50;

/** Linhas do log de auditoria, mais recentes primeiro, já com nome do autor, obras e link. */
export async function listarAtividades(filtro: FiltroAtividades, pagina = 1) {
  const where: Prisma.AtividadeWhereInput = {
    ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
    ...(filtro.obraId ? { obraIds: { has: filtro.obraId } } : {}),
    ...(filtro.categoria ? { tipo: { in: tiposDaCategoria(filtro.categoria) } } : {}),
  };
  const [linhas, total] = await Promise.all([
    prisma.atividade.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (pagina - 1) * ATIVIDADES_POR_PAGINA,
      take: ATIVIDADES_POR_PAGINA,
      include: { usuario: { select: { id: true, nome: true } } },
    }),
    prisma.atividade.count({ where }),
  ]);
  const obras = await nomesDasObras(linhas.flatMap((l) => l.obraIds));
  return {
    total,
    atividades: linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      descricao: l.descricao,
      criadoEm: l.criadoEm,
      valorCents: l.valorCents,
      usuario: l.usuario,
      obras: l.obraIds.map((id) => ({ id, nome: obras.get(id) })).filter((o): o is { id: string; nome: string } => !!o.nome),
      link: linkAtividade(l),
    })),
  };
}

export type AtividadeDoFeed = Awaited<ReturnType<typeof listarAtividades>>["atividades"][number];

/**
 * Tudo o que o usuário produziu na plataforma: lançamentos, RDOs e avanços
 * (com histórico desde antes do log existir), atuação por obra e as últimas
 * ações do log.
 */
export async function carregarPerfilUsuario(id: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      todasObras: true,
      criadoEm: true,
      ultimoAcessoEm: true,
      obras: { select: { obraId: true, obra: { select: { nome: true } } }, orderBy: { obra: { codigo: "asc" } } },
      conviteAceito: { select: { usadoEm: true, criadoPor: { select: { id: true, nome: true } } } },
    },
  });
  if (!usuario) return null;

  const [notas, rdos, medicoes, feed, acoes30] = await Promise.all([
    prisma.notaFiscal.findMany({
      where: { createdBy: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        numero: true,
        tipoDocumento: true,
        totalCents: true,
        createdAt: true,
        fornecedor: { select: { nome: true } },
        rateios: { select: { obraId: true, fracaoBp: true } },
      },
    }),
    prisma.diarioObra.findMany({
      where: { autorId: id },
      orderBy: { data: "desc" },
      select: { id: true, obraId: true, data: true, createdAt: true, _count: { select: { fotos: true } } },
    }),
    prisma.medicao.findMany({
      where: { autorId: id },
      orderBy: { data: "desc" },
      select: { id: true, data: true, percentBp: true, etapa: { select: { nome: true, obraId: true } } },
    }),
    listarAtividades({ usuarioId: id }),
    prisma.atividade.count({ where: { usuarioId: id, criadoEm: { gte: subDays(new Date(), 30) }, ...SEM_EVENTOS_DE_CONTA } }),
  ]);

  const porObra = resumirPorObra({
    rdos: rdos.map((r) => ({ obraId: r.obraId, criadoEm: r.createdAt })),
    medicoes: medicoes.map((m) => ({ obraId: m.etapa.obraId, criadoEm: m.data })),
    notas: notas.map((n) => ({ criadoEm: n.createdAt, totalCents: n.totalCents, rateios: n.rateios })),
  });
  const obras = await nomesDasObras([
    ...porObra.map((p) => p.obraId),
    ...rdos.slice(0, 5).map((r) => r.obraId),
  ]);

  return {
    usuario,
    totais: {
      lancamentos: notas.length,
      valorLancadoCents: notas.reduce((acc, n) => acc + n.totalCents, 0),
      rdos: rdos.length,
      fotos: rdos.reduce((acc, r) => acc + r._count.fotos, 0),
      avancos: medicoes.length,
      acoes30,
    },
    datas: {
      lancamentos: notas.map((n) => n.createdAt),
      rdos: rdos.map((r) => r.createdAt),
      avancos: medicoes.map((m) => m.data),
    },
    porObra: porObra.map((p) => ({ ...p, nome: obras.get(p.obraId) ?? "Obra excluída" })),
    ultimosLancamentos: notas.slice(0, 5),
    ultimosRdos: rdos.slice(0, 5).map((r) => ({ ...r, obraNome: obras.get(r.obraId) ?? "—" })),
    feed,
  };
}

/** Quem tem acesso à obra e o que cada um produziu nela — aba Equipe da obra. */
export async function carregarEquipeDaObra(obraId: string) {
  const [usuarios, rdos, medicoes, rateios] = await Promise.all([
    prisma.usuario.findMany({
      where: {
        ativo: true,
        OR: [{ role: { not: "CAMPO" } }, { todasObras: true }, { obras: { some: { obraId } } }],
      },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, role: true, todasObras: true, ultimoAcessoEm: true },
    }),
    prisma.diarioObra.groupBy({ by: ["autorId"], where: { obraId }, _count: true, _max: { data: true } }),
    prisma.medicao.groupBy({ by: ["autorId"], where: { etapa: { obraId } }, _count: true, _max: { data: true } }),
    prisma.rateioNota.findMany({ where: { obraId }, select: { nota: { select: { createdBy: true } } } }),
  ]);
  const rdosPor = new Map(rdos.map((r) => [r.autorId, r]));
  const medicoesPor = new Map(medicoes.map((m) => [m.autorId, m]));
  const lancamentosPor = new Map<string, number>();
  for (const r of rateios) {
    const autor = r.nota.createdBy;
    if (autor) lancamentosPor.set(autor, (lancamentosPor.get(autor) ?? 0) + 1);
  }
  return usuarios.map((u) => ({
    ...u,
    acessoEspecifico: u.role === "CAMPO" && !u.todasObras,
    rdos: rdosPor.get(u.id)?._count ?? 0,
    ultimoRdo: rdosPor.get(u.id)?._max.data ?? null,
    avancos: medicoesPor.get(u.id)?._count ?? 0,
    lancamentos: lancamentosPor.get(u.id) ?? 0,
  }));
}

/** Só os campos do formulário vão para o client. */
export function paraEdicao(u: {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  todasObras: boolean;
  obras: { obraId: string }[];
}) {
  const { id, nome, email, role, ativo, todasObras } = u;
  return { id, nome, email, role, ativo, todasObras, obraIds: u.obras.map((o) => o.obraId) };
}
