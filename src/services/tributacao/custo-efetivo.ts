import type { RegimeIbsCbs } from "@prisma/client";
import { dataParaInput } from "@/lib/format";
import {
  classificacaoVigente,
  creditoDoItem,
  custoLiquidoCents,
  INICIO_CREDITO_IBS_CBS,
  type ClassificacaoParaCredito,
  type ItemParaCredito,
} from "./credito";
import { crtValido, type CrtEmitente } from "./ibs-cbs";

// Custo efetivo por fornecedor: o preço da nota menos o crédito de IBS/CBS que a construtora aproveita.
// Premissas:
// - só compara a mesma unidade (UN com M2 não se compara): um grupo por unidade;
// - preço médio ponderado pela quantidade (total ÷ qtde), não média dos unitários;
// - o crédito vem do que a nota destacou (creditoDoItem); fornecedor do Simples costuma destacar pouco ou nada,
//   então o preço dele sai "cheio". O regime exibido é só o rótulo: o cálculo olha o destaque de cada item;
// - empresa fora do regime regular ou compras de 2026 não geram crédito: o efetivo é igual ao bruto e a tela avisa.

export const MESES_PADRAO = 12;
/** Períodos oferecidos nas telas. */
export const PERIODOS_MESES = [6, 12, 24] as const;

export type RegimeFornecedor = "SIMPLES" | "NORMAL" | "MEI" | "NAO_IDENTIFICADO";

export const REGIME_FORNECEDOR_LABELS: Record<RegimeFornecedor, string> = {
  SIMPLES: "Simples",
  NORMAL: "Regime normal",
  MEI: "MEI",
  NAO_IDENTIFICADO: "Não identificado",
};

/** CRT 1 e 2 são Simples Nacional; ausente ou inválido (nota antiga, lançamento manual) é não identificado. */
export function regimeDoCrt(crt: string | null | undefined): RegimeFornecedor {
  const v = crtValido(crt);
  if (v === "1" || v === "2") return "SIMPLES";
  if (v === "3") return "NORMAL";
  if (v === "4") return "MEI";
  return "NAO_IDENTIFICADO";
}

/** Uma linha de item comprado (ItemNota + a nota dele). */
export type CompraParaCusto = {
  notaId: string;
  fornecedorId: string;
  fornecedorNome: string;
  unidade: string;
  qtde: number;
  /** Total do item já com desconto, em centavos. */
  totalCents: number;
  dataEmissao: Date | string;
  crtEmitente: string | null;
  item: ItemParaCredito;
};

export type ContextoCustoEfetivo = {
  regimeEmpresa: RegimeIbsCbs;
  classificacoes: readonly ClassificacaoParaCredito[];
  agora: Date;
  meses?: number;
  /** CRT mais recente de cada fornecedor (qualquer data); sem ele vale o das compras do período. */
  crtPorFornecedor?: ReadonlyMap<string, string | null>;
};

