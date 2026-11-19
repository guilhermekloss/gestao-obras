import { startOfDay } from "date-fns";
import type { Prisma, TipoDocumento, TipoItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataParaInput, formatarData, formatarMoeda, formatarPercentBp } from "@/lib/format";
import { BP_TOTAL, custoRateado } from "./rateio";
import { avancoPorEtapa, medicoesTodas, notasParaAnalise, realizadoPorEtapaTodas, realizadoPorObra } from "./custos";
import { diaDoBanco, realizadoPorEtapaNaData, situacaoEtapa, type Dia, type MedicaoPonto } from "./cronograma";
import { TIPO_DOCUMENTO_BADGE } from "./financeiro";
import { normalizarDescricao } from "./materiais";
import { carregarAlertasDaCaptura } from "./sefaz/painel";
import { desempenhoCusto, totalDesempenho } from "./desempenho-custo";
import { CAMPOS_TRIBUTARIOS, liquidarItensDasNotas } from "./tributacao/custo-liquido-db";

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
  | "ORCAMENTO_TENDENCIA"
  | "ETAPA_ATRASADA"
  | "PARCELA_VENCIDA"
  | "NOTA_DIVERGENTE"
  | "SEFAZ_CERTIFICADO"
  | "SEFAZ_FALHA"
  | "NFE_RECEBIDA";

export type Alerta = {
  id: string;
  tipo: TipoAlerta;
  severidade: Severidade;
  mensagem: string;
  link: string;
  /** Obra a que o alerta se refere, quando é de uma obra só (filtro do dashboard). */
  obraId?: string;
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
          obraId: e.obraId,
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
          obraId: e.obraId,
        },
      ]);
    }
  }

  const porPeso = (a: [number, Alerta], b: [number, Alerta]) => b[0] - a[0];
  return [...estouros.sort(porPeso), ...atencoes.sort(porPeso)].map(([, alerta]) => alerta);
}

// Resumo de uma obra para os alertas que olham a obra inteira. A fase do cronograma
// (ETAPA_ATRASADA) entra aqui com a contagem de etapas atrasadas.
export type ObraParaAlerta = {
  obraId: string;
  obraNome: string;
  orcamentoCents: number;
  /** Tendência de custo da obra (soma das etapas, ver `desempenho-custo`). */
  tendenciaCents: number;
  /** Avanço físico ponderado da obra, em base 10000. */
  fisicoBp: number;
  /** Etapas em situação ATRASADA no cronograma (plano atual, medições até hoje). */
  etapasAtrasadas?: number;
};

// Uma por obra, a com mais etapas atrasadas primeiro. Mesma regra da tela do Cronograma (`situacaoEtapa`).
export function alertasAtraso(obras: ObraParaAlerta[]): Alerta[] {
  return obras
    .filter((o) => (o.etapasAtrasadas ?? 0) > 0)
    .sort((a, b) => (b.etapasAtrasadas ?? 0) - (a.etapasAtrasadas ?? 0))
    .map((o) => {
      const n = o.etapasAtrasadas ?? 0;
      return {
        id: `atraso:${o.obraId}`,
        tipo: "ETAPA_ATRASADA" as const,
        severidade: "ATENCAO" as const,
        mensagem: `${o.obraNome}: ${n} ${n === 1 ? "etapa atrasada" : "etapas atrasadas"} no cronograma`,
        link: `/cronograma?obra=${o.obraId}`,
        obraId: o.obraId,
      };
    });
}

type EtapaComDatas = { id: string; obraId: string; inicioPrevisto: Dia | null; fimPrevisto: Dia | null };

// Realizado de cada etapa = última medição até hoje (medição datada no futuro ainda não conta), como no Cronograma.
export function contarEtapasAtrasadas(
  etapas: EtapaComDatas[],
  medicoes: MedicaoPonto[],
  hoje: Dia,
): Map<string, number> {
  const realizado = realizadoPorEtapaNaData(medicoes, hoje);
  const contagem = new Map<string, number>();
  for (const e of etapas) {
    if (situacaoEtapa(e, realizado.get(e.id) ?? 0, hoje) !== "ATRASADA") continue;
    contagem.set(e.obraId, (contagem.get(e.obraId) ?? 0) + 1);
  }
  return contagem;
}

export const TENDENCIA_LIMITE_BP = 500; // 5% acima do orçado
export const TENDENCIA_FISICO_MINIMO_BP = 1_000; // abaixo de 10% de físico a projeção é ruído

