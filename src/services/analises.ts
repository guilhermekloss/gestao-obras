import { startOfDay } from "date-fns";
import type { Prisma, TipoItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatarData, formatarMoeda, formatarPercentBp } from "@/lib/format";
import { BP_TOTAL, custoRateado } from "./rateio";
import { realizadoPorEtapaTodas } from "./custos";
import { normalizarDescricao } from "./materiais";

export type ClasseAbc = "A" | "B" | "C";

const LIMITE_A_BP = 8_000;
const LIMITE_B_BP = 9_500;

export type NotaParaAbc = {
  fornecedorId: string;
  fracaoBp: number;
  itens: {
    descricao: string;
    unidade: string;
    tipo: TipoItem;
    qtde: number;
    totalCents: number;
  }[];
};

export type InsumoAbc = {
  chave: string;
  descricao: string;
  unidade: string;
  tipo: TipoItem;
  qtde: number;
  custoCents: number;
  precoMedioCents: number | null;
  numFornecedores: number;
  participacaoBp: number;
  acumuladoBp: number;
  classe: ClasseAbc;
};

type ResumoClasse = { itens: number; custoCents: number; participacaoBp: number };

type CurvaAbc = {
  insumos: InsumoAbc[];
  totalCents: number;
  resumo: Record<ClasseAbc, ResumoClasse>;
};

export { normalizarDescricao };

function normalizarUnidade(unidade: string): string {
  return unidade.trim().toUpperCase();
}

// Pelo acumulado ANTES do insumo: o que cruza 80% ainda é A (senão um insumo com 90% do custo seria B).
export function classeAbc(acumuladoAntesCents: number, totalCents: number): ClasseAbc {
  if (acumuladoAntesCents * BP_TOTAL < totalCents * LIMITE_A_BP) return "A";
  if (acumuladoAntesCents * BP_TOTAL < totalCents * LIMITE_B_BP) return "B";
  return "C";
}

function bpDe(parte: number, total: number): number {
  return total > 0 ? Math.round((parte * BP_TOTAL) / total) : 0;
}

type AccInsumo = {
  descricao: string;
  unidade: string;
  tipo: TipoItem;
  maiorItemCents: number;
  qtde: number;
  custoCents: number;
  fornecedores: Set<string>;
};

// A quantidade também é multiplicada pela fração do rateio, para o preço médio não mudar com o filtro.
export function curvaAbc(notas: NotaParaAbc[]): CurvaAbc {
  const grupos = new Map<string, AccInsumo>();

  for (const nota of notas) {
    for (const item of nota.itens) {
      const unidade = normalizarUnidade(item.unidade);
      const chave = `${normalizarDescricao(item.descricao)}|${unidade}`;
      let g = grupos.get(chave);
      if (!g) {
        g = {
          descricao: item.descricao.trim(),
          unidade,
          tipo: item.tipo,
          maiorItemCents: item.totalCents,
          qtde: 0,
          custoCents: 0,
          fornecedores: new Set(),
        };
        grupos.set(chave, g);
      } else if (item.totalCents > g.maiorItemCents) {
        g.descricao = item.descricao.trim();
        g.tipo = item.tipo;
        g.maiorItemCents = item.totalCents;
      }
      g.custoCents += custoRateado(item.totalCents, nota.fracaoBp);
      g.qtde += (item.qtde * nota.fracaoBp) / BP_TOTAL;
      g.fornecedores.add(nota.fornecedorId);
    }
  }

  const ordenados = [...grupos.entries()].sort(
    ([ca, a], [cb, b]) => b.custoCents - a.custoCents || ca.localeCompare(cb),
  );
  const totalCents = ordenados.reduce((acc, [, g]) => acc + g.custoCents, 0);

  const resumo: Record<ClasseAbc, ResumoClasse> = {
    A: { itens: 0, custoCents: 0, participacaoBp: 0 },
    B: { itens: 0, custoCents: 0, participacaoBp: 0 },
    C: { itens: 0, custoCents: 0, participacaoBp: 0 },
  };

  let acumulado = 0;
  const insumos: InsumoAbc[] = ordenados.map(([chave, g]) => {
    const classe = totalCents > 0 ? classeAbc(acumulado, totalCents) : "C";
    acumulado += g.custoCents;
    resumo[classe].itens += 1;
    resumo[classe].custoCents += g.custoCents;
    const qtde = Math.round(g.qtde * 1000) / 1000; // Decimal(12,3) no banco
    return {
      chave,
      descricao: g.descricao,
      unidade: g.unidade,
      tipo: g.tipo,
      qtde,
      custoCents: g.custoCents,
      precoMedioCents: qtde > 0 ? Math.round(g.custoCents / qtde) : null,
      numFornecedores: g.fornecedores.size,
      participacaoBp: bpDe(g.custoCents, totalCents),
      acumuladoBp: bpDe(acumulado, totalCents),
      classe,
    };
  });

  for (const c of ["A", "B", "C"] as const) {
    resumo[c].participacaoBp = bpDe(resumo[c].custoCents, totalCents);
  }

  return { insumos, totalCents, resumo };
}

