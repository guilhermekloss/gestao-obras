// Conferência do IBS/CBS que o fornecedor destacou na nota. Só avisa: nada aqui bloqueia o lançamento.
// Regras simples e puras, sem recalcular o imposto (isso é com o fornecedor e o contador dele).
import { formatarMoeda } from "@/lib/format";
import type { TotaisIbsCbs } from "./ibs-cbs";
import { classificacaoVigente, type ClassificacaoParaCredito } from "./credito";

/** Primeiro dia da reforma nos documentos fiscais (ano de teste). */
export const INICIO_IBS_CBS_NA_NOTA = "2026-01-01";
/** Primeiro dia em que a falta de destaque custa crédito (ver credito.ts). */
const INICIO_CREDITO = "2027-01-01";

/** Item como a conferência enxerga: colunas de ItemNota, com alíquotas em texto decimal. */
export type ItemParaConferir = {
  ncm: string | null;
  nbs: string | null;
  cst: string | null;
  cClassTrib: string | null;
  ibsCbsBaseCents: number | null;
  pCbs: string | null;
  pIbsUf: string | null;
  pIbsMun: string | null;
  pRedCbs: string | null;
  pRedIbs: string | null;
  cbsCents: number | null;
  ibsUfCents: number | null;
  ibsMunCents: number | null;
  ibsCbsDiferidoCents: number | null;
};

/** O que a conferência precisa da ClassificacaoTributaria (ClassificacaoTributariaRef serve). */
export type ClassificacaoParaConferir = ClassificacaoParaCredito & {
  cst: string;
  descricao: string;
  pRedCbs: string | null;
  pRedIbs: string | null;
  /** A classificação prevê redução de alíquota; sem ela, o pRed da carga não vale (imunidades trazem 100). */
  indReducao: boolean;
};

/** Linha de ClassificacaoNomenclatura com vigências em aaaa-mm-dd. */
export type NomenclaturaRef = {
  tipo: string;
  codigo: string;
  cClassTrib: string;
  excecao: boolean;
  inicioVigencia: string;
  fimVigencia: string | null;
};

export type ContextoConferencia = {
  /** Emissão da nota, aaaa-mm-dd. */
  dataEmissao: string;
  crtEmitente: string | null;
  /** Todas as vigências dos códigos da nota. */
  classificacoes: readonly ClassificacaoParaConferir[];
  nomenclaturas: readonly NomenclaturaRef[];
  /** total/IBSCBSTot; nulo quando a nota não traz (ou já foi salva: os totais não são guardados). */
  totais?: TotaisIbsCbs | null;
};

export type Severidade = "ATENCAO" | "INFO";

export type CodigoAchado =
  | "CLASSIFICACAO_INEXISTENTE"
  | "CLASSIFICACAO_FORA_DE_VIGENCIA"
  | "CST_DIVERGENTE"
  | "NOMENCLATURA_INCOMPATIVEL"
  | "REDUCAO_DIVERGENTE"
  | "VALOR_DIVERGENTE"
  | "TOTAIS_DIVERGENTES"
  | "SEM_DESTAQUE_DO_FORNECEDOR"
  | "CREDITO_VEDADO"
  | "CREDITO_PARCIAL";

export type AchadoConferencia = {
  /** Posição do item na nota; nulo quando o aviso é da nota toda. */
  itemIndex: number | null;
  severidade: Severidade;
  codigo: CodigoAchado;
  mensagem: string;
};

/** Arredondamento do fornecedor: 1 centavo por tributo (e por item nos totais). */
export const TOLERANCIA_CENTAVOS = 1;
const TOLERANCIA_PERCENTUAL = 0.0001;

function numero(texto: string | null): number {
  const n = texto === null ? 0 : Number(texto);
  return Number.isFinite(n) ? n : 0;
}

const soDigitos = (v: string | null) => (v ?? "").replace(/\D/g, "");

// Maior prefixo (em dígitos) de `codigo` entre as linhas; 0 se nenhum casa.
function maiorPrefixo(codigo: string, linhas: readonly NomenclaturaRef[]): number {
  let melhor = 0;
  for (const l of linhas) {
    const p = soDigitos(l.codigo);
    if (p && codigo.startsWith(p) && p.length > melhor) melhor = p.length;
  }
  return melhor;
}

/**
 * Compatibilidade do código (NCM ou NBS) com as linhas da classificação: casa por prefixo e a exceção
 * mais específica tira o código da regra. null = a classificação não restringe esse tipo (nada a dizer).
 */
