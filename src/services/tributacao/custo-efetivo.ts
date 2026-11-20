import type { RegimeIbsCbs } from "@prisma/client";
import { dataParaInput } from "@/lib/format";
import { indexarClassificacoes, type Classificacoes, type ItemParaCredito } from "./credito";
import { custoDoItem } from "./custo-liquido";
import { crtValido, diaDe, INICIO_CREDITO_IBS_CBS, regimeDoCrt, type CrtEmitente, type RegimeFornecedor } from "./ibs-cbs";

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
  /** Descrição do item; identifica a linha acessória do IBS/CBS por fora. */
  descricao?: string | null;
  /** A nota tem IBS/CBS por fora: o total deste item não traz o imposto destacado nele. */
  ibsCbsPorFora?: boolean;
};

export type ContextoCustoEfetivo = {
  regimeEmpresa: RegimeIbsCbs;
  classificacoes: Classificacoes;
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

type Avaliada = {
  c: CompraParaCusto;
  dia: string;
  gasto: number;
  liquido: number;
  classificacaoPendente: boolean;
};

function avaliar(compras: readonly CompraParaCusto[], ctx: ContextoCustoEfetivo): Avaliada[] {
  const inicio = inicioDoPeriodo(ctx.agora, ctx.meses ?? MESES_PADRAO);
  const base = { regimeEmpresa: ctx.regimeEmpresa, classificacoes: indexarClassificacoes(ctx.classificacoes) };
  const out: Avaliada[] = [];
  for (const c of compras) {
    const dia = diaDe(c.dataEmissao);
    if (dia < inicio || !(c.qtde > 0)) continue;
    // a mesma regra do custo líquido da obra, inclusive o IBS/CBS por fora (o crédito é sempre gasto − líquido)
    const r = custoDoItem(
      { ...c.item, totalCents: c.totalCents, descricao: c.descricao },
      { ...base, dataEmissao: dia, porFora: !!c.ibsCbsPorFora },
    );
    out.push({ c, dia, gasto: r.brutoCents, liquido: r.liquidoCents, classificacaoPendente: r.situacao === "CLASSIFICACAO_DESCONHECIDA" });
  }
  return out;
}

type CrtDatado = { dia: string; crt: CrtEmitente };

// Fica com o CRT da nota mais recente; empate no dia mantém o primeiro visto.
function maisRecente(melhor: CrtDatado | null, dia: string, crtEmitente: string | null): CrtDatado | null {
  const crt = crtValido(crtEmitente);
  return crt && (!melhor || dia > melhor.dia) ? { dia, crt } : melhor;
}

/** CRT da nota mais recente que tem CRT; nulo se nenhuma tem. */
export function crtMaisRecente(notas: readonly { dataEmissao: Date | string; crtEmitente: string | null }[]): CrtEmitente | null {
  return notas.reduce<CrtDatado | null>((m, n) => maisRecente(m, diaDe(n.dataEmissao), n.crtEmitente), null)?.crt ?? null;
}

export type ModoComparacao =
  /** Há crédito na conta: efetivo = bruto − crédito. */
  | "EFETIVO"
  /** Empresa fora do regime regular: não há crédito, efetivo = bruto. */
  | "SEM_CREDITO_REGIME"
  /** Todas as compras são de antes de 2027: a comparação ainda é nominal. */
  | "NOMINAL_PERIODO_TESTE";

// Sem compras não há o que chamar de nominal: fica efetivo.
function modoDaComparacao(regimeEmpresa: RegimeIbsCbs, compras: number, comprasAntesDoCredito: number): ModoComparacao {
  if (regimeEmpresa !== "REGULAR") return "SEM_CREDITO_REGIME";
  return compras > 0 && comprasAntesDoCredito === compras ? "NOMINAL_PERIODO_TESTE" : "EFETIVO";
}

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
  /** CRT da compra mais recente do período (vale quando o contexto não traz o do fornecedor). */
  crt: CrtDatado | null;
  qtde: number;
  gasto: number;
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
        crt: null,
        qtde: 0,
        gasto: 0,
        liquido: 0,
        notas: new Set(),
        notasAntes: new Set(),
        pendentes: 0,
        ultima: "",
      };
      forns.set(a.c.fornecedorId, acc);
    }
    acc.crt = maisRecente(acc.crt, a.dia, a.c.crtEmitente);
    acc.qtde += a.c.qtde;
    acc.gasto += a.gasto;
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
        : (acc.crt?.crt ?? null);
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
        creditoCents: acc.gasto - acc.liquido,
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
    // cada nota é de um fornecedor só: somar as linhas não conta nota duas vezes
    const n = linhas.reduce((s, l) => s + l.compras, 0);
    grupos.push({
      n,
      grupo: {
        unidade,
        modo: modoDaComparacao(ctx.regimeEmpresa, n, linhas.reduce((s, l) => s + l.comprasAntesDoCredito, 0)),
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
  const gastoCents = avaliadas.reduce((s, a) => s + a.gasto, 0);
  return {
    gastoCents,
    creditoCents: gastoCents - avaliadas.reduce((s, a) => s + a.liquido, 0),
    compras: notas.size,
    comprasAntesDoCredito: antes.size,
    itensClassificacaoPendente: avaliadas.filter((a) => a.classificacaoPendente).length,
    modo: modoDaComparacao(ctx.regimeEmpresa, notas.size, antes.size),
  };
}
