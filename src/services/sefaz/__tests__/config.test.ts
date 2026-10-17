import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Empresa } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { cifrar, decifrar } = await import("@/lib/cofre");
const { fonteDaEmpresa, montarConfig, situacaoDaConfig } = await import("../config");
const { gerarPemDeTeste } = await import("./certificado-teste");

const CHAVE = randomBytes(32);
const abrir = (d: Uint8Array) => decifrar(d, { 1: CHAVE });
let pem: string;

beforeAll(() => {
  pem = gerarPemDeTeste();
});

function empresa(campos: Partial<Empresa> = {}): Empresa {
  return {
    id: "principal",
    razaoSocial: "Construtora Teste",
    nomeFantasia: null,
    cnpj: "11222333000181",
    filiais: ["11222333000262"],
    uf: "SC",
    capturaAtiva: true,
    ambienteSefaz: "PRODUCAO",
    frequenciaCaptura: "DUAS_VEZES_DIA",
    certificadoCifrado: cifrar(pem, { 1: CHAVE }),
    certificadoTitular: null,
    certificadoCnpj: "11222333000181",
    certificadoEmissor: null,
    certificadoValidoDesde: null,
    certificadoValidoAte: null,
    certificadoEnviadoEm: null,
    certificadoEnviadoPorId: null,
    atualizadoEm: new Date(),
    ...campos,
  };
}

describe("fonteDaEmpresa", () => {
  it("usa o cadastro: CNPJs da matriz e filiais, UF vira cUFAutor, ambiente e certificado decifrado", () => {
    const r = montarConfig(fonteDaEmpresa(empresa(), {}, abrir));
    if (!r.ok) throw new Error(r.erro);
    expect(r.cnpjs).toEqual(["11222333000181", "11222333000262"]);
    expect(r.config).toMatchObject({ ambiente: "producao", cUFAutor: "42" });
    expect(r.frequencia).toBe("DUAS_VEZES_DIA");
    expect(r.config.certificado.cnpj).toBe("11222333000181");
  });

  it("captura desligada na tela Empresa", () => {
    expect(montarConfig(fonteDaEmpresa(empresa({ capturaAtiva: false }), {}, abrir))).toEqual({
      ok: false,
      erro: "Captura na Sefaz desligada (tela Empresa).",
    });
  });

  it("sem certificado ou com cofre trocado: erro que diz o que fazer", () => {
    expect(situacaoDaConfig(fonteDaEmpresa(empresa({ certificadoCifrado: null }), {}, abrir)).erroCertificado).toBe(
      "Certificado A1 não enviado: cadastre em Empresa.",
    );
    const outraChave = (d: Uint8Array) => decifrar(d, { 1: randomBytes(32) });
    expect(situacaoDaConfig(fonteDaEmpresa(empresa(), {}, outraChave)).erroCertificado).toMatch(/Envie o \.pfx de novo/);
  });

  it("o painel recebe só os dados públicos do certificado", () => {
    const s = situacaoDaConfig(fonteDaEmpresa(empresa(), {}, abrir));
    expect(s).toMatchObject({ habilitado: true, origem: "empresa", cnpjs: ["11222333000181", "11222333000262"] });
    expect(JSON.stringify(s)).not.toMatch(/PRIVATE|CERTIFICATE/);
  });
});