/** Dia (aaaa-mm-dd) em que o período de `meses` começa; dia 31 vira o último dia do mês menor. */
export function inicioDoPeriodo(agora: Date, meses: number): string {
  const [a, m, d] = dataParaInput(agora).split("-").map(Number);
  const total = a * 12 + (m - 1) - meses;
  const ano = Math.floor(total / 12);
  const mes = (((total % 12) + 12) % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** "m²", "M2." e "m2" são a mesma unidade. */
export function normalizarUnidade(unidade: string): string {
  const u = unidade.trim().toUpperCase().replace(/²/g, "2").replace(/³/g, "3").replace(/\./g, "");
  return u || "UN";
}

const diaDe = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : dataParaInput(d));

type Avaliada = {
  c: CompraParaCusto;
  dia: string;
  gasto: number;
  credito: number;
  liquido: number;
  classificacaoPendente: boolean;
};

function avaliar(compras: readonly CompraParaCusto[], ctx: ContextoCustoEfetivo): Avaliada[] {
  const inicio = inicioDoPeriodo(ctx.agora, ctx.meses ?? MESES_PADRAO);
  const out: Avaliada[] = [];
  for (const c of compras) {
    const dia = diaDe(c.dataEmissao);
    if (dia < inicio || !(c.qtde > 0)) continue;
    const r = creditoDoItem(c.item, {
      regimeEmpresa: ctx.regimeEmpresa,
      dataEmissao: dia,
      classificacao: classificacaoVigente(ctx.classificacoes, c.item.cClassTrib, dia),
    });
    const liquido = custoLiquidoCents(c.totalCents, r.creditoCents);
    out.push({
      c,
      dia,
      gasto: c.totalCents,
      credito: c.totalCents - liquido,
      liquido,
      classificacaoPendente: r.situacao === "CLASSIFICACAO_DESCONHECIDA",
    });
  }
  return out;
}

/** CRT da nota mais recente que tem CRT; nulo se nenhuma tem. */
export function crtMaisRecente(notas: readonly { dataEmissao: Date | string; crtEmitente: string | null }[]): CrtEmitente | null {
  let melhor: { dia: string; crt: CrtEmitente } | null = null;
  for (const n of notas) {
    const crt = crtValido(n.crtEmitente);
    const dia = diaDe(n.dataEmissao);
    if (crt && (!melhor || dia > melhor.dia)) melhor = { dia, crt };
  }
  return melhor?.crt ?? null;
}

export type ModoComparacao =
  /** Há crédito na conta: efetivo = bruto − crédito. */
  | "EFETIVO"
  /** Empresa fora do regime regular: não há crédito, efetivo = bruto. */
  | "SEM_CREDITO_REGIME"
  /** Todas as compras são de antes de 2027: a comparação ainda é nominal. */
  | "NOMINAL_PERIODO_TESTE";

export type LinhaFornecedor = {
  fornecedorId: string;
  fornecedorNome: string;
  regime: RegimeFornecedor;
  crt: CrtEmitente | null;
  /** Notas distintas no período. */
  compras: number;
  qtde: number;
  gastoCents: number;
  creditoCents: number;
  /** Centavos por unidade, arredondados; efetivo = bruto − crédito. */
  brutoUnitCents: number;
  creditoUnitCents: number;
  efetivoUnitCents: number;
  ultimaCompra: string;
  /** Notas de antes de 2027, sem crédito por definição. */
  comprasAntesDoCredito: number;
  /** Itens com crédito zerado porque a classificação tributária não foi reconhecida. */
  itensClassificacaoPendente: number;
};

export type GrupoUnidade = {
  unidade: string;
  modo: ModoComparacao;
  /** Ordenado pelo efetivo (menor primeiro). */
  fornecedores: LinhaFornecedor[];
  maisBaratoBrutoId: string | null;
  maisBaratoEfetivoId: string | null;
  /** O mais barato no bruto não é o mais barato no efetivo. */
  inversao: boolean;
  /** Quanto o mais barato no bruto custa a mais, por unidade, que o mais barato no efetivo (0 sem inversão). */
  diferencaUnitCents: number;
};

type Acc = {
  fornecedorId: string;
  fornecedorNome: string;
  rows: Avaliada[];
  qtde: number;
  gasto: number;
  credito: number;
  liquido: number;
  notas: Set<string>;
  notasAntes: Set<string>;
  pendentes: number;
  ultima: string;
};

/** Compara os fornecedores de um material, um grupo por unidade (o de mais compras primeiro). */
export function custoEfetivoPorFornecedor(compras: readonly CompraParaCusto[], ctx: ContextoCustoEfetivo): GrupoUnidade[] {
  const porUnidade = new Map<string, Map<string, Acc>>();
  for (const a of avaliar(compras, ctx)) {
    const u = normalizarUnidade(a.c.unidade);
    const forns = porUnidade.get(u) ?? new Map<string, Acc>();
    porUnidade.set(u, forns);
    let acc = forns.get(a.c.fornecedorId);
    if (!acc) {
      acc = {
        fornecedorId: a.c.fornecedorId,
        fornecedorNome: a.c.fornecedorNome,
        rows: [],
        qtde: 0,
        gasto: 0,
        credito: 0,
        liquido: 0,
        notas: new Set(),
        notasAntes: new Set(),
        pendentes: 0,
        ultima: "",
      };
      forns.set(a.c.fornecedorId, acc);
    }
    acc.rows.push(a);
    acc.qtde += a.c.qtde;
    acc.gasto += a.gasto;
    acc.credito += a.credito;
    acc.liquido += a.liquido;
    acc.notas.add(a.c.notaId);
    if (a.dia < INICIO_CREDITO_IBS_CBS) acc.notasAntes.add(a.c.notaId);
    if (a.classificacaoPendente) acc.pendentes += 1;
    if (a.dia > acc.ultima) acc.ultima = a.dia;
  }

  const grupos: { grupo: GrupoUnidade; n: number }[] = [];
  for (const [unidade, forns] of porUnidade) {
    const precisos = new Map<string, { bruto: number; efetivo: number }>();
    const linhas: LinhaFornecedor[] = [];
    for (const [id, acc] of forns) {
      const crt = ctx.crtPorFornecedor?.has(id)
        ? crtValido(ctx.crtPorFornecedor.get(id))
        : crtMaisRecente(acc.rows.map((r) => ({ dataEmissao: r.dia, crtEmitente: r.c.crtEmitente })));
      const bruto = Math.round(acc.gasto / acc.qtde);
      const efetivo = Math.round(acc.liquido / acc.qtde);
      precisos.set(id, { bruto: acc.gasto / acc.qtde, efetivo: acc.liquido / acc.qtde });
      linhas.push({
        fornecedorId: id,
        fornecedorNome: acc.fornecedorNome,
        regime: regimeDoCrt(crt),
        crt,
        compras: acc.notas.size,
        qtde: acc.qtde,
        gastoCents: acc.gasto,
        creditoCents: acc.credito,
        brutoUnitCents: bruto,
        creditoUnitCents: bruto - efetivo,
        efetivoUnitCents: efetivo,
        ultimaCompra: acc.ultima,
        comprasAntesDoCredito: acc.notasAntes.size,
        itensClassificacaoPendente: acc.pendentes,
      });
    }
    const p = (l: LinhaFornecedor) => precisos.get(l.fornecedorId)!;
    const nome = (a: LinhaFornecedor, b: LinhaFornecedor) =>
      a.fornecedorNome.localeCompare(b.fornecedorNome, "pt-BR") || a.fornecedorId.localeCompare(b.fornecedorId);
    linhas.sort((a, b) => p(a).efetivo - p(b).efetivo || p(a).bruto - p(b).bruto || nome(a, b));

    // empate no bruto desempata pelo efetivo, para não acusar inversão onde só há empate
    const baratoBruto = [...linhas].sort((a, b) => p(a).bruto - p(b).bruto || p(a).efetivo - p(b).efetivo || nome(a, b))[0];
    const barato = linhas[0];
    const inversao = linhas.length > 1 && p(baratoBruto).efetivo > p(barato).efetivo;
    const modo: ModoComparacao =
      ctx.regimeEmpresa !== "REGULAR"
        ? "SEM_CREDITO_REGIME"
        : linhas.every((l) => l.comprasAntesDoCredito === l.compras)
          ? "NOMINAL_PERIODO_TESTE"
          : "EFETIVO";
    grupos.push({
      n: linhas.reduce((s, l) => s + l.compras, 0),
      grupo: {
        unidade,
        modo,
        fornecedores: linhas,
        maisBaratoBrutoId: baratoBruto.fornecedorId,
        maisBaratoEfetivoId: barato.fornecedorId,
        inversao,
        diferencaUnitCents: inversao ? baratoBruto.efetivoUnitCents - barato.efetivoUnitCents : 0,
      },
    });
  }
  return grupos.sort((a, b) => b.n - a.n || a.grupo.unidade.localeCompare(b.grupo.unidade)).map((g) => g.grupo);
}

export type CreditoDoFornecedor = {
  gastoCents: number;
  /** Crédito de IBS/CBS que as compras do período geraram. */
  creditoCents: number;
  compras: number;
  comprasAntesDoCredito: number;
  itensClassificacaoPendente: number;
  modo: ModoComparacao;
};

/** Crédito gerado pelas compras de um fornecedor no período (todas as unidades e tipos de item). */
export function creditoDasCompras(compras: readonly CompraParaCusto[], ctx: ContextoCustoEfetivo): CreditoDoFornecedor {
  const avaliadas = avaliar(compras, ctx);
  const notas = new Set(avaliadas.map((a) => a.c.notaId));
  const antes = new Set(avaliadas.filter((a) => a.dia < INICIO_CREDITO_IBS_CBS).map((a) => a.c.notaId));
  return {
    gastoCents: avaliadas.reduce((s, a) => s + a.gasto, 0),
    creditoCents: avaliadas.reduce((s, a) => s + a.credito, 0),
    compras: notas.size,
    comprasAntesDoCredito: antes.size,
    itensClassificacaoPendente: avaliadas.filter((a) => a.classificacaoPendente).length,
    modo: ctx.regimeEmpresa !== "REGULAR" ? "SEM_CREDITO_REGIME" : notas.size > 0 && antes.size === notas.size ? "NOMINAL_PERIODO_TESTE" : "EFETIVO",
  };
}
