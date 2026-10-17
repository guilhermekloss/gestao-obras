import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { lerCertificadoPem } from "./certificado";
import { normalizarCnpj } from "./xml";

// O A1 chega como .pfx/.p12 (PKCS#12). O Node não lê PKCS#12; o openssl da imagem (Dockerfile) converte para
// PEM, sem biblioteca extra. A senha vai por variável de ambiente do processo filho, nunca na linha de comando.

const exec = promisify(execFile);
export const MAX_BYTES_PFX = 64 * 1024;

async function converter(arquivo: string, senha: string, legado: boolean): Promise<string> {
  const { stdout } = await exec(
    "openssl",
    ["pkcs12", "-in", arquivo, "-nodes", "-passin", "env:SENHA_PFX", ...(legado ? ["-legacy"] : [])],
    { env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "/usr/bin:/bin", SENHA_PFX: senha }, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 },
  );
  return stdout;
}

export async function pfxParaPem(pfx: Buffer, senha: string): Promise<{ ok: true; pem: string } | { ok: false; erro: string }> {
  if (pfx.length === 0 || pfx.length > MAX_BYTES_PFX) return { ok: false, erro: "Arquivo do certificado vazio ou grande demais." };
  const dir = await mkdtemp(path.join(tmpdir(), "pfx-"));
  const arquivo = path.join(dir, "a1.pfx");
  try {
    await writeFile(arquivo, pfx, { mode: 0o600 });
    // a maioria dos .pfx de AC brasileira usa cifras antigas (RC2/3DES), que o OpenSSL 3 só abre com -legacy
    for (const legado of [false, true]) {
      try {
        const pem = await converter(arquivo, senha, legado);
        if (pem.includes("PRIVATE KEY") && pem.includes("CERTIFICATE")) return { ok: true, pem };
      } catch {
        // tenta o próximo modo; a mensagem do openssl não vai ao usuário (pode citar o caminho do arquivo)
      }
    }
    return { ok: false, erro: "Não foi possível abrir o certificado: confira a senha e se o arquivo é o .pfx/.p12 do A1." };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type CertificadoPreparado = {
  pem: string;
  titular: string;
  cnpj: string | null;
  validoAte: Date;
};

/** Converte, confere validade e se o certificado é da empresa (mesma raiz de CNPJ). Não grava nada. */
export async function prepararCertificado(
  pfx: Buffer,
  senha: string,
  cnpjEmpresa: string,
  agora: Date = new Date(),
): Promise<{ ok: true; certificado: CertificadoPreparado } | { ok: false; erro: string }> {
  const convertido = await pfxParaPem(pfx, senha);
  if (!convertido.ok) return convertido;
  const lido = lerCertificadoPem(convertido.pem);
  if (!lido.ok) return lido;
  const c = lido.certificado;
  if (c.validoAte <= agora) return { ok: false, erro: `Este certificado venceu em ${c.validoAte.toLocaleDateString("pt-BR")}.` };
  if (c.validoDesde > agora) return { ok: false, erro: "Este certificado ainda não está valendo." };
  if (c.cnpj && c.cnpj.slice(0, 8) !== normalizarCnpj(cnpjEmpresa).slice(0, 8)) {
    return { ok: false, erro: `Este certificado é do CNPJ ${c.cnpj}, de outra empresa. A Sefaz só aceita o certificado da própria empresa (mesma raiz de CNPJ).` };
  }
  return { ok: true, certificado: { pem: convertido.pem, titular: c.titular, cnpj: c.cnpj, validoAte: c.validoAte } };
}
