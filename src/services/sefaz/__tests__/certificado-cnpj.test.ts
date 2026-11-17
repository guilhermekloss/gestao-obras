import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { carregarCertificado, cnpjDoCertificado, cnpjsConsultaveis, lerCertificadoPem } from "../certificado";
import { gerarPemDeTeste } from "./certificado-teste";

const certDe = (pem: string) => new X509Certificate(pem.slice(pem.indexOf("-----BEGIN CERTIFICATE-----")));

describe("cnpjDoCertificado", () => {
  it("o CNPJ do OID 2.16.76.1.3.3 tem prioridade sobre o que vier no CN", () => {
    const pem = gerarPemDeTeste({ cnpj: "11222333000181", cn: "CONSTRUTORA TESTE LTDA:99888777000166" });
    expect(cnpjDoCertificado(certDe(pem))).toBe("11222333000181");
  });

  it("lê o OID mesmo quando o CN não traz CNPJ", () => {
    const pem = gerarPemDeTeste({ cnpj: "11222333000181", cn: "CONSTRUTORA TESTE LTDA" });
    expect(cnpjDoCertificado(certDe(pem))).toBe("11222333000181");
  });

  it("aceita CNPJ alfanumérico no OID", () => {
    const pem = gerarPemDeTeste({ cnpj: "AB12CD34EF0155", cn: "CONSTRUTORA TESTE LTDA" });
    expect(cnpjDoCertificado(certDe(pem))).toBe("AB12CD34EF0155");
  });

  it("sem o OID, usa o padrão ICP-Brasil do CN (RAZAO SOCIAL:CNPJ)", () => {
    const pem = gerarPemDeTeste({ semOid: true, cn: "CONSTRUTORA TESTE LTDA:99888777000166" });
    expect(cnpjDoCertificado(certDe(pem))).toBe("99888777000166");
  });

  it("sem o OID, aceita CNPJ alfanumérico no CN", () => {
    const pem = gerarPemDeTeste({ semOid: true, cn: "CONSTRUTORA TESTE LTDA:AB12CD34EF0155" });
    expect(cnpjDoCertificado(certDe(pem))).toBe("AB12CD34EF0155");
  });

  it("sem o OID e sem CNPJ completo no CN: null", () => {
    expect(cnpjDoCertificado(certDe(gerarPemDeTeste({ semOid: true, cn: "CONSTRUTORA TESTE LTDA" })))).toBeNull();
    expect(cnpjDoCertificado(certDe(gerarPemDeTeste({ semOid: true, cn: "CONSTRUTORA:9988877700016" })))).toBeNull();
    expect(cnpjDoCertificado(certDe(gerarPemDeTeste({ semOid: true, cn: "CONSTRUTORA:998887770001AB" })))).toBeNull();
  });
});

describe("lerCertificadoPem: titular, emissor e cadeia", () => {
  it("titular e emissor vêm só do CN", () => {
    const r = lerCertificadoPem(gerarPemDeTeste({ cn: "CONSTRUTORA TESTE LTDA" }));
    if (!r.ok) throw new Error(r.erro);
    expect(r.certificado.titular).toBe("CONSTRUTORA TESTE LTDA");
    expect(r.certificado.emissor).toBe("CONSTRUTORA TESTE LTDA");
  });

  it("mantém a cadeia inteira depois do titular, sem repetir o titular", () => {
    const pem = gerarPemDeTeste();
    const outro = gerarPemDeTeste({ cnpj: "99888777000166" });
    const certOutro = outro.slice(outro.indexOf("-----BEGIN CERTIFICATE-----")).trim();
    const [chave] = pem.split("-----BEGIN CERTIFICATE-----");
    const certTitular = pem.slice(pem.indexOf("-----BEGIN CERTIFICATE-----")).trim();
    const r = lerCertificadoPem(`${certOutro}\n${chave}${certTitular}`);
    if (!r.ok) throw new Error(r.erro);
    expect(r.certificado.certificadosPem).toBe(`${certTitular}\n${certOutro}`);
  });
});

describe("carregarCertificado: senha e cache", () => {
  it("usa SEFAZ_CERT_SENHA para abrir a chave cifrada", () => {
    const cifrado = gerarPemDeTeste({ senha: "segredo" });
    expect(carregarCertificado({ SEFAZ_CERT_PEM: cifrado, SEFAZ_CERT_SENHA: "segredo" }).ok).toBe(true);
  });

  it("PEM só com espaços conta como não configurado", () => {
    expect(carregarCertificado({ SEFAZ_CERT_PEM: "  \n " })).toEqual({
      ok: false,
      erro: "Certificado A1 não configurado (SEFAZ_CERT_PEM).",
      ausente: true,
    });
  });

  it("o mesmo PEM é lido uma vez; um PEM novo é lido de novo", () => {
    const a = gerarPemDeTeste();
    const b = gerarPemDeTeste({ cnpj: "99888777000166" });
    const primeiro = carregarCertificado({ SEFAZ_CERT_PEM: a });
    expect(carregarCertificado({ SEFAZ_CERT_PEM: a })).toBe(primeiro);
    const novo = carregarCertificado({ SEFAZ_CERT_PEM: b });
    expect(novo).not.toBe(primeiro);
    expect(novo.ok && novo.certificado.cnpj).toBe("99888777000166");
  });
});

describe("cnpjsConsultaveis sem CNPJ no certificado", () => {
  it("consulta todos os CNPJs válidos da empresa, sem repetir", () => {
    expect(cnpjsConsultaveis(["11.222.333/0001-81", "11222333000181", "123", "99888777000166"], null)).toEqual({
      consultaveis: ["11222333000181", "99888777000166"],
      foraDoCertificado: [],
    });
  });
});
