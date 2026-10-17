import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  classificarDocumento,
  dadosDaChaveNfe,
  descompactarDocZip,
  envelopeDistNsu,
  envelopeEvento,
  lerRetornoDistribuicao,
  lerRetornoEvento,
  normalizarCnpj,
} from "../xml";
import { CHAVE_FIXTURE, procNfeFixture, resEventoCancelamento, resNfe, retDist, retEvento } from "./respostas";

describe("envelopeDistNsu", () => {
  it("monta o distDFeInt pela distribuição por NSU, com NSU de 15 dígitos", () => {
    const xml = envelopeDistNsu({ ambiente: "producao", cUFAutor: "41", cnpj: "11.222.333/0001-81", ultNsu: "42" });
    expect(xml).toContain(
      '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>41</cUFAutor>' +
        "<CNPJ>11222333000181</CNPJ><distNSU><ultNSU>000000000000042</ultNSU></distNSU></distDFeInt>",
    );
    expect(xml).toContain('<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">');
    expect(xml).toContain("http://www.w3.org/2003/05/soap-envelope");
  });

  it("homologação usa tpAmb 2", () => {
    expect(envelopeDistNsu({ ambiente: "homologacao", cUFAutor: "41", cnpj: "11222333000181", ultNsu: "0" })).toContain(
      "<tpAmb>2</tpAmb>",
    );
  });

  it("evento vai direto no nfeDadosMsg do NFeRecepcaoEvento4", () => {
    expect(envelopeEvento("<envEvento/>")).toContain(
      '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><envEvento/></nfeDadosMsg>',
    );
  });
});

