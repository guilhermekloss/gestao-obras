import { EventEmitter } from "node:events";
import type { Agent, RequestOptions } from "node:https";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lerCertificadoPem } from "../certificado";
import type { ConfigSefaz } from "../cliente";
import { gerarPemDeTeste } from "./certificado-teste";
import { CHAVE_FIXTURE, CNPJ_EMPRESA, retDist, retEvento } from "./respostas";

// `request` falso: grava o que foi enviado e responde com o roteiro de cada teste.
type Resposta = EventEmitter & { statusCode?: number };
type Requisicao = EventEmitter & { destroy(erro: Error): void; end(corpo: Buffer): void };
type Roteiro = (req: Requisicao, res: Resposta, responder: () => void) => void;

const envios: { url: string; opcoes: RequestOptions; corpo: string }[] = [];
let roteiro: Roteiro;

const responderCom = (statusCode: number | undefined, ...partes: (string | Buffer)[]): Roteiro => (_req, res, responder) => {
  res.statusCode = statusCode;
  responder();
  for (const p of partes) res.emit("data", Buffer.isBuffer(p) ? p : Buffer.from(p, "utf8"));
  res.emit("end");
};

vi.mock("node:https", async (original) => ({
  ...(await original<typeof import("node:https")>()),
  request: (url: string, opcoes: RequestOptions, aoResponder: (res: Resposta) => void) => {
    const req = new EventEmitter() as Requisicao;
    req.destroy = (erro) => req.emit("error", erro);
    req.end = (corpo) => {
      envios.push({ url, opcoes, corpo: corpo.toString("utf8") });
      const res = new EventEmitter() as Resposta;
      queueMicrotask(() => roteiro(req, res, () => aoResponder(res)));
    };
    return req;
  },
}));

const { ErroSefaz, clienteSefaz, postarSoap } = await import("../cliente");

let config: ConfigSefaz;
beforeAll(() => {
  const lido = lerCertificadoPem(gerarPemDeTeste());
  if (!lido.ok) throw new Error(lido.erro);
  config = { ambiente: "homologacao", cUFAutor: "41", certificado: lido.certificado };
});
beforeEach(() => {
  envios.length = 0;
});

const MB20 = 20 * 1024 * 1024;

describe("ErroSefaz", () => {
  it("tem nome próprio", () => {
    expect(new ErroSefaz("x").name).toBe("ErroSefaz");
  });
});

describe("postarSoap: requisição e respostas", () => {
  it("POST com agente TLS sem keep-alive", async () => {
    roteiro = responderCom(200, "ok");
    expect(await postarSoap("https://sefaz.teste/ws", "urn:a", "<x/>", config)).toBe("ok");
    const { opcoes } = envios[0];
    expect(opcoes.method).toBe("POST");
    expect((opcoes.agent as Agent).options).toMatchObject({ keepAlive: false, minVersion: "TLSv1.2" });
  });

  it("resposta de exatamente 20 MB passa; um byte a mais derruba a requisição", async () => {
    roteiro = responderCom(200, Buffer.alloc(MB20 / 2, "a"), Buffer.alloc(MB20 / 2, "a"));
    expect((await postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).length).toBe(MB20);

    roteiro = responderCom(200, Buffer.alloc(MB20, "a"), "b");
    await expect(postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).rejects.toThrow(new ErroSefaz("Resposta da Sefaz grande demais."));
  });

  it("Fault só é aceito com HTTP 500", async () => {
    roteiro = responderCom(404, "<soap:Fault>x</soap:Fault>");
    await expect(postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).rejects.toThrow(new ErroSefaz("Sefaz respondeu HTTP 404."));
  });

  it("HTTP 500 sem Fault é erro; sem status vira '?'", async () => {
    roteiro = responderCom(500, "erro interno");
    await expect(postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).rejects.toThrow(new ErroSefaz("Sefaz respondeu HTTP 500."));
    roteiro = responderCom(undefined, "");
    await expect(postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).rejects.toThrow(new ErroSefaz("Sefaz respondeu HTTP ?."));
  });

  it("tempo esgotado vira ErroSefaz com os segundos", async () => {
    roteiro = (req) => req.emit("timeout");
    await expect(postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).rejects.toThrow(new ErroSefaz("Sefaz não respondeu em 25 s."));
  });

  it("erro no meio da resposta rejeita", async () => {
    roteiro = (_req, res, responder) => {
      responder();
      res.emit("error", new Error("conexão caiu"));
    };
    await expect(postarSoap("https://sefaz.teste/ws", "a", "<x/>", config)).rejects.toThrow("conexão caiu");
  });
});

describe("clienteSefaz", () => {
  it("distribuição: posta no endereço do ambiente com a ação da distribuição", async () => {
    roteiro = responderCom(200, retDist({ cStat: "137", xMotivo: "Nenhum documento localizado", ultNSU: "000000000000009", maxNSU: "000000000000009" }));
    const retorno = await clienteSefaz(config).distribuicaoPorNsu(CNPJ_EMPRESA, "000000000000005");
    expect(retorno).toMatchObject({ cStat: "137", ultNsu: "000000000000009", maxNsu: "000000000000009", docs: [] });
    expect(envios[0].url).toBe("https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx");
    expect(String((envios[0].opcoes.headers as Record<string, unknown>)["Content-Type"])).toContain("nfeDistDFeInteresse");
    expect(envios[0].corpo).toContain("<ultNSU>000000000000005</ultNSU>");
    expect(envios[0].corpo).toContain(`<CNPJ>${CNPJ_EMPRESA}</CNPJ>`);
  });

  it("distribuição ilegível vira ErroSefaz", async () => {
    roteiro = responderCom(200, "não é xml");
    await expect(clienteSefaz(config).distribuicaoPorNsu(CNPJ_EMPRESA, "0")).rejects.toBeInstanceOf(ErroSefaz);
  });

  it("Ciência: lote processado devolve o resultado de cada nota", async () => {
    roteiro = responderCom(200, retEvento({ eventos: [{ chave: CHAVE_FIXTURE, cStat: "135" }] }));
    const agora = new Date("2026-10-17T13:00:00Z");
    const r = await clienteSefaz(config).enviarCiencia(CNPJ_EMPRESA, [CHAVE_FIXTURE], agora);
    expect(r).toEqual([{ chave: CHAVE_FIXTURE, cStat: "135", xMotivo: "Evento registrado e vinculado a NF-e" }]);
    expect(envios[0].url).toBe("https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx");
    expect(envios[0].corpo).toContain(`<idLote>${agora.getTime()}</idLote>`);
  });

  it("Ciência: lote recusado vale para todas as notas", async () => {
    const outra = CHAVE_FIXTURE.slice(0, -1) + "9";
    roteiro = responderCom(200, retEvento({ cStatLote: "489", eventos: [] }));
    const r = await clienteSefaz(config).enviarCiencia(CNPJ_EMPRESA, [CHAVE_FIXTURE, outra], new Date());
    expect(r).toEqual([
      { chave: CHAVE_FIXTURE, cStat: "489", xMotivo: "Lote de evento processado" },
      { chave: outra, cStat: "489", xMotivo: "Lote de evento processado" },
    ]);
  });

  it("Ciência ilegível vira ErroSefaz", async () => {
    roteiro = responderCom(200, "<x/>");
    await expect(clienteSefaz(config).enviarCiencia(CNPJ_EMPRESA, [CHAVE_FIXTURE], new Date())).rejects.toBeInstanceOf(ErroSefaz);
  });
});