function nomenclaturaCompativel(tipo: "NCM" | "NBS", codigo: string, linhas: readonly NomenclaturaRef[]): boolean | null {
  const doTipo = linhas.filter((l) => l.tipo.toUpperCase() === tipo);
  const regras = doTipo.filter((l) => !l.excecao);
  if (regras.length === 0) return null;
  const casou = maiorPrefixo(codigo, regras);
  const excecao = maiorPrefixo(codigo, doTipo.filter((l) => l.excecao));
  return casou > 0 && casou > excecao;
}

type Tributo = { nome: string; aliquota: string | null; valorCents: number | null; reducao: string | null };

function tributosDoItem(i: ItemParaConferir): Tributo[] {
  return [
    { nome: "CBS", aliquota: i.pCbs, valorCents: i.cbsCents, reducao: i.pRedCbs },
    { nome: "IBS da UF", aliquota: i.pIbsUf, valorCents: i.ibsUfCents, reducao: i.pRedIbs },
    { nome: "IBS do município", aliquota: i.pIbsMun, valorCents: i.ibsMunCents, reducao: i.pRedIbs },
  ];
}

const temIbsCbs = (i: ItemParaConferir) => !!i.cst || !!i.cClassTrib;
const destacado = (i: ItemParaConferir) => (i.cbsCents ?? 0) + (i.ibsUfCents ?? 0) + (i.ibsMunCents ?? 0);

function conferirValores(i: ItemParaConferir, itemIndex: number, achados: AchadoConferencia[]) {
  const base = i.ibsCbsBaseCents;
  if (base === null || base <= 0) return;
  // só os tributos com alíquota informada: monofásico e isenção não têm base × alíquota
  const tributos = tributosDoItem(i).filter((t) => t.aliquota !== null);
  if (tributos.length === 0) return;
  const esperado = (t: Tributo) => (base * numero(t.aliquota) * (1 - numero(t.reducao) / 100)) / 100;
  const diferido = i.ibsCbsDiferidoCents ?? 0;
  const aviso = (mensagem: string) =>
    achados.push({ itemIndex, severidade: "ATENCAO", codigo: "VALOR_DIVERGENTE", mensagem });

  if (diferido > 0) {
    // o valor destacado já desconta o diferimento, que vem somado dos três tributos
    const esp = tributos.reduce((a, t) => a + esperado(t), 0);
    const real = tributos.reduce((a, t) => a + (t.valorCents ?? 0), 0) + diferido;
    if (Math.abs(esp - real) > TOLERANCIA_CENTAVOS * tributos.length)
      aviso(`Base × alíquota dá cerca de ${formatarMoeda(Math.round(esp))}, mas a nota destaca ${formatarMoeda(real)} (somando o diferido). Confira com o fornecedor.`);
    return;
  }
  for (const t of tributos) {
    const esp = esperado(t);
    const real = t.valorCents ?? 0;
    if (Math.abs(esp - real) > TOLERANCIA_CENTAVOS)
      aviso(`${t.nome}: base × alíquota dá cerca de ${formatarMoeda(Math.round(esp))}, mas a nota destaca ${formatarMoeda(real)}. Confira com o fornecedor.`);
  }
}

// Imunidade (CST 410) traz pRed 100 na carga mas não tem gRed na nota: só se prevê redução com indReducao.
function conferirReducao(i: ItemParaConferir, c: ClassificacaoParaConferir, itemIndex: number, achados: AchadoConferencia[]) {
  const pares: [string, string | null, string | null][] = [
    ["CBS", i.pRedCbs, c.indReducao ? c.pRedCbs : null],
    ["IBS", i.pRedIbs, c.indReducao ? c.pRedIbs : null],
  ];
  for (const [nome, informado, previsto] of pares) {
    if (Math.abs(numero(informado) - numero(previsto)) <= TOLERANCIA_PERCENTUAL) continue;
    achados.push({
      itemIndex,
      severidade: "ATENCAO",
      codigo: "REDUCAO_DIVERGENTE",
      mensagem: `Redução de ${nome}: a nota informa ${numero(informado)}%, mas esta classificação prevê ${numero(previsto)}%.`,
    });
  }
}

