import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { FormaPagto, TipoItem } from "@prisma/client";
import { formatarMoeda } from "@/lib/format";
import { calcularTotalItem } from "./rateio";
import { extrairCnos, formatarCno } from "./cno";
import { crtValido, DESCRICAO_IBS_CBS_POR_FORA, type CrtEmitente, type TotaisIbsCbs, type TributacaoIbsCbs } from "./tributacao/ibs-cbs";

export type { TotaisIbsCbs, TributacaoIbsCbs } from "./tributacao/ibs-cbs";

export type ItemNfe = {
  descricao: string;
  /** Código do produto no fornecedor (cProd). */
  codigo: string | null;
  ncm: string | null;
  qtde: number;
  unidade: string;
  unitCents: number;
  descontoCents: number;
  totalCents: number;
  origem: "PRODUTO" | "ACESSORIO" | "AJUSTE";
  tipoSugerido: TipoItem;
  /** Grupo imposto/IBSCBS; ausente na nota anterior à reforma e nos itens acessórios. */
  ibsCbs?: TributacaoIbsCbs;
};

type DuplicataNfe = {
  numero: string;
  vencimento: string;
  valorCents: number;
};

type EmitenteNfe = {
  documento: string;
  tipoDocumento: "CNPJ" | "CPF";
  razaoSocial: string;
  fone: string | null;
};

export type Nfe = {
  chave: string;
  numero: string;
  serie: string;
  dataEmissao: string;
  emitente: EmitenteNfe;
  /** CNPJ/CPF do destinatário (dest), só dígitos; nulo quando a nota não identifica. */
  destinatario: string | null;
  /** CNO da obra (12 dígitos), quando a nota cita um; liga a nota à obra. */
  cno: string | null;
  itens: ItemNfe[];
  /** Valor a pagar: vNF, ou vNFTot quando o IBS/CBS vem por fora (ver totalAPagar). */
  totalCents: number;
  /** ICMSTot/vNF e total/vNFTot (com IBS/CBS/IS por fora; nulo quando a nota não traz). */
  vNfCents: number;
  vNfTotCents: number | null;
  /** CRT do emitente; nulo quando ausente ou fora da tabela. */
  crtEmitente: CrtEmitente | null;
  /** total/IBSCBSTot; nulo na nota anterior à reforma. */
  totaisIbsCbs: TotaisIbsCbs | null;
  duplicatas: DuplicataNfe[];
  formaPagto: FormaPagto;
  avisos: string[];
};

type ResultadoNfe = { ok: true; nfe: Nfe } | { ok: false; erro: string };

// Por string, meio-para-cima, sem passar por ponto flutuante.
export function decimalParaInteiro(valor: string | undefined, casas: number): number | null {
  if (valor === undefined) return null;
  const m = /^(\d+)(?:\.(\d*))?$/.exec(valor.trim());
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(casas + 1, "0");
  const base = Number(m[1] + frac.slice(0, casas));
  return Number(frac[casas]) >= 5 ? base + 1 : base;
}

// 3 × R$ 0,3333 = 1,00 mas 3 × 0,33 = 0,99: sobe para 0,34 e o excesso vira desconto, fechando o vProd.
export function unitarioCoerente(
  qtde: number,
  unitXmlCents: number,
  vProdCents: number,
): { unitCents: number; ajusteCents: number } {
  if (qtde <= 0 || Math.round(qtde * unitXmlCents) === vProdCents) {
    return { unitCents: unitXmlCents, ajusteCents: 0 };
  }
  let c = Math.ceil(vProdCents / qtde);
  // a divisão em ponto flutuante pode passar 1 centavo do mínimo necessário
  while (c > 0 && Math.round(qtde * (c - 1)) >= vProdCents) c--;
  return { unitCents: c, ajusteCents: Math.round(qtde * c) - vProdCents };
}

