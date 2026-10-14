import { startOfDay } from "date-fns";
import type { Prisma, TipoItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatarData, formatarMoeda, formatarPercentBp } from "@/lib/format";
import { BP_TOTAL, custoRateado } from "./rateio";
import { realizadoPorEtapaTodas } from "./custos";

/**
 * Análises gerenciais: curva ABC de insumos e alertas da operação.
 * As funções puras ficam no topo (testadas em `__tests__/analises.test.ts`);
 * os carregadores do banco ficam no fim do arquivo e só montam a entrada.
 */

// ---------------------------------------------------------------------------
// Curva ABC de insumos
// ---------------------------------------------------------------------------

export type ClasseAbc = "A" | "B" | "C";

/** Limites de classe sobre o custo acumulado (A até 80%, B até 95%, C o resto). */
export const LIMITE_A_BP = 8_000;
export const LIMITE_B_BP = 9_500;

export type NotaParaAbc = {
  fornecedorId: string;
  /** Fração da nota que entra na análise: o rateio da obra filtrada, ou 100% sem filtro. */
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
  /** descrição normalizada + unidade — identifica o insumo. */
  chave: string;
  descricao: string;
  unidade: string;
  tipo: TipoItem;
  qtde: number;
  custoCents: number;
  /** custo ÷ quantidade, em centavos por unidade (null se a quantidade for zero). */
  precoMedioCents: number | null;
  numFornecedores: number;
  participacaoBp: number;
  /** participação acumulada até este insumo, inclusive. */
  acumuladoBp: number;
  classe: ClasseAbc;
};

export type ResumoClasse = { itens: number; custoCents: number; participacaoBp: number };

export type CurvaAbc = {
  insumos: InsumoAbc[];
  totalCents: number;
  resumo: Record<ClasseAbc, ResumoClasse>;
};

/**
 * Normalização de descrição copiada de `services/dependencia.ts#normalizar`
 * (lá não é exportada e o arquivo é de outro módulo). Mantenha as duas iguais
 * para que "insumo" signifique a mesma coisa na dependência e na curva ABC.
 */
export function normalizarDescricao(descricao: string): string {
  return descricao.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizarUnidade(unidade: string): string {
  return unidade.trim().toUpperCase();
}

/**
 * Classe de um insumo pela participação acumulada *antes* dele: o insumo que
 * cruza a linha de 80% ainda é A (senão um único insumo com 90% do custo
 * ficaria B). Comparação em centavos, sem arredondar percentuais.
 */
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
  /** maior item visto — dá a grafia e o tipo exibidos. */
  maiorItemCents: number;
  qtde: number;
  custoCents: number;
  fornecedores: Set<string>;
};

/**
 * Curva ABC: agrupa os itens por descrição normalizada + unidade, soma o
 * custo (× fração do rateio quando há filtro por obra), ordena do maior para
 * o menor e classifica em A/B/C. A quantidade também é multiplicada pela
 * fração — assim o preço médio não muda com o filtro e a quantidade
 * representa a parte da compra que coube à obra.
 */
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

// ---------------------------------------------------------------------------
// Orçamento: faixa de consumo por etapa
// ---------------------------------------------------------------------------

export type FaixaConsumo = "SEM_ORCAMENTO" | "OK" | "ATENCAO" | "ESTOURO";

/** A partir de quanto consumido do previsto a etapa entra em atenção. */
export const ATENCAO_BP = 9_000;

/** Consumo do orçamento em basis points (null quando não há previsto). */
export function consumoBp(previstoCents: number, realizadoCents: number): number | null {
  return previstoCents > 0 ? Math.round((realizadoCents * BP_TOTAL) / previstoCents) : null;
}

/**
 * Faixa do consumo: estouro quando o realizado passa do previsto, atenção a
 * partir de 90% consumido. Comparação em centavos (sem arredondar o %).
 */
export function faixaConsumo(previstoCents: number, realizadoCents: number): FaixaConsumo {
  if (previstoCents <= 0) return "SEM_ORCAMENTO";
  if (realizadoCents > previstoCents) return "ESTOURO";
  if (realizadoCents * BP_TOTAL >= previstoCents * ATENCAO_BP) return "ATENCAO";
  return "OK";
}

// ---------------------------------------------------------------------------
// Alertas da operação
// ---------------------------------------------------------------------------

export type Severidade = "CRITICA" | "ATENCAO";

export type TipoAlerta =
  | "ORCAMENTO_ESTOURO"
  | "ORCAMENTO_ATENCAO"
  | "PARCELA_VENCIDA"
  | "NOTA_DIVERGENTE";

export type Alerta = {
  /** chave estável, para `key` de listas. */
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

/**
 * Etapas estouradas (realizado > previsto) e em atenção (≥ 90% consumido).
 * Etapas sem orçamento definido não geram alerta — seriam quase todas no
 * começo da obra e o alerta viraria ruído. Estouros vêm do maior excesso
 * para o menor; atenções, do mais consumido para o menos.
 */
export function alertasOrcamento(etapas: EtapaParaAlerta[]): Alerta[] {
  // [peso de ordenação, alerta]
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

export type ParcelaParaAlerta = {
  notaId: string;
  notaNumero: string;
  fornecedorNome: string;
  valorCents: number;
  vencimento: Date;
};

/**
 * Parcelas em aberto vencidas antes de hoje, agrupadas por nota (uma nota com
 * três parcelas atrasadas vira um alerta só). A mais antiga vem primeiro.
 * Espera receber apenas parcelas ABERTAS.
 */
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

export type NotaParaAlerta = {
  id: string;
  numero: string;
  fornecedorNome: string;
  totalCents: number;
  somaItensCents: number;
};

/** Notas cujo total difere da soma dos itens; a maior diferença vem primeiro. */
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

/**
 * Junta todos os alertas: críticos primeiro (estouro, depois parcela
 * vencida), depois atenção (orçamento, depois divergência). Dentro de cada
 * tipo mantém a ordem de cada gerador (sort estável).
 */
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

// ---------------------------------------------------------------------------
// Carregadores (banco → entrada das funções puras)
// ---------------------------------------------------------------------------

export type FiltroAbc = {
  obraId?: string;
  /** início do período (dataCompra ≥ de). */
  de?: Date;
  /** fim do período (dataCompra ≤ ate). */
  ate?: Date;
  tipo?: TipoItem;
};

/**
 * Curva ABC a partir das notas do banco. Sem filtro de obra, a nota entra
 * inteira (100%) — inclusive notas sem rateio, que são compras da empresa.
 * Com filtro, entra só a fração rateada para a obra.
 */
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
      // sem filtro de obra a fração não é usada: "" não casa com nenhum rateio
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

/** Todos os alertas da operação, já ordenados por severidade. */
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
    // mesma checagem do antigo KPI de divergências: carrega os totais dos itens
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
