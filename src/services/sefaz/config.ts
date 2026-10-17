import { carregarCertificado, cnpjsConsultaveis, infoDoCertificado, type Env, type InfoCertificado } from "./certificado";
import type { ConfigSefaz } from "./cliente";
import { normalizarCnpj, type Ambiente } from "./xml";

export type SituacaoConfig = {
  habilitado: boolean;
  ambiente: Ambiente;
  certificado: InfoCertificado | null;
  erroCertificado: string | null;
  cnpjs: string[];
  foraDoCertificado: string[];
};

function lerAmbiente(env: Env): Ambiente {
  return env.SEFAZ_AMBIENTE === "producao" ? "producao" : "homologacao";
}

export function lerCnpjsConfigurados(env: Env): string[] {
  return (env.CNPJS_EMPRESA ?? "").split(/[,;\s]+/).map(normalizarCnpj).filter(Boolean);
}

/** Para o painel: nunca devolve chave nem PEM. */
export function situacaoDaConfig(env: Env = process.env): SituacaoConfig {
  const cert = carregarCertificado(env);
  const info = cert.ok ? infoDoCertificado(cert.certificado) : null;
  const { consultaveis, foraDoCertificado } = cnpjsConsultaveis(lerCnpjsConfigurados(env), info?.cnpj ?? null);
  return {
    habilitado: env.SEFAZ_HABILITADO === "true",
    ambiente: lerAmbiente(env),
    certificado: info,
    erroCertificado: cert.ok ? null : cert.erro,
    cnpjs: consultaveis,
    foraDoCertificado,
  };
}

export function montarConfig(
  env: Env = process.env,
): { ok: true; config: ConfigSefaz; cnpjs: string[] } | { ok: false; erro: string } {
  if (env.SEFAZ_HABILITADO !== "true") return { ok: false, erro: "Captura na Sefaz desligada (SEFAZ_HABILITADO)." };
  const cert = carregarCertificado(env);
  if (!cert.ok) return { ok: false, erro: cert.erro };
  if (cert.certificado.validoAte <= new Date()) {
    return { ok: false, erro: `Certificado A1 vencido em ${cert.certificado.validoAte.toLocaleDateString("pt-BR")}.` };
  }
  const { consultaveis } = cnpjsConsultaveis(lerCnpjsConfigurados(env), cert.certificado.cnpj);
  if (consultaveis.length === 0) {
    return { ok: false, erro: "Nenhum CNPJ para consultar: configure CNPJS_EMPRESA com a mesma raiz do certificado." };
  }
  return {
    ok: true,
    cnpjs: consultaveis,
    config: {
      ambiente: lerAmbiente(env),
      cUFAutor: /^\d{2}$/.test(env.SEFAZ_UF_AUTOR ?? "") ? env.SEFAZ_UF_AUTOR! : "41",
      certificado: cert.certificado,
      caExtraPem: env.SEFAZ_CA_PEM?.replace(/\\n/g, "\n") || undefined,
    },
  };
}