export function formatarDocumento(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

export function variantesDocumento(doc: string): string[] {
  const digitos = doc.replace(/\D/g, "");
  return Array.from(new Set([digitos, formatarDocumento(digitos)]));
}

// tPag da tabela da SEFAZ; código sem equivalente cai em BOLETO.
const T_PAG: Record<string, FormaPagto> = {
  "01": "DINHEIRO",
  "03": "CARTAO", // cartão de crédito
  "04": "DEBITO", // cartão de débito
  "15": "BOLETO",
  "16": "TRANSFERENCIA", // depósito bancário
  "17": "PIX", // PIX dinâmico
  "18": "TRANSFERENCIA", // transferência bancária / carteira digital
  "20": "PIX", // PIX estático
};

export function mapearFormaPagto(tPag: string | undefined): FormaPagto {
  return (tPag && T_PAG[tPag.padStart(2, "0")]) || "BOLETO";
}

export type No = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // mantém tudo como texto: nNF "0012", CNPJ com zero à esquerda, decimais exatos
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export function no(v: unknown): No | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as No) : undefined;
}

export function lista(v: unknown): No[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map(no).filter((x): x is No => x !== undefined);
}

export function texto(n: No | undefined, campo: string): string | undefined {
  const v = n?.[campo];
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

export function centavos(n: No | undefined, campo: string): number {
  return decimalParaInteiro(texto(n, campo), 2) ?? 0;
}

// Ausente = nulo (não zero): no IBS/CBS, "sem o campo" e "R$ 0,00" dizem coisas diferentes.
export function centavosOuNulo(n: No | undefined, campo: string): number | null {
  return decimalParaInteiro(texto(n, campo), 2);
}

export function somaOuNulo(valores: (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v !== null);
  return presentes.length > 0 ? presentes.reduce((a, v) => a + v, 0) : null;
}

// Alíquota em % como texto exato ("0.9000" vira "0.9"), sem passar por ponto flutuante.
export function percentual(n: No | undefined, campo: string): string | null {
  const v = texto(n, campo);
  if (!v || !/^\d{1,3}(?:\.\d{1,4})?$/.test(v)) return null;
  return v.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

// Grupo imposto/IBSCBS do item (NT 2025.002). Sem CST ou cClassTrib o grupo é ignorado: não há o que conferir.
export function lerIbsCbs(imposto: No | undefined): TributacaoIbsCbs | undefined {
  const g = no(imposto?.IBSCBS);
  const cst = texto(g, "CST");
  const cClassTrib = texto(g, "cClassTrib");
  if (!g || !cst || !cClassTrib) return undefined;

  const base = no(g.gIBSCBS);
  const uf = no(base?.gIBSUF);
  const mun = no(base?.gIBSMun);
  const cbs = no(base?.gCBS);
  const mono = no(g.gIBSCBSMono);
  const credPres = no(g.gCredPresOper);
  return {
    cst,
    cClassTrib,
    ibsCbsBaseCents: centavosOuNulo(base, "vBC"),
    pCbs: percentual(cbs, "pCBS"),
    pIbsUf: percentual(uf, "pIBSUF"),
    pIbsMun: percentual(mun, "pIBSMun"),
    pRedCbs: percentual(no(cbs?.gRed), "pRedAliq"),
    pRedIbs: percentual(no(uf?.gRed), "pRedAliq") ?? percentual(no(mun?.gRed), "pRedAliq"),
    // monofásico (combustível): ad rem, sem base nem alíquota; o IBS vem num total só
    cbsCents: mono ? centavosOuNulo(mono, "vTotCBSMonoItem") : centavosOuNulo(cbs, "vCBS"),
    ibsUfCents: mono ? centavosOuNulo(mono, "vTotIBSMonoItem") : centavosOuNulo(uf, "vIBSUF"),
    ibsMunCents: mono ? null : centavosOuNulo(mun, "vIBSMun"),
    ibsCbsDiferidoCents: somaOuNulo([uf, mun, cbs].map((x) => centavosOuNulo(no(x?.gDif), "vDif"))),
    cCredPres: texto(credPres, "cCredPres") ?? null,
    credPresCents: somaOuNulo([
      centavosOuNulo(no(credPres?.gIBSCredPres), "vCredPres"),
      centavosOuNulo(no(credPres?.gCBSCredPres), "vCredPres"),
    ]),
  };
}

function lerTotaisIbsCbs(total: No | undefined): TotaisIbsCbs | null {
  const t = no(total?.IBSCBSTot);
  if (!t) return null;
  const gIbs = no(t.gIBS);
  const gCbs = no(t.gCBS);
  const gMono = no(t.gMono);
  return {
    ibsCbsBaseCents: centavos(t, "vBCIBSCBS"),
    cbsCents: centavos(gCbs, "vCBS"),
    ibsUfCents: centavos(no(gIbs?.gIBSUF), "vIBSUF"),
    ibsMunCents: centavos(no(gIbs?.gIBSMun), "vIBSMun"),
    ibsCbsDiferidoCents: centavos(no(gIbs?.gIBSUF), "vDif") + centavos(no(gIbs?.gIBSMun), "vDif") + centavos(gCbs, "vDif"),
    credPresCents: centavos(gIbs, "vCredPres") + centavos(gCbs, "vCredPres"),
    cbsMonoCents: centavos(gMono, "vCBSMono"),
    ibsMonoCents: centavos(gMono, "vIBSMono"),
  };
}

/**
 * Valor a pagar da nota. vNF é o total "tradicional"; vNFTot (NT 2025.002) soma o IBS/CBS/IS cobrado por fora.
 * Quando vNFTot passa do vNF, vale ele e a diferença vira um item acessório (a soma dos itens continua fechando).
 * Exceção: se as duplicatas somam o vNF e não o vNFTot, o fornecedor está cobrando o vNF; vale o que bate com elas.
 * Sem duplicatas, o mesmo vale para a soma dos pagamentos (detPag, sem tPag 90): em 2026 o destaque de teste infla o
 * vNFTot, mas o pagamento continua no vNF.
 */
export function totalAPagar(
  vNfCents: number,
  vNfTotCents: number | null,
  somaDuplicatasCents: number | null,
  somaPagamentosCents: number | null = null,
): { totalCents: number; porForaCents: number; aviso: string | null } {
  if (vNfTotCents === null || vNfTotCents <= vNfCents) return { totalCents: vNfCents, porForaCents: 0, aviso: null };
  if (somaDuplicatasCents === vNfCents) {
    return {
      totalCents: vNfCents,
      porForaCents: 0,
      aviso: `A nota informa ${formatarMoeda(vNfTotCents)} com IBS/CBS por fora (vNFTot), mas as duplicatas somam o vNF (${formatarMoeda(vNfCents)}): foi usado o vNF. Confira com o fornecedor.`,
    };
  }
  // duplicatas informadas mandam; os pagamentos só desempatam quando não há duplicatas
  if (somaDuplicatasCents === null && somaPagamentosCents === vNfCents) {
    return {
      totalCents: vNfCents,
      porForaCents: 0,
      aviso: `A nota informa ${formatarMoeda(vNfTotCents)} com IBS/CBS por fora (vNFTot), mas os pagamentos somam o vNF (${formatarMoeda(vNfCents)}): foi usado o vNF. Confira com o fornecedor.`,
    };
  }
  return { totalCents: vNfTotCents, porForaCents: vNfTotCents - vNfCents, aviso: null };
}

// A constante mora em tributacao/ibs-cbs.ts (o custo líquido a reconhece sem importar o parser); reexportada aqui.
export { DESCRICAO_IBS_CBS_POR_FORA };

const NAO_E_NFE = "O arquivo não é o XML de uma NF-e (esperado <nfeProc> ou <NFe> com <infNFe>).";

/** Maior XML fiscal aceito, em caracteres (o corpo da server action tem limite de 1 MB). */
export const MAX_CARACTERES_XML = 1_000_000;

// Entrada não confiável: limite de tamanho, sem DOCTYPE (documento fiscal nunca traz; recusar evita XXE e
// expansão de entidades) e validação antes de montar a árvore. Comum à NF-e e à NFS-e.
export function lerArvoreXml(xml: string, naoReconhecido: string): { ok: true; raiz: No } | { ok: false; erro: string } {
  if (xml.length > MAX_CARACTERES_XML) return { ok: false, erro: "Arquivo grande demais para importar (máximo 1 MB)." };
  const conteudo = xml.replace(/^﻿/, "").trim();
  if (!conteudo) return { ok: false, erro: "Arquivo vazio." };
  if (/<!DOCTYPE/i.test(conteudo)) return { ok: false, erro: naoReconhecido };

  const validacao = XMLValidator.validate(conteudo);
  if (validacao !== true) {
    return { ok: false, erro: `XML inválido (linha ${validacao.err.line}): ${validacao.err.msg}` };
  }

  try {
    return { ok: true, raiz: parser.parse(conteudo) as No };
  } catch (e) {
    return { ok: false, erro: `XML inválido: ${e instanceof Error ? e.message : "erro de leitura"}` };
  }
}

export function parseNfeXml(xml: string): ResultadoNfe {
  const arvore = lerArvoreXml(xml, NAO_E_NFE);
  if (!arvore.ok) return arvore;
  const raiz = arvore.raiz;

  const nfeNo = no(no(raiz.nfeProc)?.NFe) ?? no(raiz.NFe);
  const inf = no(nfeNo?.infNFe);
  if (!inf) return { ok: false, erro: NAO_E_NFE };

  const chave = (texto(inf, "@_Id") ?? "").replace(/^NFe/, "");
  if (!/^\d{44}$/.test(chave)) {
    return { ok: false, erro: "Chave de acesso ausente ou inválida (infNFe/@Id deve ter 44 dígitos)." };
  }

  const ide = no(inf.ide);
  const numero = texto(ide, "nNF");
  const serie = texto(ide, "serie") ?? "";
  // data no fuso do emissor (10 primeiros caracteres de dhEmi/dEmi), como impressa no DANFE
  const dataEmissao = (texto(ide, "dhEmi") ?? texto(ide, "dEmi") ?? "").slice(0, 10);
  if (!numero) return { ok: false, erro: "NF-e sem número (ide/nNF)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) {
    return { ok: false, erro: "NF-e sem data de emissão válida (ide/dhEmi)." };
  }

  const emit = no(inf.emit);
  const cnpj = texto(emit, "CNPJ");
  const cpf = texto(emit, "CPF");
  const razaoSocial = texto(emit, "xNome");
  if (!(cnpj || cpf) || !razaoSocial) {
    return { ok: false, erro: "NF-e sem emitente identificado (emit/CNPJ e emit/xNome)." };
  }
  const emitente: EmitenteNfe = {
    documento: (cnpj ?? cpf)!.replace(/\D/g, ""),
    tipoDocumento: cnpj ? "CNPJ" : "CPF",
    razaoSocial,
    fone: texto(no(emit?.enderEmit), "fone") ?? null,
  };

  const dest = no(inf.dest);
  // CNPJ alfanumérico (NT 2025) tem letras: só pontuação sai
  const destinatario = (texto(dest, "CNPJ") ?? texto(dest, "CPF"))?.toUpperCase().replace(/[^0-9A-Z]/g, "") || null;

  const dets = lista(inf.det);
  if (dets.length === 0) return { ok: false, erro: "NF-e sem itens (det)." };

  const avisos: string[] = [];
  const itens: ItemNfe[] = [];
  for (const [i, det] of dets.entries()) {
    const prod = no(det.prod);
    const descricao = texto(prod, "xProd");
    const qtdeMil = decimalParaInteiro(texto(prod, "qCom"), 3);
    const unitXml = decimalParaInteiro(texto(prod, "vUnCom"), 2);
    if (!descricao || qtdeMil === null || qtdeMil <= 0 || unitXml === null) {
      return { ok: false, erro: `Item ${i + 1} da NF-e incompleto (xProd, qCom ou vUnCom).` };
    }
    const qtde = qtdeMil / 1000;
    const vProdCents = centavos(prod, "vProd");
    const { unitCents, ajusteCents } = unitarioCoerente(qtde, unitXml, vProdCents);
    const descontoCents = centavos(prod, "vDesc") + ajusteCents;
    if (ajusteCents > 10) {
      avisos.push(
        `Item ${i + 1} (${descricao}): o unitário do XML tem frações de centavo; ${formatarMoeda(ajusteCents)} entraram como desconto para o total do item bater com a nota.`,
      );
    }
    const ibsCbs = lerIbsCbs(no(det.imposto));
    itens.push({
      descricao,
      codigo: texto(prod, "cProd") ?? null,
      ncm: texto(prod, "NCM") ?? null,
      qtde,
      unidade: (texto(prod, "uCom") ?? "UN").toUpperCase(),
      unitCents,
      descontoCents,
      totalCents: calcularTotalItem(qtde, unitCents, descontoCents),
      origem: "PRODUTO",
      tipoSugerido: "MATERIAL",
      ...(ibsCbs ? { ibsCbs } : {}),
    });
  }

  const total = no(inf.total);
  const tot = no(total?.ICMSTot);
  const vNfCents = centavos(tot, "vNF");
  if (vNfCents <= 0) return { ok: false, erro: "NF-e sem valor total (total/ICMSTot/vNF)." };
  const vNfTotCents = centavosOuNulo(total, "vNFTot");

  const duplicatas: DuplicataNfe[] = lista(no(inf.cobr)?.dup).map((d, i) => ({
    numero: texto(d, "nDup") ?? String(i + 1).padStart(3, "0"),
    vencimento: (texto(d, "dVenc") ?? dataEmissao).slice(0, 10),
    valorCents: centavos(d, "vDup"),
  }));
  const somaDup = duplicatas.reduce((a, d) => a + d.valorCents, 0);
  // detPag pode repetir: vale o de maior valor; tPag 90 ("sem pagamento") é ignorado
  const pagamentos = lista(no(inf.pag)?.detPag)
    .map((p) => ({ tPag: texto(p, "tPag"), valor: centavos(p, "vPag") }))
    .filter((p) => p.tPag && p.tPag !== "90")
    .sort((a, b) => b.valor - a.valor);
  const somaPagamentos = pagamentos.length > 0 ? pagamentos.reduce((a, p) => a + p.valor, 0) : null;
  const aPagar = totalAPagar(vNfCents, vNfTotCents, duplicatas.length > 0 ? somaDup : null, somaPagamentos);
  const totalCents = aPagar.totalCents;

  fecharNoTotal(itens, tot, totalCents, aPagar.porForaCents, avisos);

  if (aPagar.aviso) avisos.push(aPagar.aviso);
  if (duplicatas.length > 0 && somaDup !== totalCents) {
    avisos.push(
      `A soma das duplicatas (${formatarMoeda(somaDup)}) difere do total da nota (${formatarMoeda(totalCents)}) — ajuste as parcelas antes de importar.`,
    );
  }

  const formaPagto = mapearFormaPagto(pagamentos[0]?.tPag);

  const cnos = cnosDaNfe(inf, dets);
  if (cnos.length > 1) {
    avisos.push(`A nota cita mais de um CNO (${cnos.map(formatarCno).join(", ")}); foi usado o primeiro — confira a obra.`);
  }
  const cno = cnos[0] ?? null;

  return {
    ok: true,
    nfe: {
      chave,
      numero,
      serie,
      dataEmissao,
      emitente,
      destinatario,
      cno,
      itens,
      totalCents,
      vNfCents,
      vNfTotCents,
      crtEmitente: crtValido(texto(emit, "CRT")),
      totaisIbsCbs: lerTotaisIbsCbs(total),
      duplicatas,
      formaPagto,
      avisos,
    },
  };
}

// O leiaute da NF-e não tem tag de CNO: o emitente o põe num campo de observação ou no complemento do endereço da obra.
function cnosDaNfe(inf: No, dets: No[]): string[] {
  const infAdic = no(inf.infAdic);
  const obsCno = lista(infAdic?.obsCont)
    .filter((o) => /CNO|CEI|OBRA/i.test(texto(o, "@_xCampo") ?? ""))
    .map((o) => texto(o, "xTexto"));
  const textos = [
    // no obsCont dedicado o rótulo é o próprio xCampo
    ...obsCno.map((t) => (t ? `CNO ${t}` : undefined)),
    texto(infAdic, "infCpl"),
    texto(infAdic, "infAdFisco"),
    ...lista(infAdic?.obsCont).map((o) => texto(o, "xTexto")),
    texto(no(inf.entrega), "xCpl"),
    texto(no(no(inf.dest)?.enderDest), "xCpl"),
    ...dets.map((d) => texto(d, "infAdProd")),
  ];
  return [...new Set(textos.flatMap((t) => extrairCnos(t)))];
}

// Soma dos itens = total a pagar exato, para o custo por obra (itens × rateio) bater com o financeiro.
function fecharNoTotal(itens: ItemNfe[], tot: No | undefined, totalCents: number, porForaCents: number, avisos: string[]) {
  const acessorio = (descricao: string, valorCents: number, tipo: TipoItem, origem: ItemNfe["origem"]) => {
    if (valorCents > 0) {
      itens.push({
        descricao,
        codigo: null,
        ncm: null,
        qtde: 1,
        unidade: "UN",
        unitCents: valorCents,
        descontoCents: 0,
        totalCents: valorCents,
        origem,
        tipoSugerido: tipo,
      });
    }
  };

  acessorio("Frete (NF-e)", centavos(tot, "vFrete"), "FRETE", "ACESSORIO");
  const encargos =
    centavos(tot, "vSeg") +
    centavos(tot, "vOutro") +
    centavos(tot, "vIPI") +
    centavos(tot, "vIPIDevol") +
    centavos(tot, "vST") +
    centavos(tot, "vFCPST") +
    centavos(tot, "vII");
  acessorio("Impostos e despesas acessórias (IPI, ST, seguro, outras)", encargos, "ENCARGO", "ACESSORIO");
  // IBS/CBS cobrado por fora (vNFTot − vNF): é custo até virar crédito (ver tributacao/credito.ts)
  acessorio(DESCRICAO_IBS_CBS_POR_FORA, porForaCents, "ENCARGO", "ACESSORIO");

  const soma = itens.reduce((a, i) => a + i.totalCents, 0);
  const sobra = totalCents - soma;
  if (sobra > 0) {
    acessorio("Ajuste para o total da NF-e", sobra, "ENCARGO", "AJUSTE");
  } else if (sobra < 0) {
    // ex.: ICMS desonerado (vICMSDeson): vira desconto no maior item
    const maior = itens.reduce((m, i) => (i.totalCents > m.totalCents ? i : m), itens[0]);
    if (maior.totalCents >= -sobra) {
      maior.descontoCents -= sobra;
      maior.totalCents = calcularTotalItem(maior.qtde, maior.unitCents, maior.descontoCents);
    } else {
      avisos.push("A soma dos itens é maior que o total da nota e não foi possível ajustar automaticamente.");
    }
  }
}

type ParcelaNfe = { numero: number; valorCents: number; vencimento: string };

export function parcelasDaNfe(nfe: Pick<Nfe, "duplicatas" | "totalCents" | "dataEmissao">): ParcelaNfe[] {
  if (nfe.duplicatas.length === 0) {
    return [{ numero: 1, valorCents: nfe.totalCents, vencimento: nfe.dataEmissao }];
  }
  return nfe.duplicatas.map((d, i) => ({ numero: i + 1, valorCents: d.valorCents, vencimento: d.vencimento }));
}
