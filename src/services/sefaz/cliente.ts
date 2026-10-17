import { request, Agent } from "node:https";
import { rootCertificates } from "node:tls";
import type { CertificadoA1 } from "./certificado";
import { envEventoCiencia } from "./assinatura";
import {
  ACAO_DIST,
  ACAO_EVENTO,
  envelopeDistNsu,
  envelopeEvento,
  lerRetornoDistribuicao,
  lerRetornoEvento,
  type Ambiente,
  type ResultadoEvento,
  type RetornoDistribuicao,
} from "./xml";

// Endereços do Ambiente Nacional (Portal da NF-e). Servem a todas as UFs, inclusive o PR.
const URLS: Record<Ambiente, { distribuicao: string; evento: string }> = {
  producao: {
    distribuicao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    evento: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  },
  homologacao: {
    distribuicao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    evento: "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  },
};

const TIMEOUT_MS = 25_000;
const MAX_BYTES_RESPOSTA = 20 * 1024 * 1024;

export class ErroSefaz extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroSefaz";
  }
}

export type ConfigSefaz = {
  ambiente: Ambiente;
  /** UF de quem consulta (cUFAutor). 41 = Paraná. */
  cUFAutor: string;
  certificado: CertificadoA1;
  /** Cadeia ICP-Brasil extra, se a raiz do servidor da Sefaz não estiver na base do Node. */
  caExtraPem?: string;
};

function agente(config: ConfigSefaz): Agent {
  return new Agent({
    key: config.certificado.chavePrivada.export({ format: "pem", type: "pkcs8" }),
    cert: config.certificado.certificadosPem,
    ca: config.caExtraPem ? [...rootCertificates, config.caExtraPem] : undefined,
    minVersion: "TLSv1.2",
    keepAlive: false,
  });
}

export function postarSoap(url: string, acao: string, envelope: string, config: ConfigSefaz): Promise<string> {
  const corpo = Buffer.from(envelope, "utf8");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        agent: agente(config),
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${acao}"`,
          "Content-Length": corpo.length,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const partes: Buffer[] = [];
        let total = 0;
        res.on("data", (parte: Buffer) => {
          total += parte.length;
          if (total > MAX_BYTES_RESPOSTA) {
            req.destroy(new ErroSefaz("Resposta da Sefaz grande demais."));
            return;
          }
          partes.push(parte);
        });
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf8");
          // SOAP devolve falhas com HTTP 500 e um Fault no corpo: quem lê a resposta trata
          if (res.statusCode === 200 || (res.statusCode === 500 && texto.includes("Fault"))) resolve(texto);
          else reject(new ErroSefaz(`Sefaz respondeu HTTP ${res.statusCode ?? "?"}.`));
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new ErroSefaz(`Sefaz não respondeu em ${TIMEOUT_MS / 1000} s.`)));
    req.on("error", (e) => reject(e instanceof ErroSefaz ? e : new ErroSefaz(`Falha de conexão com a Sefaz: ${e.message}`)));
    req.end(corpo);
  });
}

/** O que o orquestrador precisa da Sefaz; nos testes entra uma versão falsa. */
export type ClienteSefaz = {
  distribuicaoPorNsu(cnpj: string, ultNsu: string): Promise<RetornoDistribuicao>;
  enviarCiencia(cnpj: string, chaves: string[], agora: Date): Promise<ResultadoEvento[]>;
};

export function clienteSefaz(config: ConfigSefaz): ClienteSefaz {
  const urls = URLS[config.ambiente];
  return {
    async distribuicaoPorNsu(cnpj, ultNsu) {
      const envelope = envelopeDistNsu({ ambiente: config.ambiente, cUFAutor: config.cUFAutor, cnpj, ultNsu });
      const lido = lerRetornoDistribuicao(await postarSoap(urls.distribuicao, ACAO_DIST, envelope, config));
      if (!lido.ok) throw new ErroSefaz(lido.erro);
      return lido.retorno;
    },
    async enviarCiencia(cnpj, chaves, agora) {
      const envEvento = envEventoCiencia(
        { chaves, cnpj, ambiente: config.ambiente, agora, idLote: String(agora.getTime()).slice(-15) },
        config.certificado,
      );
      const lido = lerRetornoEvento(await postarSoap(urls.evento, ACAO_EVENTO, envelopeEvento(envEvento), config));
      if (!lido.ok) throw new ErroSefaz(lido.erro);
      // 128 = lote processado; outro código recusa o lote inteiro e vale para todas as notas
      if (lido.cStat !== "128") return chaves.map((chave) => ({ chave, cStat: lido.cStat, xMotivo: lido.xMotivo }));
      return lido.eventos;
    },
  };
}