function conferirNomenclatura(i: ItemParaConferir, c: ClassificacaoParaConferir, ctx: ContextoConferencia, itemIndex: number, achados: AchadoConferencia[]) {
  const linhas = ctx.nomenclaturas.filter(
    (l) => l.cClassTrib === c.codigo && l.inicioVigencia <= ctx.dataEmissao && (l.fimVigencia === null || ctx.dataEmissao <= l.fimVigencia),
  );
  if (linhas.length === 0) return;
  // NCM "00" é o que a nota usa quando não há NCM (serviço): não diz nada
  const ncm = soDigitos(i.ncm);
  const nbs = soDigitos(i.nbs);
  const usaNcm = ncm.length > 2;
  const veredictos = [usaNcm ? nomenclaturaCompativel("NCM", ncm, linhas) : null, nbs ? nomenclaturaCompativel("NBS", nbs, linhas) : null].filter(
    (v): v is boolean => v !== null,
  );
  // com NCM e NBS, basta um casar; sem nenhum que dê para avaliar, não acusa
  if (veredictos.length === 0 || veredictos.includes(true)) return;
  const qual = usaNcm && nbs ? `NCM ${i.ncm} / NBS ${i.nbs}` : usaNcm ? `NCM ${i.ncm}` : `NBS ${i.nbs}`;
  achados.push({
    itemIndex,
    severidade: "ATENCAO",
    codigo: "NOMENCLATURA_INCOMPATIVEL",
    mensagem: `O ${qual} não está entre os produtos ou serviços da classificação ${c.codigo}. O fornecedor pode ter usado a classificação errada.`,
  });
}

function conferirTotais(itens: readonly ItemParaConferir[], t: TotaisIbsCbs, achados: AchadoConferencia[]) {
  const com = itens.filter(temIbsCbs);
  const soma = (f: (i: ItemParaConferir) => number) => com.reduce((a, i) => a + f(i), 0);
  // 1 centavo por item; o monofásico (combustível) entra nos totais à parte (gMono)
  const tolerancia = Math.max(1, com.length) * TOLERANCIA_CENTAVOS;
  const linhas: [string, number, number][] = [
    ["base de cálculo", soma((i) => i.ibsCbsBaseCents ?? 0), t.ibsCbsBaseCents],
    ["CBS", soma((i) => i.cbsCents ?? 0), t.cbsCents + t.cbsMonoCents],
    ["IBS", soma((i) => (i.ibsUfCents ?? 0) + (i.ibsMunCents ?? 0)), t.ibsUfCents + t.ibsMunCents + t.ibsMonoCents],
  ];
  for (const [nome, itensCents, totalCents] of linhas) {
    if (Math.abs(itensCents - totalCents) <= tolerancia) continue;
    achados.push({
      itemIndex: null,
      severidade: "ATENCAO",
      codigo: "TOTAIS_DIVERGENTES",
      mensagem: `A soma dos itens (${nome}) dá ${formatarMoeda(itensCents)}, mas o total da nota informa ${formatarMoeda(totalCents)}.`,
    });
  }
}