export type FaixaConsumo = "SEM_ORCAMENTO" | "OK" | "ATENCAO" | "ESTOURO";

const ATENCAO_BP = 9_000;

export function consumoBp(previstoCents: number, realizadoCents: number): number | null {
  return previstoCents > 0 ? Math.round((realizadoCents * BP_TOTAL) / previstoCents) : null;
}

export function faixaConsumo(previstoCents: number, realizadoCents: number): FaixaConsumo {
  if (previstoCents <= 0) return "SEM_ORCAMENTO";
  if (realizadoCents > previstoCents) return "ESTOURO";
  if (realizadoCents * BP_TOTAL >= previstoCents * ATENCAO_BP) return "ATENCAO";
  return "OK";
}

export type Severidade = "CRITICA" | "ATENCAO";

type TipoAlerta =
  | "ORCAMENTO_ESTOURO"
  | "ORCAMENTO_ATENCAO"
  | "PARCELA_VENCIDA"
  | "NOTA_DIVERGENTE";

export type Alerta = {
  id: string;
  tipo: TipoAlerta;
  severidade: Severidade;
  mensagem: string;
  link: string;
};

export type EtapaParaAlerta = {
  etapaId: string;
  etapaNome: string;
  obraId: string;
  obraNome: string;
  previstoCents: number;
  realizadoCents: number;
};

// Etapa sem orçamento não gera alerta: no começo da obra seriam quase todas, e viraria ruído.
export function alertasOrcamento(etapas: EtapaParaAlerta[]): Alerta[] {
  const estouros: [number, Alerta][] = [];
  const atencoes: [number, Alerta][] = [];

  for (const e of etapas) {
    const faixa = faixaConsumo(e.previstoCents, e.realizadoCents);
    const link = `/orcamento?obra=${e.obraId}`;
    const consumo = consumoBp(e.previstoCents, e.realizadoCents) ?? 0;
    if (faixa === "ESTOURO") {
      const excesso = e.realizadoCents - e.previstoCents;
      estouros.push([
        excesso,
        {
          id: `estouro:${e.etapaId}`,
          tipo: "ORCAMENTO_ESTOURO",
          severidade: "CRITICA",
          mensagem: `${e.obraNome} · ${e.etapaNome}: orçamento estourado em ${formatarMoeda(excesso)} (${formatarPercentBp(consumo)} consumido)`,
          link,
        },
      ]);
    } else if (faixa === "ATENCAO") {
      atencoes.push([
        consumo,
        {
          id: `atencao:${e.etapaId}`,
          tipo: "ORCAMENTO_ATENCAO",
          severidade: "ATENCAO",
          mensagem: `${e.obraNome} · ${e.etapaNome}: ${formatarPercentBp(consumo)} do orçamento consumido`,
          link,
        },
      ]);
    }
  }

  const porPeso = (a: [number, Alerta], b: [number, Alerta]) => b[0] - a[0];
  return [...estouros.sort(porPeso), ...atencoes.sort(porPeso)].map(([, alerta]) => alerta);
}

type ParcelaParaAlerta = {
  notaId: string;
  notaNumero: string;
  fornecedorNome: string;
  valorCents: number;
  vencimento: Date;
};

// Espera receber só parcelas ABERTAS.
export function alertasParcelasVencidas(
  parcelas: ParcelaParaAlerta[],
  hoje: Date = new Date(),
): Alerta[] {
  const limite = startOfDay(hoje);
  const porNota = new Map<
    string,
    { numero: string; fornecedor: string; qtd: number; valor: number; maisAntiga: Date }
  >();

  for (const p of parcelas) {
    if (p.vencimento >= limite) continue;
    const g = porNota.get(p.notaId);
    if (!g) {
      porNota.set(p.notaId, {
        numero: p.notaNumero,
        fornecedor: p.fornecedorNome,
        qtd: 1,
        valor: p.valorCents,
        maisAntiga: p.vencimento,
      });
    } else {
      g.qtd += 1;
      g.valor += p.valorCents;
      if (p.vencimento < g.maisAntiga) g.maisAntiga = p.vencimento;
    }
  }

  return [...porNota.entries()]
    .sort(([, a], [, b]) => a.maisAntiga.getTime() - b.maisAntiga.getTime())
    .map(([notaId, g]) => ({
      id: `vencida:${notaId}`,
      tipo: "PARCELA_VENCIDA" as const,
      severidade: "CRITICA" as const,
      mensagem:
        g.qtd === 1
          ? `${g.fornecedor} · NF ${g.numero}: parcela de ${formatarMoeda(g.valor)} vencida em ${formatarData(g.maisAntiga)}`
          : `${g.fornecedor} · NF ${g.numero}: ${g.qtd} parcelas vencidas (${formatarMoeda(g.valor)}) desde ${formatarData(g.maisAntiga)}`,
      link: `/notas/${notaId}`,
    }));
}

