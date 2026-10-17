import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import type { TLSSocket } from "node:tls";
import { ErroSefaz, postarSoap, type ConfigSefaz } from "../cliente";
import { lerCertificadoPem } from "../certificado";
import { lerRetornoDistribuicao } from "../xml";
import { gerarPemDeTeste } from "./certificado-teste";
import { retDist } from "./respostas";

// Servidor HTTPS local que, como a Sefaz, exige o certificado do cliente (TLS mútuo).
let servidor: Server;
let url: string;
let config: ConfigSefaz;
let ultimaRequisicao: { acao: string; corpo: string; cnClienteCert: string | undefined } | null = null;
let resposta: { status: number; corpo: string; atrasoMs?: number } = { status: 200, corpo: "" };

beforeAll(async () => {
  const pemServidor = gerarPemDeTeste({ servidorLocal: true });
  const pemCliente = gerarPemDeTeste();
  const certCliente = pemCliente.slice(pemCliente.indexOf("-----BEGIN CERTIFICATE-----"));
  const lido = lerCertificadoPem(pemCliente);
  if (!lido.ok) throw new Error(lido.erro);

  servidor = createServer(
    { key: pemServidor, cert: pemServidor, ca: certCliente, requestCert: true, rejectUnauthorized: true },
    (req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        const socket = req.socket as TLSSocket;
        ultimaRequisicao = {
          acao: req.headers["content-type"] ?? "",
          corpo: Buffer.concat(partes).toString("utf8"),
          cnClienteCert: socket.getPeerCertificate().subject?.CN as string | undefined,
        };
        setTimeout(() => {
          res.writeHead(resposta.status, { "Content-Type": "application/soap+xml" });
          res.end(resposta.corpo);
        }, resposta.atrasoMs ?? 0);
      });
    },
  );
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  url = `https://localhost:${(servidor.address() as AddressInfo).port}/NFeDistribuicaoDFe.asmx`;
  const certServidor = pemServidor.slice(pemServidor.indexOf("-----BEGIN CERTIFICATE-----"));
  config = { ambiente: "homologacao", cUFAutor: "41", certificado: lido.certificado, caExtraPem: certServidor };
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

describe("postarSoap (TLS mútuo)", () => {
  it("apresenta o certificado A1, manda a ação SOAP 1.2 e devolve o corpo", async () => {
    resposta = { status: 200, corpo: retDist({ cStat: "137", ultNSU: "1", maxNSU: "1" }) };
    const texto = await postarSoap(url, "urn:acao-teste", "<x/>", config);
    expect(lerRetornoDistribuicao(texto)).toMatchObject({ ok: true, retorno: { cStat: "137" } });
    expect(ultimaRequisicao).toEqual({
      acao: 'application/soap+xml; charset=utf-8; action="urn:acao-teste"',
      corpo: "<x/>",
      cnClienteCert: "CONSTRUTORA TESTE LTDA:11222333000181",
    });
  });

  it("HTTP 500 com Fault SOAP chega a quem lê a resposta", async () => {
    resposta = { status: 500, corpo: "<soap:Envelope><soap:Body><soap:Fault>x</soap:Fault></soap:Body></soap:Envelope>" };
    await expect(postarSoap(url, "a", "<x/>", config)).resolves.toContain("Fault");
  });

  it("outro status HTTP vira ErroSefaz", async () => {
    resposta = { status: 503, corpo: "fora do ar" };
    await expect(postarSoap(url, "a", "<x/>", config)).rejects.toThrow(new ErroSefaz("Sefaz respondeu HTTP 503."));
  });

  it("servidor com certificado desconhecido é recusado (sem a cadeia extra)", async () => {
    resposta = { status: 200, corpo: "ok" };
    await expect(postarSoap(url, "a", "<x/>", { ...config, caExtraPem: undefined })).rejects.toThrow(/Falha de conexão com a Sefaz/);
  });
});
