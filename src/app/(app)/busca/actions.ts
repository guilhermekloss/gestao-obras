"use server";

import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { formatarData, formatarMoeda } from "@/lib/format";
import { veFinanceiro, whereObrasPermitidas } from "@/services/acesso";
import { TIPO_DOCUMENTO_LABELS } from "@/services/financeiro";
import type { ResultadoBusca } from "@/components/busca-global-model";

const POR_TIPO = 5;

// Busca do cabeçalho: obras para todos (só as liberadas); fornecedor, lançamento e material só para quem vê o financeiro.
export async function buscarGlobal(termoBruto: string): Promise<ResultadoBusca[]> {
  const usuario = await usuarioAtual();
  if (!usuario) return [];
  const termo = String(termoBruto ?? "").trim().slice(0, 80);
  if (termo.length < 2) return [];
  const contem = { contains: termo, mode: "insensitive" as const };

  const obras = prisma.obra.findMany({
    where: { AND: [whereObrasPermitidas(usuario.obrasPermitidas), { OR: [{ nome: contem }, { codigo: contem }] }] },
    orderBy: { codigo: "asc" },
    take: POR_TIPO,
    select: { id: true, nome: true, codigo: true },
  });
  if (!veFinanceiro(usuario.role)) {
    return (await obras).map((o) => ({ tipo: "obra", href: `/obras/${o.id}`, titulo: o.nome, detalhe: o.codigo }));
  }

  const [listaObras, fornecedores, notas, materiais] = await Promise.all([
    obras,
    prisma.fornecedor.findMany({
      where: { OR: [{ nome: contem }, { cnpj: contem }] },
      orderBy: { nome: "asc" },
      take: POR_TIPO,
      select: { id: true, nome: true, cnpj: true },
    }),
    prisma.notaFiscal.findMany({
      where: { OR: [{ numero: contem }, { fornecedor: { nome: contem } }] },
      orderBy: { dataCompra: "desc" },
      take: POR_TIPO,
      select: {
        id: true,
        numero: true,
        tipoDocumento: true,
        dataCompra: true,
        totalCents: true,
        fornecedor: { select: { nome: true } },
      },
    }),
    prisma.material.findMany({
      where: { nome: contem, ativo: true },
      orderBy: { nome: "asc" },
      take: POR_TIPO,
      select: { id: true, nome: true, unidade: true },
    }),
  ]);

  return [
    ...listaObras.map((o): ResultadoBusca => ({ tipo: "obra", href: `/obras/${o.id}`, titulo: o.nome, detalhe: o.codigo })),
    ...fornecedores.map(
      (f): ResultadoBusca => ({ tipo: "fornecedor", href: `/fornecedores/${f.id}`, titulo: f.nome, detalhe: f.cnpj ?? undefined }),
    ),
    ...notas.map(
      (n): ResultadoBusca => ({
        tipo: "lancamento",
        href: `/notas/${n.id}`,
        titulo: `${TIPO_DOCUMENTO_LABELS[n.tipoDocumento]} ${n.numero} · ${n.fornecedor.nome}`,
        detalhe: `${formatarData(n.dataCompra)} · ${formatarMoeda(n.totalCents)}`,
      }),
    ),
    ...materiais.map(
      (m): ResultadoBusca => ({ tipo: "material", href: `/materiais/${m.id}`, titulo: m.nome, detalhe: m.unidade }),
    ),
  ];
}