// Uma por obra, maior desvio primeiro. Obra sem orçamento fica de fora (não há com o que comparar).
export function alertasTendencia(obras: ObraParaAlerta[]): Alerta[] {
  return obras
    .filter(
      (o) =>
        o.orcamentoCents > 0 &&
        o.fisicoBp >= TENDENCIA_FISICO_MINIMO_BP &&
        (o.tendenciaCents - o.orcamentoCents) * BP_TOTAL > o.orcamentoCents * TENDENCIA_LIMITE_BP,
    )
    .map((o) => ({ o, desvioBp: Math.round(((o.tendenciaCents - o.orcamentoCents) * BP_TOTAL) / o.orcamentoCents) }))
    .sort((a, b) => b.desvioBp - a.desvioBp)
    .map(({ o, desvioBp }) => ({
      id: `tendencia:${o.obraId}`,
      tipo: "ORCAMENTO_TENDENCIA" as const,
      severidade: "ATENCAO" as const,
      mensagem: `${o.obraNome}: no ritmo atual a obra deve custar ${formatarMoeda(o.tendenciaCents)}, ${formatarPercentBp(desvioBp)} acima do orçado (${formatarMoeda(o.orcamentoCents)})`,
      link: `/orcamento?obra=${o.obraId}`,
      obraId: o.obraId,
    }));
}

// "NF 123", "Recibo REC-0001"; ausente = NF.
export function rotuloDocumento(tipo: TipoDocumento | undefined, numero: string): string {
  return `${TIPO_DOCUMENTO_BADGE[tipo ?? "NF"]} ${numero}`;
}

// Mesma regra do alerta do dashboard e do filtro "divergentes" da lista de lançamentos.
export function notaDivergente(totalCents: number, somaItensCents: number): boolean {
  return somaItensCents !== totalCents;
}

// Ids das notas cuja soma dos itens difere do total, na ordem recebida. Nota sem itens soma 0.
export function idsDeNotasDivergentes(
  notas: { id: string; totalCents: number }[],
  somaItensPorNota: Map<string, number>,
): string[] {
  return notas.filter((n) => notaDivergente(n.totalCents, somaItensPorNota.get(n.id) ?? 0)).map((n) => n.id);
}

type ParcelaParaAlerta = {
  notaId: string;
  notaNumero: string;
  tipoDocumento?: TipoDocumento;
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
    { numero: string; tipo?: TipoDocumento; fornecedor: string; qtd: number; valor: number; maisAntiga: Date }
  >();

  for (const p of parcelas) {
    if (p.vencimento >= limite) continue;
    const g = porNota.get(p.notaId);
    if (!g) {
      porNota.set(p.notaId, {
        numero: p.notaNumero,
        tipo: p.tipoDocumento,
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
          ? `${g.fornecedor} · ${rotuloDocumento(g.tipo, g.numero)}: parcela de ${formatarMoeda(g.valor)} vencida em ${formatarData(g.maisAntiga)}`
          : `${g.fornecedor} · ${rotuloDocumento(g.tipo, g.numero)}: ${g.qtd} parcelas vencidas (${formatarMoeda(g.valor)}) desde ${formatarData(g.maisAntiga)}`,
      link: `/notas/${notaId}`,
    }));
}

type NotaParaAlerta = {
  id: string;
  numero: string;
  tipoDocumento?: TipoDocumento;
  fornecedorNome: string;
  totalCents: number;
  somaItensCents: number;
};

export function alertasDivergencia(notas: NotaParaAlerta[]): Alerta[] {
  return notas
    .filter((n) => notaDivergente(n.totalCents, n.somaItensCents))
    .sort(
      (a, b) =>
        Math.abs(b.totalCents - b.somaItensCents) - Math.abs(a.totalCents - a.somaItensCents),
    )
    .map((n) => ({
      id: `divergencia:${n.id}`,
      tipo: "NOTA_DIVERGENTE" as const,
      severidade: "ATENCAO" as const,
      mensagem: `${n.fornecedorNome} · ${rotuloDocumento(n.tipoDocumento, n.numero)}: itens somam ${formatarMoeda(n.somaItensCents)}, nota ${formatarMoeda(n.totalCents)}`,
      link: `/notas/${n.id}`,
    }));
}

const ORDEM_TIPO: Record<TipoAlerta, number> = {
  ORCAMENTO_ESTOURO: 0,
  PARCELA_VENCIDA: 1,
  SEFAZ_CERTIFICADO: 2,
  SEFAZ_FALHA: 3,
  ORCAMENTO_ATENCAO: 4,
  ETAPA_ATRASADA: 5,
  ORCAMENTO_TENDENCIA: 6,
  NOTA_DIVERGENTE: 7,
  NFE_RECEBIDA: 8,
};

export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]);
}

