import type { Empresa } from "@prisma/client";
import { decifrar } from "@/lib/cofre";
import { UFS, carregarEmpresa, cnpjsDe } from "@/services/empresa";
import { carregarCertificado, cnpjsConsultaveis, infoDoCertificado, lerCertificadoPem, type Env, type InfoCertificado } from "./certificado";
import type { ConfigSefaz } from "./cliente";
import type { Ambiente } from "./xml";

// De onde vem a configuração da captura: do cadastro da empresa (tela Empresa) e, sem cadastro, das variáveis
// de ambiente da instalação. As funções sobre FonteConfig são puras; só carregarFonte() lê o banco.

export type FonteConfig = {
  habilitado: boolean;
  ambiente: Ambiente;
  cUFAutor: string;
  cnpjs: string[];
  certificado: ReturnType<typeof lerCertificadoPem>;
  caExtraPem?: string;
  /** "empresa": cadastro da tela; "ambiente": variáveis (instalação antiga, testes). */
  origem: "empresa" | "ambiente";
};

export type SituacaoConfig = {
  habilitado: boolean;
  ambiente: Ambiente;
  certificado: InfoCertificado | null;
  erroCertificado: string | null;
  cnpjs: string[];
  foraDoCertificado: string[];
  origem: FonteConfig["origem"];
};

const SEM_CERTIFICADO = { ok: false as const, erro: "Certificado A1 não enviado: cadastre em Empresa." };

export function fonteDoAmbiente(env: Env): FonteConfig {
  return {
    habilitado: env.SEFAZ_HABILITADO === "true",
    ambiente: env.SEFAZ_AMBIENTE === "producao" ? "producao" : "homologacao",
    cUFAutor: /^\d{2}$/.test(env.SEFAZ_UF_AUTOR ?? "") ? env.SEFAZ_UF_AUTOR! : "41",
    cnpjs: cnpjsDe(null, env),
    certificado: env.SEFAZ_CERT_PEM?.trim() ? carregarCertificado(env) : SEM_CERTIFICADO,
    caExtraPem: env.SEFAZ_CA_PEM?.replace(/\\n/g, "\n") || undefined,
    origem: "ambiente",
  };
}

export function fonteDaEmpresa(empresa: Empresa, env: Env, abrir: (dados: Uint8Array) => string = decifrar): FonteConfig {
  let certificado: FonteConfig["certificado"] = SEM_CERTIFICADO;
  if (empresa.certificadoCifrado) {
    try {
      certificado = lerCertificadoPem(abrir(empresa.certificadoCifrado));
    } catch {
      certificado = { ok: false, erro: "Não foi possível abrir o certificado guardado (chave do cofre trocada?). Envie o .pfx de novo." };
    }
  }
  return {
    habilitado: empresa.capturaAtiva,
    ambiente: empresa.ambienteSefaz === "PRODUCAO" ? "producao" : "homologacao",
    cUFAutor: UFS[empresa.uf] ?? "41",
    cnpjs: cnpjsDe(empresa),
    certificado,
    caExtraPem: env.SEFAZ_CA_PEM?.replace(/\\n/g, "\n") || undefined,
    origem: "empresa",
  };
}

export async function carregarFonte(env: Env = process.env): Promise<FonteConfig> {
  const empresa = await carregarEmpresa();
  return empresa ? fonteDaEmpresa(empresa, env) : fonteDoAmbiente(env);
}

/** Para o painel: nunca devolve chave nem PEM. */
export function situacaoDaConfig(fonte: FonteConfig): SituacaoConfig {
  const info = fonte.certificado.ok ? infoDoCertificado(fonte.certificado.certificado) : null;
  const { consultaveis, foraDoCertificado } = cnpjsConsultaveis(fonte.cnpjs, info?.cnpj ?? null);
  return {
    habilitado: fonte.habilitado,
    ambiente: fonte.ambiente,
    certificado: info,
    erroCertificado: fonte.certificado.ok ? null : fonte.certificado.erro,
    cnpjs: consultaveis,
    foraDoCertificado,
    origem: fonte.origem,
  };
}

export function montarConfig(
  fonte: FonteConfig,
  agora: Date = new Date(),
): { ok: true; config: ConfigSefaz; cnpjs: string[] } | { ok: false; erro: string } {
  if (!fonte.habilitado) {
    return { ok: false, erro: fonte.origem === "empresa" ? "Captura na Sefaz desligada (tela Empresa)." : "Captura na Sefaz desligada (SEFAZ_HABILITADO)." };
  }
  const cert = fonte.certificado;
  if (!cert.ok) return { ok: false, erro: cert.erro };
  if (cert.certificado.validoAte <= agora) {
    return { ok: false, erro: `Certificado A1 vencido em ${cert.certificado.validoAte.toLocaleDateString("pt-BR")}.` };
  }
  const { consultaveis } = cnpjsConsultaveis(fonte.cnpjs, cert.certificado.cnpj);
  if (consultaveis.length === 0) {
    return { ok: false, erro: "Nenhum CNPJ para consultar: cadastre em Empresa um CNPJ da mesma raiz do certificado." };
  }
  return {
    ok: true,
    cnpjs: consultaveis,
    config: { ambiente: fonte.ambiente, cUFAutor: fonte.cUFAutor, certificado: cert.certificado, caExtraPem: fonte.caExtraPem },
  };
}