export function conferirTributacao(itens: readonly ItemParaConferir[], ctx: ContextoConferencia): AchadoConferencia[] {
  const achados: AchadoConferencia[] = [];

  itens.forEach((item, itemIndex) => {
    if (!temIbsCbs(item)) return;
    if (!item.cClassTrib) {
      achados.push({ itemIndex, severidade: "ATENCAO", codigo: "CLASSIFICACAO_INEXISTENTE", mensagem: "O item tem IBS/CBS, mas a nota não informa a classificação tributária." });
      return;
    }
    const existe = ctx.classificacoes.some((c) => c.codigo === item.cClassTrib);
    const c = classificacaoVigente(ctx.classificacoes, item.cClassTrib, ctx.dataEmissao);
    if (!c) {
      achados.push(
        existe
          ? { itemIndex, severidade: "ATENCAO", codigo: "CLASSIFICACAO_FORA_DE_VIGENCIA", mensagem: `A classificação ${item.cClassTrib} não valia na data de emissão da nota.` }
          : { itemIndex, severidade: "ATENCAO", codigo: "CLASSIFICACAO_INEXISTENTE", mensagem: `A classificação ${item.cClassTrib} não existe na tabela da Receita. Confira o código com o fornecedor.` },
      );
    } else {
      if (item.cst && item.cst !== c.cst)
        achados.push({ itemIndex, severidade: "ATENCAO", codigo: "CST_DIVERGENTE", mensagem: `A nota usa o CST ${item.cst}, mas a classificação ${c.codigo} pede o CST ${c.cst}.` });
      conferirNomenclatura(item, c, ctx, itemIndex, achados);
      conferirReducao(item, c, itemIndex, achados);

      const valor = formatarMoeda(destacado(item));
      if (destacado(item) > 0 && !c.apropriaCreditoCbs && !c.apropriaCreditoIbs)
        achados.push({
          itemIndex,
          severidade: "INFO",
          codigo: "CREDITO_VEDADO",
          mensagem: `Esta classificação não dá crédito: os ${valor} de IBS/CBS deste item não voltam como crédito e ficam no custo.`,
        });
      else if (destacado(item) > 0 && c.apropriaCreditoCbs !== c.apropriaCreditoIbs)
        achados.push({
          itemIndex,
          severidade: "INFO",
          codigo: "CREDITO_PARCIAL",
          mensagem: `Só ${c.apropriaCreditoCbs ? "a CBS" : "o IBS"} deste item volta como crédito; o resto dos ${valor} fica no custo.`,
        });
    }
    conferirValores(item, itemIndex, achados);
  });

  // regime normal deve destacar desde 2026; sem destaque o comprador não tem crédito
  if (ctx.crtEmitente === "3" && ctx.dataEmissao >= INICIO_IBS_CBS_NA_NOTA && itens.length > 0 && !itens.some(temIbsCbs))
    achados.push({
      itemIndex: null,
      // 2026 é o ano de teste: a falta ainda não custa crédito
      severidade: ctx.dataEmissao >= INICIO_CREDITO ? "ATENCAO" : "INFO",
      codigo: "SEM_DESTAQUE_DO_FORNECEDOR",
      mensagem: "O fornecedor é do regime normal e a nota não traz IBS/CBS. Sem destaque, não há crédito nesta compra.",
    });

  if (ctx.totais) conferirTotais(itens, ctx.totais, achados);
  return achados;
}

/** Item lido do XML (ItemNfe) no formato da conferência; sem grupo IBS/CBS, só o NCM. */
export function itemDaNfe(item: {
  ncm: string | null;
  nbs?: string | null;
  ibsCbs?: Omit<ItemParaConferir, "ncm" | "nbs"> | null;
}): ItemParaConferir {
  const t = item.ibsCbs;
  return {
    ncm: item.ncm,
    nbs: item.nbs ?? null,
    cst: t?.cst ?? null,
    cClassTrib: t?.cClassTrib ?? null,
    ibsCbsBaseCents: t?.ibsCbsBaseCents ?? null,
    pCbs: t?.pCbs ?? null,
    pIbsUf: t?.pIbsUf ?? null,
    pIbsMun: t?.pIbsMun ?? null,
    pRedCbs: t?.pRedCbs ?? null,
    pRedIbs: t?.pRedIbs ?? null,
    cbsCents: t?.cbsCents ?? null,
    ibsUfCents: t?.ibsUfCents ?? null,
    ibsMunCents: t?.ibsMunCents ?? null,
    ibsCbsDiferidoCents: t?.ibsCbsDiferidoCents ?? null,
  };
}

type Decimal = { toString(): string } | null;

/** ItemNota gravado (alíquotas Decimal do Prisma) no formato da conferência. */
export function itemDaNota(
  item: Omit<ItemParaConferir, "pCbs" | "pIbsUf" | "pIbsMun" | "pRedCbs" | "pRedIbs"> & {
    pCbs: Decimal;
    pIbsUf: Decimal;
    pIbsMun: Decimal;
    pRedCbs: Decimal;
    pRedIbs: Decimal;
  },
): ItemParaConferir {
  const texto = (d: Decimal) => (d === null ? null : d.toString());
  return {
    ncm: item.ncm,
    nbs: item.nbs,
    cst: item.cst,
    cClassTrib: item.cClassTrib,
    ibsCbsBaseCents: item.ibsCbsBaseCents,
    pCbs: texto(item.pCbs),
    pIbsUf: texto(item.pIbsUf),
    pIbsMun: texto(item.pIbsMun),
    pRedCbs: texto(item.pRedCbs),
    pRedIbs: texto(item.pRedIbs),
    cbsCents: item.cbsCents,
    ibsUfCents: item.ibsUfCents,
    ibsMunCents: item.ibsMunCents,
    ibsCbsDiferidoCents: item.ibsCbsDiferidoCents,
  };
}