type NotaParaAlerta = {
  id: string;
  numero: string;
  fornecedorNome: string;
  totalCents: number;
  somaItensCents: number;
};

export function alertasDivergencia(notas: NotaParaAlerta[]): Alerta[] {
  return notas
    .filter((n) => n.somaItensCents !== n.totalCents)
    .sort(
      (a, b) =>
        Math.abs(b.totalCents - b.somaItensCents) - Math.abs(a.totalCents - a.somaItensCents),
    )
    .map((n) => ({
      id: `divergencia:${n.id}`,
      tipo: "NOTA_DIVERGENTE" as const,
      severidade: "ATENCAO" as const,
      mensagem: `${n.fornecedorNome} · NF ${n.numero}: itens somam ${formatarMoeda(n.somaItensCents)}, nota ${formatarMoeda(n.totalCents)}`,
      link: `/notas/${n.id}`,
    }));
}

const ORDEM_TIPO: Record<TipoAlerta, number> = {
  ORCAMENTO_ESTOURO: 0,
  PARCELA_VENCIDA: 1,
  ORCAMENTO_ATENCAO: 2,
  NOTA_DIVERGENTE: 3,
};

export function montarAlertas(entrada: {
  etapas: EtapaParaAlerta[];
  parcelas: ParcelaParaAlerta[];
  notas: NotaParaAlerta[];
  hoje?: Date;
}): Alerta[] {
  return [
    ...alertasOrcamento(entrada.etapas),
    ...alertasParcelasVencidas(entrada.parcelas, entrada.hoje),
    ...alertasDivergencia(entrada.notas),
  ].sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]);
}

type FiltroAbc = {
  obraId?: string;
  de?: Date;
  ate?: Date;
  tipo?: TipoItem;
};

// Sem filtro de obra a nota entra inteira, inclusive sem rateio (compra da empresa).
export async function carregarCurvaAbc(filtro: FiltroAbc = {}): Promise<CurvaAbc> {
  const where: Prisma.NotaFiscalWhereInput = {};
  if (filtro.obraId) where.rateios = { some: { obraId: filtro.obraId } };
  if (filtro.de || filtro.ate) {
    where.dataCompra = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }

  const notas = await prisma.notaFiscal.findMany({
    where,
    select: {
      fornecedorId: true,
      // sem filtro de obra, "" não casa com nenhum rateio (a fração não é usada)
      rateios: { where: { obraId: filtro.obraId ?? "" }, select: { fracaoBp: true } },
      itens: {
        where: filtro.tipo ? { tipo: filtro.tipo } : undefined,
        select: { descricao: true, unidade: true, tipo: true, qtde: true, totalCents: true },
      },
    },
  });

  return curvaAbc(
    notas.map((n) => ({
      fornecedorId: n.fornecedorId,
      fracaoBp: filtro.obraId ? (n.rateios[0]?.fracaoBp ?? 0) : BP_TOTAL,
      itens: n.itens.map((i) => ({ ...i, qtde: Number(i.qtde) })),
    })),
  );
}

export async function carregarAlertas(hoje: Date = new Date()): Promise<Alerta[]> {
  const [etapas, realizado, parcelas, notas] = await Promise.all([
    prisma.etapa.findMany({
      where: { orcamentoCents: { gt: 0 } },
      orderBy: [{ obra: { codigo: "asc" } }, { ordem: "asc" }],
      select: { id: true, nome: true, orcamentoCents: true, obra: { select: { id: true, nome: true } } },
    }),
    realizadoPorEtapaTodas(),
    prisma.parcela.findMany({
      where: { status: "ABERTA", vencimento: { lt: startOfDay(hoje) } },
      select: {
        valorCents: true,
        vencimento: true,
        nota: { select: { id: true, numero: true, fornecedor: { select: { nome: true } } } },
      },
    }),
    prisma.notaFiscal.findMany({
      select: {
        id: true,
        numero: true,
        totalCents: true,
        fornecedor: { select: { nome: true } },
        itens: { select: { totalCents: true } },
      },
    }),
  ]);

  return montarAlertas({
    hoje,
    etapas: etapas.map((e) => ({
      etapaId: e.id,
      etapaNome: e.nome,
      obraId: e.obra.id,
      obraNome: e.obra.nome,
      previstoCents: e.orcamentoCents,
      realizadoCents: realizado.get(e.id) ?? 0,
    })),
    parcelas: parcelas.map((p) => ({
      notaId: p.nota.id,
      notaNumero: p.nota.numero,
      fornecedorNome: p.nota.fornecedor.nome,
      valorCents: p.valorCents,
      vencimento: p.vencimento,
    })),
    notas: notas.map((n) => ({
      id: n.id,
      numero: n.numero,
      fornecedorNome: n.fornecedor.nome,
      totalCents: n.totalCents,
      somaItensCents: n.itens.reduce((a, i) => a + i.totalCents, 0),
    })),
  });
}
