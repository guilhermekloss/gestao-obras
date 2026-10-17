import { describe, expect, it, beforeAll } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml, C14nCanonicalization } from "xml-crypto";
import { dataHoraEvento, envEventoCiencia, eventoAssinado, idEventoCiencia, infEventoCanonico } from "../assinatura";
import { lerCertificadoPem, type CertificadoA1 } from "../certificado";
import { gerarPemDeTeste } from "./certificado-teste";
import { CHAVE_FIXTURE, CNPJ_EMPRESA } from "./respostas";

let pem: string;
let cert: CertificadoA1;

beforeAll(() => {
  pem = gerarPemDeTeste();
  const lido = lerCertificadoPem(pem);
  if (!lido.ok) throw new Error(lido.erro);
  cert = lido.certificado;
});

const P = { chave: CHAVE_FIXTURE, cnpj: CNPJ_EMPRESA, ambiente: "producao" as const, dhEvento: "2026-10-17T10:00:00-03:00" };

describe("dataHoraEvento", () => {
  it("horário de Brasília com 1 min de folga para trás", () => {
    expect(dataHoraEvento(new Date("2026-10-17T13:00:30Z"))).toBe("2026-10-17T09:59:30-03:00");
  });
});

describe("idEventoCiencia", () => {
  it("ID + tpEvento + chave + sequência com 2 dígitos (54 caracteres)", () => {
    const id = idEventoCiencia(CHAVE_FIXTURE);
    expect(id).toBe(`ID210210${CHAVE_FIXTURE}01`);
    expect(id).toHaveLength(54);
  });
});

describe("infEventoCanonico", () => {
  it("é igual à canonicalização C14N do elemento dentro do documento assinado", () => {
    const xml = eventoAssinado(P, cert);
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const inf = doc.getElementsByTagName("infEvento")[0];
    const c14n = new C14nCanonicalization().process(inf, {}).toString();
    expect(c14n).toBe(infEventoCanonico(P));
  });

  it("recusa chave que não tem 44 dígitos", () => {
    expect(() => infEventoCanonico({ ...P, chave: "123" })).toThrow();
  });

  it("órgão 91 (Ambiente Nacional), evento 210210 e descrição sem acento, como pede o leiaute", () => {
    const inf = infEventoCanonico(P);
    expect(inf).toContain("<cOrgao>91</cOrgao>");
    expect(inf).toContain("<tpEvento>210210</tpEvento>");
    expect(inf).toContain("<descEvento>Ciencia da Operacao</descEvento>");
    expect(inf).toContain(`<CNPJ>${CNPJ_EMPRESA}</CNPJ>`);
  });
});

describe("eventoAssinado", () => {
  it("a assinatura confere com o certificado (validada pelo xml-crypto)", () => {
    const xml = eventoAssinado(P, cert);
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const assinatura = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    const sig = new SignedXml({ publicCert: pem, getCertFromKeyInfo: () => null });
    sig.loadSignature(assinatura);
    expect(sig.checkSignature(xml)).toBe(true);
  });

  it("assinatura adulterada não confere", () => {
    const xml = eventoAssinado(P, cert).replace("<tpAmb>1</tpAmb>", "<tpAmb>2</tpAmb>");
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const assinatura = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    const sig = new SignedXml({ publicCert: pem, getCertFromKeyInfo: () => null });
    sig.loadSignature(assinatura);
    let confere: boolean;
    try {
      confere = sig.checkSignature(xml);
    } catch {
      confere = false;
    }
    expect(confere).toBe(false);
  });

  it("leva o certificado do titular no KeyInfo", () => {
    expect(eventoAssinado(P, cert)).toContain(`<X509Certificate>${cert.certificadoBase64}</X509Certificate>`);
  });
});

describe("envEventoCiencia", () => {
  it("um evento assinado por nota, num lote só", () => {
    const xml = envEventoCiencia(
      { chaves: [CHAVE_FIXTURE, "4".repeat(44)], cnpj: CNPJ_EMPRESA, ambiente: "homologacao", agora: new Date(), idLote: "123" },
      cert,
    );
    expect(xml.startsWith('<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>123</idLote>')).toBe(true);
    expect(xml.match(/<Signature /g)).toHaveLength(2);
    expect(xml.match(/<tpAmb>2<\/tpAmb>/g)).toHaveLength(2);
  });

  it("respeita o limite de 20 eventos por lote e o idLote numérico", () => {
    const base = { cnpj: CNPJ_EMPRESA, ambiente: "producao" as const, agora: new Date(), idLote: "1" };
    expect(() => envEventoCiencia({ ...base, chaves: [] }, cert)).toThrow();
    expect(() => envEventoCiencia({ ...base, chaves: Array(21).fill(CHAVE_FIXTURE) }, cert)).toThrow();
    expect(() => envEventoCiencia({ ...base, chaves: [CHAVE_FIXTURE], idLote: "abc" }, cert)).toThrow();
  });
});
