import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Certificado autoassinado no formato do e-CNPJ ICP-Brasil (CN "RAZAO:CNPJ" e otherName 2.16.76.1.3.3).
// Gerado na hora pelo openssl: chave privada não fica no repositório.
export function gerarPemDeTeste(
  opcoes: { cnpj?: string; senha?: string; servidorLocal?: boolean; ecpf?: boolean } = {},
): string {
  const cnpj = opcoes.cnpj ?? "11222333000181";
  const dir = mkdtempSync(path.join(tmpdir(), "a1-teste-"));
  try {
    const cnf = path.join(dir, "req.cnf");
    writeFileSync(
      cnf,
      [
        "[req]",
        "distinguished_name=dn",
        "prompt=no",
        "x509_extensions=v3",
        "[dn]",
        "C=BR",
        "O=ICP-Brasil",
        // e-CPF: CN "NOME:CPF" e sem o OID do CNPJ
        opcoes.ecpf ? "CN=FULANO DE TAL:12345678909" : `CN=CONSTRUTORA TESTE LTDA:${cnpj}`,
        "[v3]",
        // servidorLocal: certificado de um servidor HTTPS falso em localhost (teste do TLS mútuo)
        opcoes.servidorLocal
          ? "subjectAltName=DNS:localhost,IP:127.0.0.1"
          : opcoes.ecpf
            ? "subjectAltName=otherName:2.16.76.1.3.1;PRINTABLESTRING:0101199012345678909"
            : `subjectAltName=otherName:2.16.76.1.3.3;PRINTABLESTRING:${cnpj}`,
        "basicConstraints=CA:FALSE",
      ].join("\n"),
    );
    const chave = path.join(dir, "chave.pem");
    const cert = path.join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-days", "365",
        "-keyout", chave, "-out", cert, "-config", cnf,
        ...(opcoes.senha ? ["-passout", `pass:${opcoes.senha}`] : ["-nodes"]),
      ],
      { stdio: "ignore" },
    );
    return readFileSync(chave, "utf8") + readFileSync(cert, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** .pfx do certificado de teste, como a Autoridade Certificadora entrega (legado = cifras RC2/3DES antigas). */
export function gerarPfxDeTeste(opcoes: { cnpj?: string; senha: string; legado?: boolean; ecpf?: boolean }): Buffer {
  const pem = gerarPemDeTeste({ cnpj: opcoes.cnpj, ecpf: opcoes.ecpf });
  const dir = mkdtempSync(path.join(tmpdir(), "pfx-teste-"));
  try {
    const entrada = path.join(dir, "a1.pem");
    const saida = path.join(dir, "a1.pfx");
    writeFileSync(entrada, pem);
    execFileSync(
      "openssl",
      ["pkcs12", "-export", "-in", entrada, "-out", saida, "-passout", `pass:${opcoes.senha}`, ...(opcoes.legado ? ["-legacy"] : [])],
      { stdio: "ignore" },
    );
    return readFileSync(saida);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
