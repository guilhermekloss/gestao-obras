/**
 * Leitura do XML da NF-e (modelo 55, layout 4.00) para pré-preencher uma nota.
 *
 * Aceita o XML autorizado com o envelope `nfeProc` (o que o fornecedor envia
 * por e-mail) e o `NFe` sozinho; prefixos de namespace são descartados.
 * Tudo aqui é puro — a página lê o arquivo no client, mostra a prévia, e a
 * server action reprocessa o mesmo XML antes de gravar (não confia na prévia).
 *
 * Arredondamentos (o app guarda dinheiro em centavos Int e quantidade com 3 casas):
 * - valores monetários são convertidos por string, meio-para-cima, sem passar
 *   por ponto flutuante (`decimalParaInteiro`);
 * - `qCom` (até 4 casas no layout) é arredondada para 3 casas, como `ItemNota.qtde`;
 * - `vUnCom` (até 10 casas) vira centavos; quando qtde × unitário arredondado
 *   não reproduz o `vProd` do XML, o unitário sobe para o menor valor em
 *   centavos que alcança `vProd` e o excesso entra no desconto do item
 *   (`unitarioCoerente`). Assim o total de cada item é o do XML (vProd − vDesc)
 *   e é SEMPRE `calcularTotalItem(qtde, unitCents, descontoCents)` — o mesmo
 *   que a gravação e o `custoRateado` usam;
 * - a nota fecha em `vNF`: frete e demais acréscimos do total (seguro, outras
 *   despesas, IPI, ST, II) viram itens próprios; qualquer diferença restante
 *   entra como item de ajuste (se positiva) ou como desconto adicional no
 *   maior item (se negativa — ex.: ICMS desonerado). Assim a soma dos itens =
 *   total da nota, e custo por obra (itens × rateio) bate com o financeiro.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { FormaPagto, TipoItem } from "@prisma/client";
import { formatarMoeda } from "@/lib/format";
import { calcularTotalItem } from "./rateio";

export type ItemNfe = {
  descricao: string;
  ncm: string | null;
  qtde: number;
  unidade: string;
  unitCents: number;
  descontoCents: number;
  /** = calcularTotalItem(qtde, unitCents, descontoCents) */
  totalCents: number;
  /** PRODUTO = linha `det` do XML; ACESSORIO = frete/impostos do total; AJUSTE = diferença restante até vNF. */
  origem: "PRODUTO" | "ACESSORIO" | "AJUSTE";
  tipoSugerido: TipoItem;
};

export type DuplicataNfe = {
  /** `nDup` como veio no XML (ex.: "001"). */
  numero: string;
  /** aaaa-mm-dd */
  vencimento: string;
  valorCents: number;
};

export type EmitenteNfe = {
  /** só dígitos — 14 (CNPJ) ou 11 (CPF) */
  documento: string;
  tipoDocumento: "CNPJ" | "CPF";
  razaoSocial: string;
  fone: string | null;
};

export type Nfe = {
  /** chave de acesso, 44 dígitos */
  chave: string;
  numero: string;
  serie: string;
  /** aaaa-mm-dd, data local da emissão (como impressa no DANFE) */
  dataEmissao: string;
  emitente: EmitenteNfe;
  itens: ItemNfe[];
  /** `vNF` em centavos */
  totalCents: number;
  duplicatas: DuplicataNfe[];
  formaPagto: FormaPagto;
  /** Situações que não impedem a importação, mas merecem conferência. */
  avisos: string[];
};

export type ResultadoNfe = { ok: true; nfe: Nfe } | { ok: false; erro: string };

// ---------------------------------------------------------------------------
// Conversões numéricas

/**
 * Converte um decimal do XML ("1234.5678") num inteiro escalado por 10^casas,
 * arredondando meio-para-cima, sem ponto flutuante. Ex.: ("12.345", 2) → 1235.
 * Retorna null para texto que não é decimal não negativo.
 */
export function decimalParaInteiro(valor: string | undefined, casas: number): number | null {
  if (valor === undefined) return null;
  const m = /^(\d+)(?:\.(\d*))?$/.exec(valor.trim());
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(casas + 1, "0");
  const base = Number(m[1] + frac.slice(0, casas));
  return Number(frac[casas]) >= 5 ? base + 1 : base;
}

/**
 * Unitário em centavos para que o item reproduza exatamente o `vProd` do XML.
 *
 * Normalmente é o `vUnCom` arredondado. Quando o unitário tem frações de
 * centavo e qtde × unitário arredondado não fecha (ex.: 3 × R$ 0,3333 = 1,00,
 * mas 3 × 0,33 = 0,99), usa-se o menor unitário em centavos cujo produto
 * alcança `vProd` (0,34 → 1,02) e a diferença (`ajusteCents`, 2 centavos)
 * entra como desconto do item — o total do item fica igual ao do XML.
 */
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

// ---------------------------------------------------------------------------
// Documento e forma de pagamento

/** Formata CNPJ (14 dígitos) ou CPF (11); outro tamanho volta como veio. */
export function formatarDocumento(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

/**
 * Grafias possíveis de um CNPJ/CPF no cadastro de fornecedores (o campo é
 * texto livre: há registros só com dígitos e outros com máscara).
 */
export function variantesDocumento(doc: string): string[] {
  const digitos = doc.replace(/\D/g, "");
  return Array.from(new Set([digitos, formatarDocumento(digitos)]));
}

/** `tPag` (tabela da SEFAZ) → forma de pagamento do app. Códigos sem equivalente caem em BOLETO. */
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

// ---------------------------------------------------------------------------
// Parser

type No = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // mantém tudo como texto: nNF "0012", CNPJ com zero à esquerda, decimais exatos
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function no(v: unknown): No | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as No) : undefined;
}