describe("normalizarCnpj", () => {
  it("tira a pontuação e mantém letras do CNPJ alfanumérico", () => {
    expect(normalizarCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizarCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(normalizarCnpj(null)).toBe("");
  });
});

describe("lerRetornoDistribuicao", () => {
  it("lê cStat, NSUs e descompacta cada docZip", () => {
    const r = lerRetornoDistribuicao(
      retDist({
        cStat: "138",
        ultNSU: "000000000000002",
        maxNSU: "000000000000010",
        docs: [
          { nsu: "000000000000001", schema: "resNFe_v1.01.xsd", xml: resNfe() },
          { nsu: "000000000000002", schema: "resEvento_v1.01.xsd", xml: resEventoCancelamento() },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.erro);
    expect(r.retorno).toMatchObject({ cStat: "138", ultNsu: "000000000000002", maxNsu: "000000000000010" });
    expect(r.retorno.docs.map((d) => [d.nsu, d.schema])).toEqual([
      ["000000000000001", "resNFe_v1.01.xsd"],
      ["000000000000002", "resEvento_v1.01.xsd"],
    ]);
    expect(r.retorno.docs[0].xml).toContain("<chNFe>");
  });

  it("um docZip só (sem array) também é lido", () => {
    const r = lerRetornoDistribuicao(
      retDist({ cStat: "138", ultNSU: "1", maxNSU: "1", docs: [{ nsu: "1", schema: "resNFe_v1.01.xsd", xml: resNfe() }] }),
    );
    expect(r.ok && r.retorno.docs).toHaveLength(1);
  });

  it("137 vem sem lote", () => {
    const r = lerRetornoDistribuicao(retDist({ cStat: "137", xMotivo: "Nenhum documento localizado", ultNSU: "5", maxNSU: "5" }));
    expect(r.ok && r.retorno).toMatchObject({ cStat: "137", docs: [], ultNsu: "000000000000005" });
  });

  it("Fault SOAP vira erro legível", () => {
    const fault =
      '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault>' +
      '<soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang="pt">Certificado inválido</soap:Text></soap:Reason>' +
      "</soap:Fault></soap:Body></soap:Envelope>";
    expect(lerRetornoDistribuicao(fault)).toEqual({ ok: false, erro: "Falha SOAP da Sefaz: Certificado inválido" });
  });

  it("recusa DOCTYPE, XML quebrado e resposta sem retDistDFeInt", () => {
    expect(lerRetornoDistribuicao('<!DOCTYPE x [<!ENTITY a "b">]><x/>').ok).toBe(false);
    expect(lerRetornoDistribuicao("<a><b></a>").ok).toBe(false);
    expect(lerRetornoDistribuicao("").ok).toBe(false);
    expect(lerRetornoDistribuicao('<soap:Envelope xmlns:soap="x"><soap:Body/></soap:Envelope>')).toEqual({
      ok: false,
      erro: "Resposta da Sefaz sem retDistDFeInt/cStat.",
    });
  });
});

describe("descompactarDocZip", () => {
  it("barra bomba de descompressão", () => {
    const enorme = gzipSync(Buffer.alloc(6 * 1024 * 1024, 32)).toString("base64");
    expect(() => descompactarDocZip(enorme)).toThrow();
  });
});

describe("lerRetornoEvento", () => {
  it("lê o resultado de cada evento do lote", () => {
    const r = lerRetornoEvento(
      retEvento({ eventos: [{ chave: CHAVE_FIXTURE, cStat: "135" }, { chave: "1".repeat(44), cStat: "596", xMotivo: "Fora do prazo" }] }),
    );
    expect(r).toEqual({
      ok: true,
      cStat: "128",
      xMotivo: "Lote de evento processado",
      eventos: [
        { chave: CHAVE_FIXTURE, cStat: "135", xMotivo: "Evento registrado e vinculado a NF-e" },
        { chave: "1".repeat(44), cStat: "596", xMotivo: "Fora do prazo" },
      ],
    });
  });
});

describe("dadosDaChaveNfe", () => {
  it("tira modelo, série e número da chave", () => {
    expect(dadosDaChaveNfe(CHAVE_FIXTURE)).toEqual({ modelo: "55", serie: "1", numero: "1234" });
  });
});

describe("classificarDocumento", () => {
  it("resNFe autorizada vira RESUMO com valor em centavos e série/número da chave", () => {
    expect(classificarDocumento({ nsu: "1", schema: "resNFe_v1.01.xsd", xml: resNfe() })).toEqual({
      tipo: "RESUMO",
      nsu: "1",
      chave: CHAVE_FIXTURE,
      emitenteDoc: "98765432000110",
      emitenteNome: "TINTAS EXEMPLO COMERCIO LTDA",
      dataEmissao: "2026-09-02",
      valorCents: 155600,
      autorizada: true,
    });
  });

  it("resNFe cancelada (cSitNFe 3) não é autorizada", () => {
    const d = classificarDocumento({ nsu: "1", schema: "resNFe_v1.01.xsd", xml: resNfe({ cSit: "3" }) });
    expect(d.tipo === "RESUMO" && d.autorizada).toBe(false);
  });

  it("procNFe vira COMPLETO, com o destinatário lido", () => {
    const d = classificarDocumento({ nsu: "2", schema: "procNFe_v4.00.xsd", xml: procNfeFixture() });
    if (d.tipo !== "COMPLETO") throw new Error(`veio ${d.tipo}`);
    expect(d.nfe.chave).toBe(CHAVE_FIXTURE);
    expect(d.nfe.destinatario).toBe("11222333000181");
    expect(d.xml).toContain("<nfeProc");
  });

  it("evento de cancelamento vira CANCELAMENTO; outros eventos são ignorados", () => {
    expect(classificarDocumento({ nsu: "3", schema: "resEvento_v1.01.xsd", xml: resEventoCancelamento() })).toEqual({
      tipo: "CANCELAMENTO",
      nsu: "3",
      chave: CHAVE_FIXTURE,
    });
    const cce = resEventoCancelamento().replace("110111", "110110");
    expect(classificarDocumento({ nsu: "4", schema: "resEvento_v1.01.xsd", xml: cce }).tipo).toBe("IGNORADO");
  });

  it("procEventoNFe de cancelamento também conta", () => {
    const xml =
      '<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento Id="x">' +
      `<chNFe>${CHAVE_FIXTURE}</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;
    expect(classificarDocumento({ nsu: "5", schema: "procEventoNFe_v1.00.xsd", xml }).tipo).toBe("CANCELAMENTO");
  });

  it("schema desconhecido, XML ruim ou resumo incompleto são ignorados (sem derrubar a execução)", () => {
    expect(classificarDocumento({ nsu: "6", schema: "resCTe_v1.00.xsd", xml: "<resCTe/>" }).tipo).toBe("IGNORADO");
    expect(classificarDocumento({ nsu: "7", schema: "resNFe_v1.01.xsd", xml: "<resNFe>" }).tipo).toBe("IGNORADO");
    expect(classificarDocumento({ nsu: "8", schema: "resNFe_v1.01.xsd", xml: resNfe({ vNF: "abc" }) }).tipo).toBe("IGNORADO");
    expect(classificarDocumento({ nsu: "9", schema: "procNFe_v4.00.xsd", xml: "<nfeProc/>" }).tipo).toBe("IGNORADO");
  });
});
