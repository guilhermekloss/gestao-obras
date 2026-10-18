import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SituacaoConfig } from "../config";

const db = vi.hoisted(() => ({
  documentoSefaz: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  cursorSefaz: { findUnique: vi.fn() },
  execucaoSefaz: { findMany: vi.fn(), count: vi.fn() },
  obra: { findMany: vi.fn() },
}));
const ler = vi.hoisted(() => vi.fn());
const situacao = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ storage: { ler } }));
vi.mock("../config", () => ({ carregarFonte: vi.fn(async () => ({})), situacaoDaConfig: () => situacao.atual }));

const {
  alertasDaCaptura,
  carregarAlertasDaCaptura,
  carregarPainel,
  contarRecebidas,
  estadoDoCursor,
  listarDocumentos,
  listarExecucoes,
  listarRecebidas,
  xmlDaRecebida,
} = await import("../painel");

const AGORA = new Date("2026-10-17T13:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const em = (ms: number) => new Date(AGORA.getTime() + ms);
const CNPJ = "11222333000181";

const base = {
  habilitado: true,
  validadeCertificado: null as Date | null,
  erroCertificado: null as string | null,
  cursores: [] as { cnpj: string; bloqueadoAte: Date | null; errosSeguidos: number }[],
  recebidasParadas: 0,
  paraAdmin: true,
};

const config = (extra: Partial<SituacaoConfig> = {}): SituacaoConfig => ({
  habilitado: true,
  ambiente: "PRODUCAO",
  frequencia: "DUAS_VEZES",
  certificado: null,
  erroCertificado: null,
  cnpjs: [CNPJ],
  foraDoCertificado: [],
  origem: "empresa",
  ...extra,
}) as SituacaoConfig;

beforeEach(() => {
  vi.clearAllMocks();
  situacao.atual = config();
  db.documentoSefaz.count.mockResolvedValue(0);
  db.cursorSefaz.findUnique.mockResolvedValue(null);
  db.execucaoSefaz.findMany.mockResolvedValue([]);
});

describe("estadoDoCursor: sem execução anterior", () => {
  it("cursor consultado e sem execução registrada está ativo", () => {
    expect(estadoDoCursor({ proximaConsultaEm: null, bloqueadoAte: null, ultimaConsultaEm: em(-DIA) }, null, AGORA)).toBe("ATIVO");
  });
});

describe("alertasDaCaptura: texto exato e limites", () => {
  it("uma NF-e parada: singular, com id e link", () => {
    expect(alertasDaCaptura({ ...base, recebidasParadas: 1 }, AGORA)).toEqual([
      {
        id: "nfe-recebida-parada",
        tipo: "NFE_RECEBIDA",
        severidade: "ATENCAO",
        mensagem: "1 NF-e recebida da Sefaz há mais de 7 dias sem lançar",
        link: "/notas/recebidas",
      },
    ]);
  });

  it("erro de configuração do certificado", () => {
    expect(alertasDaCaptura({ ...base, erroCertificado: "senha errada" }, AGORA)).toEqual([
      { id: "sefaz-cert", tipo: "SEFAZ_CERTIFICADO", severidade: "CRITICA", mensagem: "Captura de NF-e parada: senha errada", link: "/empresa" },
    ]);
  });

  it("certificado que vence agora já conta como vencido", () => {
    expect(alertasDaCaptura({ ...base, validadeCertificado: AGORA }, AGORA)).toEqual([
      {
        id: "sefaz-cert",
        tipo: "SEFAZ_CERTIFICADO",
        severidade: "CRITICA",
        mensagem: "Certificado A1 vencido: a captura de NF-e na Sefaz parou",
        link: "/empresa",
      },
    ]);
  });

  it("aviso de vencimento: 1 dia no singular, 30 dias ainda avisa, 31 não", () => {
    expect(alertasDaCaptura({ ...base, validadeCertificado: em(DIA) }, AGORA)).toEqual([
      {
        id: "sefaz-cert",
        tipo: "SEFAZ_CERTIFICADO",
        severidade: "ATENCAO",
        mensagem: "Certificado A1 vence em 1 dia: renove para a captura de NF-e não parar",
        link: "/empresa",
      },
    ]);
    expect(alertasDaCaptura({ ...base, validadeCertificado: em(30 * DIA) }, AGORA)).toHaveLength(1);
    expect(alertasDaCaptura({ ...base, validadeCertificado: em(31 * DIA) }, AGORA)).toEqual([]);
  });

  it("sem certificado e sem erro, nenhum alerta de certificado", () => {
    expect(alertasDaCaptura(base, AGORA)).toEqual([]);
  });

  it("bloqueio ativo e erros seguidos, com texto e link de cada um", () => {
    expect(
      alertasDaCaptura(
        {
          ...base,
          cursores: [
            { cnpj: "A", bloqueadoAte: em(1000), errosSeguidos: 0 },
            { cnpj: "B", bloqueadoAte: null, errosSeguidos: 3 },
          ],
        },
        AGORA,
      ),
    ).toEqual([
      { id: "sefaz-bloqueio-A", tipo: "SEFAZ_FALHA", severidade: "CRITICA", mensagem: "Sefaz bloqueou a consulta do CNPJ A por consumo indevido", link: "/sefaz" },
      { id: "sefaz-erros-B", tipo: "SEFAZ_FALHA", severidade: "CRITICA", mensagem: "Captura de NF-e do CNPJ B falhou 3 vezes seguidas", link: "/sefaz?aba=execucoes" },
    ]);
  });

  it("bloqueio vencido (ou terminando agora) não alerta", () => {
    const cursores = [
      { cnpj: "A", bloqueadoAte: em(-1000), errosSeguidos: 0 },
      { cnpj: "B", bloqueadoAte: AGORA, errosSeguidos: 0 },
    ];
    expect(alertasDaCaptura({ ...base, cursores }, AGORA)).toEqual([]);
  });
});

describe("carregarAlertasDaCaptura", () => {
  it("para o ADMIN carrega os cursores e junta certificado, caixa e bloqueio", async () => {
    situacao.atual = config({ certificado: { validoAte: em(10 * DIA) } as SituacaoConfig["certificado"] });
    db.documentoSefaz.count.mockResolvedValue(2);
    db.cursorSefaz.findUnique.mockResolvedValue({ cnpj: CNPJ, bloqueadoAte: em(DIA) });
    db.execucaoSefaz.findMany.mockResolvedValue([{ status: "ERRO" }, { status: "ERRO" }, { status: "ERRO" }]);
    const alertas = await carregarAlertasDaCaptura(true, AGORA);
    expect(alertas.map((a) => a.id)).toEqual(["nfe-recebida-parada", "sefaz-cert", `sefaz-bloqueio-${CNPJ}`]);
  });

  it("cursor ainda não criado entra sem bloqueio e com os erros contados", async () => {
    db.execucaoSefaz.findMany.mockResolvedValue([{ status: "ERRO" }, { status: "PULADA" }, { status: "ERRO" }, { status: "ERRO" }]);
    expect((await carregarAlertasDaCaptura(true, AGORA)).map((a) => a.id)).toEqual([`sefaz-erros-${CNPJ}`]);
  });

  it("para os demais, ou com a captura desligada, não consulta os cursores", async () => {
    db.documentoSefaz.count.mockResolvedValue(1);
    expect((await carregarAlertasDaCaptura(false, AGORA)).map((a) => a.id)).toEqual(["nfe-recebida-parada"]);
    situacao.atual = config({ habilitado: false });
    await carregarAlertasDaCaptura(true, AGORA);
    expect(db.cursorSefaz.findUnique).not.toHaveBeenCalled();
  });

  it("caixa conta só o que chegou há mais de 7 dias", async () => {
    await carregarAlertasDaCaptura(false, AGORA);
    expect(db.documentoSefaz.count.mock.calls[0][0]).toMatchObject({ where: { recebidoEm: { lt: em(-7 * DIA) } } });
  });
});

describe("carregarPainel", () => {
  it("devolve os contadores e o estado de cada CNPJ", async () => {
    db.cursorSefaz.findUnique.mockResolvedValue({ proximaConsultaEm: null, bloqueadoAte: null, ultimaConsultaEm: em(-DIA) });
    db.execucaoSefaz.findMany.mockResolvedValue([{ status: "PULADA" }, { status: "ERRO" }, { status: "SUCESSO" }]);
    for (const n of [1, 2, 3, 4, 5]) db.documentoSefaz.count.mockResolvedValueOnce(n);
    const painel = await carregarPainel(AGORA);
    expect(painel).toMatchObject({ docs24h: 1, docs7d: 2, aLancar: 3, aguardandoXml: 4, cienciasComErro: 5 });
    expect(painel.cnpjs).toEqual([
      {
        cnpj: CNPJ,
        cursor: { proximaConsultaEm: null, bloqueadoAte: null, ultimaConsultaEm: em(-DIA) },
        ultimaExecucao: { status: "ERRO" },
        errosSeguidos: 1,
        estado: "ERRO",
      },
    ]);
    expect(db.documentoSefaz.count.mock.calls.slice(0, 2).map((c) => c[0])).toEqual([
      { where: { recebidoEm: { gte: em(-DIA) } } },
      { where: { recebidoEm: { gte: em(-7 * DIA) } } },
    ]);
  });

  it("CNPJ só com execuções puladas fica sem última execução", async () => {
    db.execucaoSefaz.findMany.mockResolvedValue([{ status: "PULADA" }]);
    const painel = await carregarPainel(AGORA);
    expect(painel.cnpjs[0]).toMatchObject({ ultimaExecucao: null, errosSeguidos: 0, estado: "NUNCA" });
  });
});

describe("listas paginadas", () => {
  it("execuções: 30 por página, a partir da página pedida", async () => {
    db.execucaoSefaz.findMany.mockResolvedValue([{ id: "x" }]);
    db.execucaoSefaz.count.mockResolvedValue(31);
    expect(await listarExecucoes(2)).toEqual({ execucoes: [{ id: "x" }], total: 31 });
    expect(db.execucaoSefaz.findMany.mock.calls[0][0]).toMatchObject({ skip: 30, take: 30 });
  });

  it("documentos: filtro vai para a busca e para a contagem", async () => {
    db.documentoSefaz.findMany.mockResolvedValue([{ id: "d" }]);
    db.documentoSefaz.count.mockResolvedValue(1);
    expect(await listarDocumentos({ status: "NOVA" }, 3)).toEqual({ documentos: [{ id: "d" }], total: 1 });
    expect(db.documentoSefaz.findMany.mock.calls[0][0]).toMatchObject({ where: { status: "NOVA" }, skip: 60, take: 30 });
    expect(db.documentoSefaz.count).toHaveBeenCalledWith({ where: { status: "NOVA" } });
  });
});

describe("listarRecebidas", () => {
  it("liga cada nota às obras do CNO citado, numa consulta só", async () => {
    db.documentoSefaz.findMany.mockResolvedValue([
      { id: "1", cno: "CNO-A" },
      { id: "2", cno: null },
      { id: "3", cno: "CNO-A" },
    ]);
    db.obra.findMany.mockResolvedValue([
      { nome: "Casa A", cno: "CNO-A" },
      { nome: "Galpão", cno: "CNO-B" },
    ]);
    expect(await listarRecebidas()).toEqual([
      { id: "1", cno: "CNO-A", obrasDoCno: ["Casa A"] },
      { id: "2", cno: null, obrasDoCno: [] },
      { id: "3", cno: "CNO-A", obrasDoCno: ["Casa A"] },
    ]);
    expect(db.obra.findMany).toHaveBeenCalledTimes(1);
    expect(db.obra.findMany.mock.calls[0][0]).toMatchObject({ where: { cno: { in: ["CNO-A"] } } });
  });

  it("sem CNO nas notas, não consulta obras", async () => {
    db.documentoSefaz.findMany.mockResolvedValue([{ id: "1", cno: null }]);
    expect(await listarRecebidas()).toEqual([{ id: "1", cno: null, obrasDoCno: [] }]);
    expect(db.obra.findMany).not.toHaveBeenCalled();
  });
});

describe("contarRecebidas", () => {
  it("devolve a contagem do banco", async () => {
    db.documentoSefaz.count.mockResolvedValue(7);
    expect(await contarRecebidas()).toBe(7);
  });
});

describe("xmlDaRecebida", () => {
  const URL_OK = "/api/fotos/1700000000000-abcdef12.xml";
  const doc = (extra: object = {}) => ({ chave: "3526", xmlUrl: URL_OK, status: "NOVA", ...extra });

  it("devolve o XML guardado com o nome pela chave", async () => {
    db.documentoSefaz.findUnique.mockResolvedValue(doc());
    ler.mockResolvedValue(Buffer.from("<nfe/>", "utf8"));
    expect(await xmlDaRecebida("d1")).toEqual({ nome: "NFe3526.xml", xml: "<nfe/>" });
    expect(ler).toHaveBeenCalledWith("1700000000000-abcdef12.xml");
  });

  it.each([
    ["documento inexistente", null],
    ["sem XML guardado", doc({ xmlUrl: null })],
    ["URL fora do padrão", doc({ xmlUrl: "/outra/1700000000000-abcdef12.xml" })],
    ["já lançada", doc({ status: "LANCADA" })],
  ])("%s → null, sem ler o storage", async (_nome, registro) => {
    db.documentoSefaz.findUnique.mockResolvedValue(registro);
    expect(await xmlDaRecebida("d1")).toBeNull();
    expect(ler).not.toHaveBeenCalled();
  });

  it("arquivo sumido do storage → null", async () => {
    db.documentoSefaz.findUnique.mockResolvedValue(doc());
    ler.mockRejectedValue(new Error("not found"));
    expect(await xmlDaRecebida("d1")).toBeNull();
  });
});
