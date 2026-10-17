import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";

// Respostas no formato do Ambiente Nacional, com dados fictícios.

export const CNPJ_EMPRESA = "11222333000181";
export const CHAVE_FIXTURE = "35260998765432000110550010000012341876543210";

export const procNfeFixture = () =>
  readFileSync(path.join(__dirname, "..", "..", "__tests__", "fixtures", "nfe-1-item.xml"), "utf8");

export function zip(xml: string): string {
  return gzipSync(Buffer.from(xml, "utf8")).toString("base64");
}

export function resNfe(p: { chave?: string; cnpjEmit?: string; vNF?: string; cSit?: string; xNome?: string } = {}): string {
  return (
    `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<chNFe>${p.chave ?? CHAVE_FIXTURE}</chNFe><CNPJ>${p.cnpjEmit ?? "98765432000110"}</CNPJ>` +
    `<xNome>${p.xNome ?? "TINTAS EXEMPLO COMERCIO LTDA"}</xNome><IE>123</IE>` +
    `<dhEmi>2026-09-02T09:15:00-03:00</dhEmi><tpNF>1</tpNF><vNF>${p.vNF ?? "1556.00"}</vNF>` +
    `<digVal>abc=</digVal><dhRecbto>2026-09-02T09:16:00-03:00</dhRecbto><nProt>135260000000001</nProt>` +
    `<cSitNFe>${p.cSit ?? "1"}</cSitNFe></resNFe>`
  );
}

export function resEventoCancelamento(chave = CHAVE_FIXTURE): string {
  return (
    `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><cOrgao>35</cOrgao>` +
    `<CNPJ>98765432000110</CNPJ><chNFe>${chave}</chNFe><dhEvento>2026-09-03T10:00:00-03:00</dhEvento>` +
    `<tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><xEvento>Cancelamento</xEvento>` +
    `<dhRecbto>2026-09-03T10:00:01-03:00</dhRecbto><nProt>135260000000002</nProt></resEvento>`
  );
}

export function retDist(p: {
  cStat: string;
  xMotivo?: string;
  ultNSU: string;
  maxNSU: string;
  docs?: { nsu: string; schema: string; xml: string }[];
}): string {
  const lote = p.docs?.length
    ? `<loteDistDFeInt>${p.docs.map((d) => `<docZip NSU="${d.nsu}" schema="${d.schema}">${zip(d.xml)}</docZip>`).join("")}</loteDistDFeInt>`
    : "";
  return (
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
    `<nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult>` +
    `<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><verAplic>1.7.5</verAplic>` +
    `<cStat>${p.cStat}</cStat><xMotivo>${p.xMotivo ?? "Documento(s) localizado(s)"}</xMotivo><dhResp>2026-10-17T10:00:00-03:00</dhResp>` +
    `<ultNSU>${p.ultNSU}</ultNSU><maxNSU>${p.maxNSU}</maxNSU>${lote}</retDistDFeInt>` +
    `</nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`
  );
}

export function retEvento(p: { cStatLote?: string; eventos: { chave: string; cStat: string; xMotivo?: string }[] }): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
    `<nfeRecepcaoEventoNFResult xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
    `<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>1</tpAmb>` +
    `<verAplic>AN_1.0</verAplic><cOrgao>91</cOrgao><cStat>${p.cStatLote ?? "128"}</cStat><xMotivo>Lote de evento processado</xMotivo>` +
    p.eventos
      .map(
        (e) =>
          `<retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><verAplic>AN_1.0</verAplic><cOrgao>91</cOrgao>` +
          `<cStat>${e.cStat}</cStat><xMotivo>${e.xMotivo ?? "Evento registrado e vinculado a NF-e"}</xMotivo>` +
          `<chNFe>${e.chave}</chNFe><tpEvento>210210</tpEvento></infEvento></retEvento>`,
      )
      .join("") +
    `</retEnvEvento></nfeRecepcaoEventoNFResult></soap:Body></soap:Envelope>`
  );
}
