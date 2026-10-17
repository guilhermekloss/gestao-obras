import { gunzipSync } from "node:zlib";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { decimalParaInteiro, parseNfeXml, type Nfe } from "@/services/nfe-xml";
import { normalizarNsu } from "./regras";

export const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_WSDL_DIST = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
const NS_WSDL_EVENTO = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";

export const ACAO_DIST = `${NS_WSDL_DIST}/nfeDistDFeInteresse`;
export const ACAO_EVENTO = `${NS_WSDL_EVENTO}/nfeRecepcaoEvento`;

/** Um docZip descompactado tem algumas dezenas de KB; o teto barra bomba de descompressão. */
const MAX_BYTES_DOC = 5 * 1024 * 1024;

export type Ambiente = "producao" | "homologacao";
export const TP_AMB: Record<Ambiente, "1" | "2"> = { producao: "1", homologacao: "2" };

/** CNPJ só com dígitos e letras (o alfanumérico da NT 2025 mantém as letras). */
export function normalizarCnpj(valor: string | null | undefined): string {
  return (valor ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function raizCnpj(cnpj: string): string {
  return normalizarCnpj(cnpj).slice(0, 8);
}

function escaparXml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function envelopeSoap12(corpo: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    `<soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`
  );
}

export function envelopeDistNsu(p: { ambiente: Ambiente; cUFAutor: string; cnpj: string; ultNsu: string }): string {
  const dist =
    `<distDFeInt xmlns="${NS_NFE}" versao="1.01">` +
    `<tpAmb>${TP_AMB[p.ambiente]}</tpAmb>` +
    `<cUFAutor>${escaparXml(p.cUFAutor)}</cUFAutor>` +
    `<CNPJ>${escaparXml(normalizarCnpj(p.cnpj))}</CNPJ>` +
    `<distNSU><ultNSU>${normalizarNsu(p.ultNsu)}</ultNSU></distNSU>` +
    `</distDFeInt>`;
  return envelopeSoap12(
    `<nfeDistDFeInteresse xmlns="${NS_WSDL_DIST}"><nfeDadosMsg>${dist}</nfeDadosMsg></nfeDistDFeInteresse>`,
  );
}

/** `envEvento` já assinado (ver assinatura.ts). */
export function envelopeEvento(envEvento: string): string {
  return envelopeSoap12(`<nfeDadosMsg xmlns="${NS_WSDL_EVENTO}">${envEvento}</nfeDadosMsg>`);
}

type No = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function no(v: unknown): No | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as No) : undefined;
}