export function montarAlertas(entrada: {
  etapas: EtapaParaAlerta[];
  obras?: ObraParaAlerta[];
  parcelas: ParcelaParaAlerta[];
  notas: NotaParaAlerta[];
  hoje?: Date;
}): Alerta[] {
  return ordenarAlertas([
    ...alertasOrcamento(entrada.etapas),
    ...alertasTendencia(entrada.obras ?? []),
    ...alertasAtraso(entrada.obras ?? []),
    ...alertasParcelasVencidas(entrada.parcelas, entrada.hoje),
    ...alertasDivergencia(entrada.notas),
  ]);
}

type FiltroAbc = {
  obraId?: string;
  de?: Date;
  ate?: Date;
  tipo?: TipoItem;
  /** Custo de cada item líquido do crédito de IBS/CBS (regime regular, notas de 2027 em diante). */
  liquido?: boolean;
};

// Sem filtro de obra a nota entra inteira, inclusive sem rateio (compra da empresa).
export async function carregarCurvaAbc(filtro: FiltroAbc = {}): Promise<CurvaAbc> {
  // sem filtro nenhum, reaproveita a leitura de notas da requisição (mesmo resultado da consulta abaixo)
  if (!filtro.obraId && !filtro.de && !filtro.ate && !filtro.tipo && !filtro.liquido) {
    const todas = await notasParaAnalise();
    return curvaAbc(
      todas.map((n) => ({
        fornecedorId: n.fornecedorId,
        fracaoBp: BP_TOTAL,
        itens: n.itens.map((i) => ({ ...i, qtde: Number(i.qtde) })),
      })),
    );
  }

  const where: Prisma.NotaFiscalWhereInput = {};
  if (filtro.obraId) where.rateios = { some: { obraId: filtro.obraId } };
  if (filtro.de || filtro.ate) {
    where.dataCompra = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }

  const notasDoBanco = await prisma.notaFiscal.findMany({
    where,
    select: {
      fornecedorId: true,
      ...(filtro.liquido ? { dataCompra: true } : {}),
      // sem filtro de obra, "" não casa com nenhum rateio (a fração não é usada)
      rateios: { where: { obraId: filtro.obraId ?? "" }, select: { fracaoBp: true } },
      itens: {
        where: filtro.tipo ? { tipo: filtro.tipo } : undefined,
        select: {
          descricao: true,
          unidade: true,
          tipo: true,
          qtde: true,
          totalCents: true,
          ...(filtro.liquido ? CAMPOS_TRIBUTARIOS : {}),
        },
      },
    },
  });
  // o spread condicional some do tipo inferido: no modo líquido as notas trazem a data e os campos tributários
  const notas = filtro.liquido
    ? await liquidarItensDasNotas(notasDoBanco as unknown as Parameters<typeof liquidarItensDasNotas>[0]) as unknown as typeof notasDoBanco
    : notasDoBanco;

  return curvaAbc(
    notas.map((n) => ({
      fornecedorId: n.fornecedorId,
      fracaoBp: filtro.obraId ? (n.rateios[0]?.fracaoBp ?? 0) : BP_TOTAL,
      itens: n.itens.map((i) => ({ ...i, qtde: Number(i.qtde) })),
    })),
  );
}

type EtapaComObra = { id: string; obraId: string; orcamentoCents: number };

// Tendência por obra: uma linha por etapa e o realizado sem etapa como linha à parte (sem orçado, sem físico),
// a mesma conta da tela de Orçamento.
export function resumirObrasParaAlerta(
  obras: { id: string; nome: string }[],
  etapas: EtapaComObra[],
  realizadoPorEtapa: Map<string, number>,
  realizadoPorObra: Map<string, number>,
  avancos: Map<string, number>,
  atrasadas: Map<string, number> = new Map(),
): ObraParaAlerta[] {
  const porObra = new Map<string, EtapaComObra[]>();
  for (const e of etapas) {
    const lista = porObra.get(e.obraId);
    if (lista) lista.push(e);
    else porObra.set(e.obraId, [e]);
  }
  return obras.map((o) => {
    const linhas = (porObra.get(o.id) ?? []).map((e) =>
      desempenhoCusto({
        orcamentoCents: e.orcamentoCents,
        realizadoCents: realizadoPorEtapa.get(e.id) ?? 0,
        fisicoBp: avancos.get(e.id) ?? 0,
      }),
    );
    const comEtapa = linhas.reduce((a, l) => a + l.realizadoCents, 0);
    const semEtapa = (realizadoPorObra.get(o.id) ?? 0) - comEtapa;
    const total = totalDesempenho(
      semEtapa > 0
        ? [...linhas, desempenhoCusto({ orcamentoCents: 0, realizadoCents: semEtapa, fisicoBp: 0 })]
        : linhas,
    );
    return {
      obraId: o.id,
      obraNome: o.nome,
      orcamentoCents: total.orcamentoCents,
      tendenciaCents: total.tendenciaCents,
      fisicoBp: total.fisicoBp,
      etapasAtrasadas: atrasadas.get(o.id) ?? 0,
    };
  });
}

