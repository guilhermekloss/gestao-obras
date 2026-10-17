import { X509Certificate, createPrivateKey, type KeyObject } from "node:crypto";
import { normalizarCnpj } from "./xml";

// Certificado A1 (e-CNPJ ICP-Brasil) da empresa, em PEM: chave privada + certificado (+ cadeia, opcional).
// Vem cifrado do cadastro da empresa (convertido do .pfx em pfx.ts) ou da variável SEFAZ_CERT_PEM: o Node lê PEM nativamente,
// sem biblioteca de PKCS#12.

/** Variáveis de ambiente (process.env ou um objeto, nos testes). */
export type Env = Record<string, string | undefined>;

export type CertificadoA1 = {
  chavePrivada: KeyObject;
  /** Certificado do titular seguido da cadeia, em PEM: é o que vai no TLS. */
  certificadosPem: string;
  /** DER do certificado do titular, em base64: vai na assinatura do evento. */
  certificadoBase64: string;
  titular: string;
  cnpj: string | null;
  emissor: string;
  validoDesde: Date;
  validoAte: Date;
};

export type InfoCertificado = Omit<CertificadoA1, "chavePrivada" | "certificadosPem" | "certificadoBase64">;

const BLOCO_CERTIFICADO = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
const BLOCO_CHAVE = /-----BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |ENCRYPTED )?PRIVATE KEY-----/;

// OID 2.16.76.1.3.3 (CNPJ do titular no e-CNPJ, dentro do otherName do subjectAltName), codificado em DER
const OID_CNPJ_ICP = Buffer.from([0x06, 0x05, 0x60, 0x4c, 0x01, 0x03, 0x03]);

export function cnpjDoCertificado(cert: X509Certificate): string | null {
  const der = cert.raw;
  const pos = der.indexOf(OID_CNPJ_ICP);
  if (pos >= 0) {
    // logo depois do OID vem [0] { OCTET STRING | PrintableString } com os 14 caracteres
    const trecho = der.subarray(pos + OID_CNPJ_ICP.length, pos + OID_CNPJ_ICP.length + 32).toString("latin1");
    const m = /[0-9A-Z]{12}\d{2}/.exec(trecho);
    if (m) return m[0];
  }
  // padrão ICP-Brasil para o CN: "RAZAO SOCIAL:CNPJ"
  const cn = /CN=([^\n]+)/.exec(cert.subject)?.[1] ?? "";
  const doCn = /:([0-9A-Z]{12}\d{2})\b/.exec(cn);
  return doCn ? doCn[1] : null;
}

function campoDoNome(nome: string, campo: string): string | null {
  return new RegExp(`(?:^|\\n)${campo}=([^\\n]+)`).exec(nome)?.[1]?.trim() ?? null;
}

export function lerCertificadoPem(
  pem: string,
  senha?: string,
): { ok: true; certificado: CertificadoA1 } | { ok: false; erro: string } {
  const textoChave = BLOCO_CHAVE.exec(pem)?.[0];
  const blocos = pem.match(BLOCO_CERTIFICADO) ?? [];
  if (!textoChave || blocos.length === 0) {
    return { ok: false, erro: "O certificado precisa ter a chave privada e o certificado." };
  }

  let chavePrivada: KeyObject;
  try {
    chavePrivada = createPrivateKey(senha ? { key: textoChave, passphrase: senha } : textoChave);
  } catch {
    return { ok: false, erro: "Não foi possível abrir a chave privada do certificado (senha errada ou formato inválido)." };
  }

  const certificados = blocos.map((b) => new X509Certificate(b));
  const indiceTitular = certificados.findIndex((c) => c.checkPrivateKey(chavePrivada));
  if (indiceTitular < 0) return { ok: false, erro: "Nenhum certificado do PEM corresponde à chave privada." };
  const titular = certificados[indiceTitular];
  const cadeia = [blocos[indiceTitular], ...blocos.filter((_, i) => i !== indiceTitular)];

  return {
    ok: true,
    certificado: {
      chavePrivada,
      certificadosPem: cadeia.join("\n"),
      certificadoBase64: titular.raw.toString("base64"),
      titular: campoDoNome(titular.subject, "CN") ?? titular.subject,
      cnpj: cnpjDoCertificado(titular),
      emissor: campoDoNome(titular.issuer, "CN") ?? titular.issuer,
      validoDesde: new Date(titular.validFrom),
      validoAte: new Date(titular.validTo),
    },
  };
}

export function infoDoCertificado(c: CertificadoA1): InfoCertificado {
  return { titular: c.titular, cnpj: c.cnpj, emissor: c.emissor, validoDesde: c.validoDesde, validoAte: c.validoAte };
}

let emCache: { pem: string; resultado: ReturnType<typeof lerCertificadoPem> } | null = null;

/** Lido do ambiente uma vez por instância (a versão nova do secret entra no próximo deploy/reinício). */
export function carregarCertificado(
  env: Env = process.env,
): ReturnType<typeof lerCertificadoPem> | { ok: false; erro: string; ausente: true } {
  const pem = env.SEFAZ_CERT_PEM?.replace(/\\n/g, "\n");
  if (!pem?.trim()) return { ok: false, erro: "Certificado A1 não configurado (SEFAZ_CERT_PEM).", ausente: true };
  if (emCache?.pem !== pem) emCache = { pem, resultado: lerCertificadoPem(pem, env.SEFAZ_CERT_SENHA || undefined) };
  return emCache.resultado;
}

/** Só CNPJs da mesma raiz do certificado podem ser consultados: a Sefaz autentica pelos 8 primeiros caracteres. */
export function cnpjsConsultaveis(cnpjsEmpresa: string[], cnpjCertificado: string | null): {
  consultaveis: string[];
  foraDoCertificado: string[];
} {
  const lista = [...new Set(cnpjsEmpresa.map(normalizarCnpj).filter((c) => c.length === 14))];
  if (!cnpjCertificado) return { consultaveis: lista, foraDoCertificado: [] };
  const base = lista.length > 0 ? lista : [cnpjCertificado];
  const raiz = cnpjCertificado.slice(0, 8);
  return {
    consultaveis: base.filter((c) => c.slice(0, 8) === raiz),
    foraDoCertificado: base.filter((c) => c.slice(0, 8) !== raiz),
  };
}