function lista(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function texto(n: No | undefined, campo: string): string | undefined {
  const v = n?.[campo];
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

function lerXml(xml: string): { ok: true; raiz: No } | { ok: false; erro: string } {
  const conteudo = xml.replace(/^﻿/, "").trim();
  if (!conteudo) return { ok: false, erro: "Resposta vazia da Sefaz." };
  if (/<!DOCTYPE/i.test(conteudo)) return { ok: false, erro: "Resposta da Sefaz com DOCTYPE recusada." };
  const validacao = XMLValidator.validate(conteudo);
  if (validacao !== true) return { ok: false, erro: `XML inválido da Sefaz: ${validacao.err.msg}` };
  return { ok: true, raiz: parser.parse(conteudo) as No };
}

function corpoSoap(raiz: No): No | undefined {
  return no(no(raiz.Envelope)?.Body);
}

function falhaSoap(corpo: No | undefined): string | null {
  const fault = no(corpo?.Fault);
  if (!fault) return null;
  const motivo = texto(no(fault.Reason), "Text") ?? no(no(fault.Reason)?.Text)?.["#text"] ?? texto(fault, "faultstring");
  return `Falha SOAP da Sefaz: ${typeof motivo === "string" ? motivo : "sem detalhe"}`;
}

export type DocZip = { nsu: string; schema: string; xml: string };

export type RetornoDistribuicao = {
  cStat: string;
  xMotivo: string;
  ultNsu: string;
  maxNsu: string;
  docs: DocZip[];
};

export function descompactarDocZip(base64: string): string {
  return gunzipSync(Buffer.from(base64, "base64"), { maxOutputLength: MAX_BYTES_DOC }).toString("utf8");
}

export function lerRetornoDistribuicao(
  soap: string,
): { ok: true; retorno: RetornoDistribuicao } | { ok: false; erro: string } {
  const lido = lerXml(soap);
  if (!lido.ok) return lido;
  const corpo = corpoSoap(lido.raiz);
  const fault = falhaSoap(corpo);
  if (fault) return { ok: false, erro: fault };
  const ret = no(no(no(corpo?.nfeDistDFeInteresseResponse)?.nfeDistDFeInteresseResult)?.retDistDFeInt);
  const cStat = texto(ret, "cStat");
  if (!ret || !cStat) return { ok: false, erro: "Resposta da Sefaz sem retDistDFeInt/cStat." };

  const docs: DocZip[] = [];
  for (const item of lista(no(ret.loteDistDFeInt)?.docZip)) {
    const d = no(item);
    const conteudo = typeof d?.["#text"] === "string" ? d["#text"] : undefined;
    if (!d || !conteudo) continue;
    docs.push({
      nsu: normalizarNsu(texto(d, "@_NSU")),
      schema: texto(d, "@_schema") ?? "",
      xml: descompactarDocZip(conteudo),
    });
  }
  return {
    ok: true,
    retorno: {
      cStat,
      xMotivo: texto(ret, "xMotivo") ?? "",
      ultNsu: normalizarNsu(texto(ret, "ultNSU")),
      maxNsu: normalizarNsu(texto(ret, "maxNSU")),
      docs,
    },
  };
}

export type ResultadoEvento = { chave: string; cStat: string; xMotivo: string };

export function lerRetornoEvento(
  soap: string,
): { ok: true; cStat: string; xMotivo: string; eventos: ResultadoEvento[] } | { ok: false; erro: string } {
  const lido = lerXml(soap);
  if (!lido.ok) return lido;
  const corpo = corpoSoap(lido.raiz);
  const fault = falhaSoap(corpo);
  if (fault) return { ok: false, erro: fault };
  const ret = no(no(corpo?.nfeRecepcaoEventoNFResult)?.retEnvEvento);
  const cStat = texto(ret, "cStat");
  if (!ret || !cStat) return { ok: false, erro: "Resposta da Sefaz sem retEnvEvento/cStat." };
  const eventos = lista(ret.retEvento)
    .map((r) => no(no(r)?.infEvento))
    .filter((i): i is No => i !== undefined)
    .map((i) => ({ chave: texto(i, "chNFe") ?? "", cStat: texto(i, "cStat") ?? "", xMotivo: texto(i, "xMotivo") ?? "" }));
  return { ok: true, cStat, xMotivo: texto(ret, "xMotivo") ?? "", eventos };
}

/** Série e número vêm dentro da chave (o resNFe não os traz em campo próprio). */
export function dadosDaChaveNfe(chave: string): { modelo: string; serie: string; numero: string } {
  return {
    modelo: chave.slice(20, 22),
    serie: String(Number(chave.slice(22, 25))),
    numero: String(Number(chave.slice(25, 34))),
  };
}

const CANCELAMENTOS = new Set(["110111", "110112"]);

export type DocumentoDistribuido =
  | {
      tipo: "RESUMO";
      nsu: string;
      chave: string;
      emitenteDoc: string;
      emitenteNome: string;
      dataEmissao: string;
      valorCents: number;
      /** cSitNFe: 1 autorizada, 2 denegada, 3 cancelada. */
      autorizada: boolean;
    }
  | { tipo: "COMPLETO"; nsu: string; nfe: Nfe; xml: string }
  | { tipo: "CANCELAMENTO"; nsu: string; chave: string }
  | { tipo: "IGNORADO"; nsu: string; motivo: string };

export function classificarDocumento(doc: DocZip): DocumentoDistribuido {
  const nome = doc.schema.split("_")[0];
  const ignorar = (motivo: string): DocumentoDistribuido => ({ tipo: "IGNORADO", nsu: doc.nsu, motivo });

  if (nome === "procNFe") {
    const lido = parseNfeXml(doc.xml);
    if (!lido.ok) return ignorar(`procNFe ilegível: ${lido.erro}`);
    if (dadosDaChaveNfe(lido.nfe.chave).modelo !== "55") return ignorar("modelo diferente de 55");
    return { tipo: "COMPLETO", nsu: doc.nsu, nfe: lido.nfe, xml: doc.xml };
  }

  const lido = lerXml(doc.xml);
  if (!lido.ok) return ignorar(lido.erro);

  if (nome === "resNFe") {
    const r = no(lido.raiz.resNFe);
    const chave = texto(r, "chNFe") ?? "";
    const valorCents = decimalParaInteiro(texto(r, "vNF"), 2);
    const dataEmissao = (texto(r, "dhEmi") ?? "").slice(0, 10);
    if (!/^\d{44}$/.test(chave) || valorCents === null || !/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) {
      return ignorar("resNFe incompleto");
    }
    return {
      tipo: "RESUMO",
      nsu: doc.nsu,
      chave,
      emitenteDoc: normalizarCnpj(texto(r, "CNPJ") ?? texto(r, "CPF")),
      emitenteNome: texto(r, "xNome") ?? "Emitente não informado",
      dataEmissao,
      valorCents,
      autorizada: texto(r, "cSitNFe") === "1",
    };
  }

  // evento: resumo (resEvento) ou completo (procEventoNFe); só o cancelamento interessa
  const infEvento =
    nome === "resEvento" ? no(lido.raiz.resEvento) : nome === "procEventoNFe" ? no(no(no(lido.raiz.procEventoNFe)?.evento)?.infEvento) : undefined;
  if (!infEvento) return ignorar(`schema não tratado (${doc.schema || "sem schema"})`);
  const chave = texto(infEvento, "chNFe") ?? "";
  if (!CANCELAMENTOS.has(texto(infEvento, "tpEvento") ?? "") || !/^\d{44}$/.test(chave)) {
    return ignorar(`evento ${texto(infEvento, "tpEvento") ?? "?"} sem efeito na nota`);
  }
  return { tipo: "CANCELAMENTO", nsu: doc.nsu, chave };
}