/**
 * `paraAdmin`: inclui os alertas da captura na Sefaz que só o ADMIN resolve (certificado, falhas).
 * `obraId`: só o que é daquela obra (orçamento e tendência dela; parcelas e notas rateadas para ela).
 * Os alertas da captura são da empresa, não de uma obra, e ficam fora do filtro.
 */
export async function carregarAlertas(
  hoje: Date = new Date(),
  opcoes: { paraAdmin?: boolean; obraId?: string } = {},
): Promise<Alerta[]> {
  const { obraId } = opcoes;
  const [etapas, realizadoEtapa, realizadoObra, avancos, medicoes, parcelas, notas, captura] = await Promise.all([
    prisma.etapa.findMany({
      where: obraId ? { obraId } : {},
      orderBy: [{ obra: { codigo: "asc" } }, { ordem: "asc" }],
      select: {
        id: true,
        nome: true,
        orcamentoCents: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        obra: { select: { id: true, nome: true } },
      },
    }),
    realizadoPorEtapaTodas(),
    realizadoPorObra(),
    // físico de hoje: medição datada no futuro não conta (mesmo critério do Cronograma)
    avancoPorEtapa(undefined, { ate: dataParaInput(hoje) }),
    // a mesma leitura de avancoPorEtapa() (cache por requisição): não é consulta a mais
    medicoesTodas(),
    prisma.parcela.findMany({
      where: {
        status: "ABERTA",
        vencimento: { lt: startOfDay(hoje) },
        ...(obraId ? { nota: { rateios: { some: { obraId } } } } : {}),
      },
      select: {
        valorCents: true,
        vencimento: true,
        nota: { select: { id: true, numero: true, tipoDocumento: true, fornecedor: { select: { nome: true } } } },
      },
    }),
    notasParaAnalise(),
    obraId ? Promise.resolve([]) : carregarAlertasDaCaptura(opcoes.paraAdmin ?? false, hoje),
  ]);

  // obra sem etapa não tem orçamento, então não gera alerta de obra: basta tirar as obras das etapas
  const obras = [...new Map(etapas.map((e) => [e.obra.id, e.obra])).values()];
  const alertas = montarAlertas({
    hoje,
    etapas: etapas.map((e) => ({
      etapaId: e.id,
      etapaNome: e.nome,
      obraId: e.obra.id,
      obraNome: e.obra.nome,
      previstoCents: e.orcamentoCents,
      realizadoCents: realizadoEtapa.get(e.id) ?? 0,
    })),
    obras: resumirObrasParaAlerta(
      obras,
      etapas.map((e) => ({ id: e.id, obraId: e.obra.id, orcamentoCents: e.orcamentoCents })),
      realizadoEtapa,
      realizadoObra,
      avancos,
      contarEtapasAtrasadas(
        etapas.map((e) => ({
          id: e.id,
          obraId: e.obra.id,
          inicioPrevisto: e.inicioPrevisto ? diaDoBanco(e.inicioPrevisto) : null,
          fimPrevisto: e.fimPrevisto ? diaDoBanco(e.fimPrevisto) : null,
        })),
        // medição gravada ao meio-dia local: o dia sai pelo fuso local, como no Cronograma
        medicoes.map((m) => ({ etapaId: m.etapaId, data: dataParaInput(m.data), percentBp: m.percentBp })),
        dataParaInput(hoje),
      ),
    ),
    parcelas: parcelas.map((p) => ({
      notaId: p.nota.id,
      notaNumero: p.nota.numero,
      tipoDocumento: p.nota.tipoDocumento,
      fornecedorNome: p.nota.fornecedor.nome,
      valorCents: p.valorCents,
      vencimento: p.vencimento,
    })),
    notas: notas
      .filter((n) => !obraId || n.rateios.some((r) => r.obraId === obraId))
      .map((n) => ({
        id: n.id,
        numero: n.numero,
        tipoDocumento: n.tipoDocumento,
        fornecedorNome: n.fornecedor.nome,
        totalCents: n.totalCents,
        somaItensCents: n.itens.reduce((a, i) => a + i.totalCents, 0),
      })),
  });
  return ordenarAlertas([...alertas, ...captura]);
}
