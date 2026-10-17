import { createHash, createSign, type KeyObject } from "node:crypto";
import { NS_NFE, TP_AMB, normalizarCnpj, type Ambiente } from "./xml";

// Assinatura XMLDSig (RSA-SHA1, C14N 1.0) do evento de Ciência da Operação, como pede o Manual da NF-e.
// O XML é montado já na forma canônica (sem espaços, atributos em ordem, sem elementos vazios abreviados,
// namespace herdado declarado no elemento assinado): o digest sai do próprio texto, sem biblioteca de C14N.
// Os testes conferem o resultado com o xml-crypto.

const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

export const TP_EVENTO_CIENCIA = "210210";
/** Ambiente Nacional: a manifestação do destinatário vai para o órgão 91, seja qual for a UF. */
const C_ORGAO_AN = "91";

export type ChaveDeAssinatura = { chavePrivada: KeyObject; certificadoBase64: string };

/** dhEvento no horário de Brasília (UTC−3, sem horário de verão desde 2019), com 1 min de folga para trás:
 *  a Sefaz recusa evento "no futuro" quando o relógio dela está um pouco atrás. */
export function dataHoraEvento(agora: Date): string {
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000 - 60 * 1000);
  return `${brasilia.toISOString().slice(0, 19)}-03:00`;
}

export function idEventoCiencia(chave: string, nSeqEvento = 1): string {
  return `ID${TP_EVENTO_CIENCIA}${chave}${String(nSeqEvento).padStart(2, "0")}`;
}

/** infEvento como fica na forma canônica: com o xmlns herdado de `evento`. */
export function infEventoCanonico(p: { chave: string; cnpj: string; ambiente: Ambiente; dhEvento: string }): string {
  if (!/^\d{44}$/.test(p.chave)) throw new Error("Chave de acesso inválida para o evento");
  return (
    `<infEvento xmlns="${NS_NFE}" Id="${idEventoCiencia(p.chave)}">` +
    `<cOrgao>${C_ORGAO_AN}</cOrgao>` +
    `<tpAmb>${TP_AMB[p.ambiente]}</tpAmb>` +
    `<CNPJ>${normalizarCnpj(p.cnpj)}</CNPJ>` +
    `<chNFe>${p.chave}</chNFe>` +
    `<dhEvento>${p.dhEvento}</dhEvento>` +
    `<tpEvento>${TP_EVENTO_CIENCIA}</tpEvento>` +
    `<nSeqEvento>1</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>` +
    `</infEvento>`
  );
}

function signedInfo(id: string, digest: string, comNamespace: boolean): string {
  return (
    `<SignedInfo${comNamespace ? ` xmlns="${NS_DSIG}"` : ""}>` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${NS_DSIG}rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${id}">` +
    `<Transforms>` +
    `<Transform Algorithm="${NS_DSIG}enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="${NS_DSIG}sha1"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`
  );
}

export function eventoAssinado(
  p: { chave: string; cnpj: string; ambiente: Ambiente; dhEvento: string },
  assinatura: ChaveDeAssinatura,
): string {
  const id = idEventoCiencia(p.chave);
  const canonico = infEventoCanonico(p);
  const digest = createHash("sha1").update(canonico, "utf8").digest("base64");
  const valor = createSign("RSA-SHA1")
    .update(signedInfo(id, digest, true), "utf8")
    .sign(assinatura.chavePrivada, "base64");

  // no documento, o xmlns fica em `evento` e `Signature`; os filhos o herdam
  const infEvento = canonico.replace(` xmlns="${NS_NFE}"`, "");
  return (
    `<evento xmlns="${NS_NFE}" versao="1.00">` +
    infEvento +
    `<Signature xmlns="${NS_DSIG}">` +
    signedInfo(id, digest, false) +
    `<SignatureValue>${valor}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${assinatura.certificadoBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>` +
    `</evento>`
  );
}

export function envEventoCiencia(
  p: { chaves: string[]; cnpj: string; ambiente: Ambiente; agora: Date; idLote: string },
  assinatura: ChaveDeAssinatura,
): string {
  if (p.chaves.length === 0 || p.chaves.length > 20) throw new Error("Lote de evento deve ter de 1 a 20 notas");
  if (!/^\d{1,15}$/.test(p.idLote)) throw new Error("idLote deve ter até 15 dígitos");
  const dhEvento = dataHoraEvento(p.agora);
  const eventos = p.chaves
    .map((chave) => eventoAssinado({ chave, cnpj: p.cnpj, ambiente: p.ambiente, dhEvento }, assinatura))
    .join("");
  return `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${p.idLote}</idLote>${eventos}</envEvento>`;
}
