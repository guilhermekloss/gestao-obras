import { describe, expect, it, beforeAll, vi } from "vitest";
import { carregarCertificado, cnpjsConsultaveis, infoDoCertificado, lerCertificadoPem } from "../certificado";
import { situacaoDaConfig, montarConfig } from "../config";
import { gerarPemDeTeste } from "./certificado-teste";
import { CNPJ_EMPRESA } from "./respostas";

let pem: string;

beforeAll(() => {
  pem = gerarPemDeTeste();
});

describe("lerCertificadoPem", () => {
  it("lê titular, CNPJ do e-CNPJ, emissor e validade", () => {
    const r = lerCertificadoPem(pem);
    if (!r.ok) throw new Error(r.erro);
    const info = infoDoCertificado(r.certificado);
    expect(info.titular).toBe(`CONSTRUTORA TESTE LTDA:${CNPJ_EMPRESA}`);
    expect(info.cnpj).toBe(CNPJ_EMPRESA);
    expect(info.validoAte.getTime()).toBeGreaterThan(Date.now());
    expect(r.certificado.certificadosPem).toContain("BEGIN CERTIFICATE");
    expect(r.certificado.certificadosPem).not.toContain("PRIVATE KEY");
  });

  it("abre chave privada cifrada com a senha", () => {
    const cifrado = gerarPemDeTeste({ senha: "segredo" });
    expect(cifrado).toContain("ENCRYPTED PRIVATE KEY");
    expect(lerCertificadoPem(cifrado, "segredo").ok).toBe(true);
    expect(lerCertificadoPem(cifrado, "errada")).toMatchObject({ ok: false });
  });

  it("recusa PEM sem chave, sem certificado ou com chave de outro certificado", () => {
    const [chave] = pem.split("-----BEGIN CERTIFICATE-----");
    const certificado = pem.slice(pem.indexOf("-----BEGIN CERTIFICATE-----"));
    expect(lerCertificadoPem(certificado).ok).toBe(false);
    expect(lerCertificadoPem(chave).ok).toBe(false);
    const outro = gerarPemDeTeste();
    const certOutro = outro.slice(outro.indexOf("-----BEGIN CERTIFICATE-----"));
    expect(lerCertificadoPem(chave + certOutro)).toEqual({
      ok: false,
      erro: "Nenhum certificado do PEM corresponde à chave privada.",
    });
  });

  it("acha o certificado do titular mesmo com a cadeia antes dele", () => {
    const outro = gerarPemDeTeste({ cnpj: "99888777000166" });
    const certOutro = outro.slice(outro.indexOf("-----BEGIN CERTIFICATE-----"));
    const [chave] = pem.split("-----BEGIN CERTIFICATE-----");
    const certTitular = pem.slice(pem.indexOf("-----BEGIN CERTIFICATE-----"));
    const r = lerCertificadoPem(certOutro + chave + certTitular);
    if (!r.ok) throw new Error(r.erro);
    expect(r.certificado.cnpj).toBe(CNPJ_EMPRESA);
    expect(r.certificado.certificadosPem.indexOf(certTitular.trim())).toBe(0);
  });
});

describe("carregarCertificado", () => {
  it("sem SEFAZ_CERT_PEM: avisa que falta configurar", () => {
    expect(carregarCertificado({})).toMatchObject({ ok: false, ausente: true });
  });

  it("aceita o PEM com quebras de linha escapadas (\\n), como às vezes chega por variável", () => {
    expect(carregarCertificado({ SEFAZ_CERT_PEM: pem.replace(/\n/g, "\\n") }).ok).toBe(true);
  });
});

describe("cnpjsConsultaveis", () => {
  it("só os CNPJs da raiz do certificado entram; os outros são apontados", () => {
    expect(cnpjsConsultaveis(["11222333000181", "11.222.333/0002-62", "99888777000166"], "11222333000181")).toEqual({
      consultaveis: ["11222333000181", "11222333000262"],
      foraDoCertificado: ["99888777000166"],
    });
  });

  it("sem CNPJS_EMPRESA, consulta o CNPJ do próprio certificado", () => {
    expect(cnpjsConsultaveis([], "11222333000181")).toEqual({ consultaveis: ["11222333000181"], foraDoCertificado: [] });
  });

  it("descarta valores que não têm 14 caracteres e repetidos", () => {
    expect(cnpjsConsultaveis(["123", "11222333000181", "11222333000181"], "11222333000181").consultaveis).toEqual([
      "11222333000181",
    ]);
  });
});

describe("config", () => {
  it("desligada por padrão e em homologação por padrão", () => {
    expect(montarConfig({ SEFAZ_CERT_PEM: pem })).toEqual({ ok: false, erro: "Captura na Sefaz desligada (SEFAZ_HABILITADO)." });
    const s = situacaoDaConfig({ SEFAZ_CERT_PEM: pem });
    expect(s).toMatchObject({ habilitado: false, ambiente: "homologacao", cnpjs: [CNPJ_EMPRESA], erroCertificado: null });
  });

  it("ligada: monta a configuração com UF 41 (PR) por padrão", () => {
    const r = montarConfig({ SEFAZ_HABILITADO: "true", SEFAZ_AMBIENTE: "producao", SEFAZ_CERT_PEM: pem });
    if (!r.ok) throw new Error(r.erro);
    expect(r.cnpjs).toEqual([CNPJ_EMPRESA]);
    expect(r.config.ambiente).toBe("producao");
    expect(r.config.cUFAutor).toBe("41");
  });

  it("recusa certificado vencido", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000));
      const r = montarConfig({ SEFAZ_HABILITADO: "true", SEFAZ_CERT_PEM: pem });
      expect(r).toMatchObject({ ok: false });
      expect(!r.ok && r.erro).toMatch(/^Certificado A1 vencido em/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recusa quando nenhum CNPJ configurado é da raiz do certificado", () => {
    const r = montarConfig({ SEFAZ_HABILITADO: "true", SEFAZ_CERT_PEM: pem, CNPJS_EMPRESA: "99888777000166" });
    expect(r).toMatchObject({ ok: false });
  });

  it("o painel nunca recebe a chave nem o PEM", () => {
    const s = situacaoDaConfig({ SEFAZ_CERT_PEM: pem });
    expect(JSON.stringify(s)).not.toContain("PRIVATE");
    expect(JSON.stringify(s)).not.toContain("CERTIFICATE");
  });
});
