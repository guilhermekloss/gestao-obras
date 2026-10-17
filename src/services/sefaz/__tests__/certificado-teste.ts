import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Certificado autoassinado no formato do e-CNPJ ICP-Brasil (CN "RAZAO:CNPJ" e otherName 2.16.76.1.3.3).
// Gerado na hora pelo openssl: chave privada não fica no repositório.
export function gerarPemDeTeste(opcoes: { cnpj?: string; senha?: string; servidorLocal?: boolean } = {}): string {
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
        `CN=CONSTRUTORA TESTE LTDA:${cnpj}`,
        "[v3]",
        // servidorLocal: certificado de um servidor HTTPS falso em localhost (teste do TLS mútuo)
        opcoes.servidorLocal
          ? "subjectAltName=DNS:localhost,IP:127.0.0.1"
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