function lista(v: unknown): No[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map(no).filter((x): x is No => x !== undefined);
}

function texto(n: No | undefined, campo: string): string | undefined {
  const v = n?.[campo];
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

function centavos(n: No | undefined, campo: string): number {
  return decimalParaInteiro(texto(n, campo), 2) ?? 0;
}

const NAO_E_NFE = "O arquivo não é o XML de uma NF-e (esperado <nfeProc> ou <NFe> com <infNFe>).";

/** Lê o XML de uma NF-e. Nunca lança: erros de formato voltam em `{ ok: false, erro }`. */
export function parseNfeXml(xml: string): ResultadoNfe {
  const conteudo = xml.replace(/^﻿/, "").trim();
  if (!conteudo) return { ok: false, erro: "Arquivo vazio." };
  // NF-e nunca traz DOCTYPE; recusar evita expansão de entidades maliciosas.
  if (/<!DOCTYPE/i.test(conteudo)) return { ok: false, erro: NAO_E_NFE };

  const validacao = XMLValidator.validate(conteudo);
  if (validacao !== true) {
    return { ok: false, erro: `XML inválido (linha ${validacao.err.line}): ${validacao.err.msg}` };
  }

  let raiz: No;
  try {
    raiz = parser.parse(conteudo) as No;
  } catch (e) {
    return { ok: false, erro: `XML inválido: ${e instanceof Error ? e.message : "erro de leitura"}` };
  }

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
  // dhEmi (4.00) = "2026-09-15T10:30:00-03:00"; dEmi (2.00) = "2026-09-15". A data
  // é a do fuso do emissor (os 10 primeiros caracteres), como impressa no DANFE.
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
    itens.push({
      descricao,
      ncm: texto(prod, "NCM") ?? null,
      qtde,
      unidade: (texto(prod, "uCom") ?? "UN").toUpperCase(),
      unitCents,
      descontoCents,
      totalCents: calcularTotalItem(qtde, unitCents, descontoCents),
      origem: "PRODUTO",
      tipoSugerido: "MATERIAL",
    });
  }

  const tot = no(no(inf.total)?.ICMSTot);
  const totalCents = centavos(tot, "vNF");
  if (totalCents <= 0) return { ok: false, erro: "NF-e sem valor total (total/ICMSTot/vNF)." };

  fecharNoTotal(itens, tot, totalCents, avisos);

  const duplicatas: DuplicataNfe[] = lista(no(inf.cobr)?.dup).map((d, i) => ({
    numero: texto(d, "nDup") ?? String(i + 1).padStart(3, "0"),
    vencimento: (texto(d, "dVenc") ?? dataEmissao).slice(0, 10),
    valorCents: centavos(d, "vDup"),
  }));
  const somaDup = duplicatas.reduce((a, d) => a + d.valorCents, 0);
  if (duplicatas.length > 0 && somaDup !== totalCents) {
    avisos.push(
      `A soma das duplicatas (${formatarMoeda(somaDup)}) difere do total da nota (${formatarMoeda(totalCents)}) — ajuste as parcelas antes de importar.`,
    );
  }

  // pag/detPag pode repetir (ex.: parte em PIX, parte em boleto): vale o de maior valor.
  // tPag 90 = "sem pagamento" (comum quando há duplicatas) — ignorado.
  const pagamentos = lista(no(inf.pag)?.detPag)
    .map((p) => ({ tPag: texto(p, "tPag"), valor: centavos(p, "vPag") }))
    .filter((p) => p.tPag && p.tPag !== "90")
    .sort((a, b) => b.valor - a.valor);
  const formaPagto = mapearFormaPagto(pagamentos[0]?.tPag);

  return {
    ok: true,
    nfe: { chave, numero, serie, dataEmissao, emitente, itens, totalCents, duplicatas, formaPagto, avisos },
  };
}

/**
 * Acrescenta itens para frete e demais acréscimos do total e absorve a sobra
 * de arredondamento, de modo que a soma dos itens seja exatamente `vNF`.
 */
function fecharNoTotal(itens: ItemNfe[], tot: No | undefined, totalCents: number, avisos: string[]) {
  const acessorio = (descricao: string, valorCents: number, tipo: TipoItem, origem: ItemNfe["origem"]) => {
    if (valorCents > 0) {
      itens.push({
        descricao,
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

// ---------------------------------------------------------------------------
// Parcelas

export type ParcelaNfe = { numero: number; valorCents: number; vencimento: string };

/** Parcelas a lançar: as duplicatas da nota ou, sem cobrança, uma única com vencimento na emissão. */
export function parcelasDaNfe(nfe: Pick<Nfe, "duplicatas" | "totalCents" | "dataEmissao">): ParcelaNfe[] {
  if (nfe.duplicatas.length === 0) {
    return [{ numero: 1, valorCents: nfe.totalCents, vencimento: nfe.dataEmissao }];
  }
  return nfe.duplicatas.map((d, i) => ({ numero: i + 1, valorCents: d.valorCents, vencimento: d.vencimento }));
}
