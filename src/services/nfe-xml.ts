import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { FormaPagto, TipoItem } from "@prisma/client";
import { formatarMoeda } from "@/lib/format";
import { calcularTotalItem } from "./rateio";

type ItemNfe = {
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
  itens: ItemNfe[];
  totalCents: number;
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

export function parseNfeXml(xml: string): ResultadoNfe {
  const conteudo = xml.replace(/^﻿/, "").trim();
  if (!conteudo) return { ok: false, erro: "Arquivo vazio." };
  // NF-e nunca traz DOCTYPE; recusar evita XXE/expansão de entidades.
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

  // detPag pode repetir: vale o de maior valor; tPag 90 ("sem pagamento") é ignorado
  const pagamentos = lista(no(inf.pag)?.detPag)
    .map((p) => ({ tPag: texto(p, "tPag"), valor: centavos(p, "vPag") }))
    .filter((p) => p.tPag && p.tPag !== "90")
    .sort((a, b) => b.valor - a.valor);
  const formaPagto = mapearFormaPagto(pagamentos[0]?.tPag);

  return {
    ok: true,
    nfe: { chave, numero, serie, dataEmissao, emitente, destinatario, itens, totalCents, duplicatas, formaPagto, avisos },
  };
}

// Soma dos itens = vNF exato, para o custo por obra (itens × rateio) bater com o financeiro.
function fecharNoTotal(itens: ItemNfe[], tot: No | undefined, totalCents: number, avisos: string[]) {
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
