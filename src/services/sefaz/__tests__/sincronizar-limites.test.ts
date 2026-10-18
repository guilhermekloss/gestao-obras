import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { DURACAO_TRAVA_MS, MAX_CIENCIAS_POR_EXECUCAO } from "../regras";
import { AGORA, banco, clienteFalso, ctx, doc, limparBanco, prisma, registrarAtividade, storage } from "./banco-falso";
import { CHAVE_FIXTURE, CNPJ_EMPRESA, procNfeFixture, resEventoCancelamento, resNfe } from "./respostas";

const montarConfig = vi.hoisted(() => vi.fn());
const clienteSefaz = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./banco-falso")).prisma }));
vi.mock("@/lib/storage", async () => ({ storage: (await import("./banco-falso")).storage }));
vi.mock("@/lib/atividade", async () => ({ registrarAtividade: (await import("./banco-falso")).registrarAtividade }));
vi.mock("../config", () => ({ carregarFonte: vi.fn(async () => ({})), montarConfig }));
vi.mock("../cliente", async (original) => ({ ...(await original<typeof import("../cliente")>()), clienteSefaz }));

const { gravarDocumento, manifestarPendentes, nomeDoXmlGuardado, reenviarCiencia, sincronizar, sincronizarCnpj } = await import(
  "../sincronizar"
);
const { ErroSefaz } = await import("../cliente");
const { classificarDocumento } = await import("../xml");

const outraChave = (fim: string) => CHAVE_FIXTURE.slice(0, -1) + fim;
const NSU = (n: number) => String(n).padStart(15, "0");
const resumo = (xml = resNfe()) => classificarDocumento(doc("1", "resNFe_v1.01.xsd", xml));
const completo = () => classificarDocumento(doc("2", "procNFe_v4.00.xsd", procNfeFixture()));
const fimDaFila = (xMotivo = "Nenhum documento localizado") => ({ cStat: "137", xMotivo, ultNsu: NSU(0), maxNsu: NSU(0), docs: [] });
const pendente = (id: string, chave: string, extra: Record<string, unknown> = {}) => ({
  id,
  chave,
  cnpjDestinatario: CNPJ_EMPRESA,
  situacao: "RESUMO",
  manifestacao: "PENDENTE",
  ...extra,
});

let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  limparBanco();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

describe("nomeDoXmlGuardado", () => {
  it("só aceita a URL de XML guardado pelo próprio app", () => {
    expect(nomeDoXmlGuardado("/api/fotos/1760000000000-abcdef12.xml")).toBe("1760000000000-abcdef12.xml");
    expect(nomeDoXmlGuardado("/api/fotos/foto.jpg")).toBeNull();
    expect(nomeDoXmlGuardado("")).toBeNull();
    expect(nomeDoXmlGuardado(null)).toBeNull();
  });
});

describe("gravarDocumento: limites", () => {
  it("documento ignorado não toca no banco", async () => {
    expect(await gravarDocumento(classificarDocumento(doc("9", "outro_v1.00.xsd", "<x/>")), CNPJ_EMPRESA)).toBe("IGNORADO");
    expect(prisma.documentoSefaz.findUnique).not.toHaveBeenCalled();
  });

  it("cancelamento de nota que não está no banco é ignorado", async () => {
    expect(await gravarDocumento(classificarDocumento(doc("3", "resEvento_v1.01.xsd", resEventoCancelamento())), CNPJ_EMPRESA)).toBe("IGNORADO");
  });

  it("emitente com CPF de mesmo começo da raiz da empresa ainda é compra", async () => {
    const xml = resNfe().replace("<CNPJ>98765432000110</CNPJ>", "<CPF>11222333096</CPF>");
    expect(await gravarDocumento(resumo(xml), CNPJ_EMPRESA)).toBe("NOVO");
  });

  it("resumo novo grava a emissão ao meio-dia UTC do dia", async () => {
    await gravarDocumento(resumo(), CNPJ_EMPRESA);
    expect(banco.documentos[0].dataEmissao).toEqual(new Date("2026-09-02T12:00:00Z"));
  });

  it("resumo de cancelamento sobre um resumo pendente cancela e dispensa a Ciência", async () => {
    await gravarDocumento(resumo(), CNPJ_EMPRESA);
    expect(await gravarDocumento(resumo(resNfe({ cSit: "3" })), CNPJ_EMPRESA)).toBe("ATUALIZADO");
    expect(banco.documentos[0]).toMatchObject({ situacao: "CANCELADA", manifestacao: "DISPENSADA" });
  });

  it("cancelamento depois da Ciência mantém a manifestação registrada", async () => {
    banco.documentos.push({ id: "d1", chave: CHAVE_FIXTURE, situacao: "RESUMO", manifestacao: "CIENCIA_ENVIADA", xmlUrl: null });
    expect(await gravarDocumento(resumo(resNfe({ cSit: "3" })), CNPJ_EMPRESA)).toBe("ATUALIZADO");
    expect(banco.documentos[0]).toMatchObject({ situacao: "CANCELADA", manifestacao: "CIENCIA_ENVIADA" });
  });

  it("resumo cancelado repetido não regrava", async () => {
    banco.documentos.push({ id: "d1", chave: CHAVE_FIXTURE, situacao: "CANCELADA", manifestacao: "DISPENSADA", xmlUrl: null });
    expect(await gravarDocumento(resumo(resNfe({ cSit: "3" })), CNPJ_EMPRESA)).toBe("IGNORADO");
    expect(prisma.documentoSefaz.update).not.toHaveBeenCalled();
  });

  it("completo novo: guarda o XML, dispensa a Ciência e entra como NOVA", async () => {
    expect(await gravarDocumento(completo(), CNPJ_EMPRESA)).toBe("NOVO");
    expect(storage.salvar).toHaveBeenCalledWith(Buffer.from(procNfeFixture(), "utf8"), "xml");
    expect(banco.documentos[0]).toMatchObject({ situacao: "COMPLETO", manifestacao: "DISPENSADA", status: "NOVA" });
  });

  it("completo de nota já lançada entra como LANCADA", async () => {
    banco.notas.push({ id: "nota1", chaveNfe: CHAVE_FIXTURE });
    await gravarDocumento(completo(), CNPJ_EMPRESA);
    expect(banco.documentos[0]).toMatchObject({ status: "LANCADA", notaFiscalId: "nota1" });
  });

  it("completo sobre resumo cancelado continua cancelado; Ciência já enviada fica registrada", async () => {
    banco.documentos.push({ id: "d1", chave: CHAVE_FIXTURE, situacao: "CANCELADA", manifestacao: "CIENCIA_ENVIADA", xmlUrl: null });
    expect(await gravarDocumento(completo(), CNPJ_EMPRESA)).toBe("ATUALIZADO");
    expect(banco.documentos[0]).toMatchObject({ situacao: "CANCELADA", manifestacao: "CIENCIA_ENVIADA", manifestacaoErro: null });
  });

  it("se o banco recusar e o XML não tiver nome conhecido, não tenta apagar", async () => {
    storage.salvar.mockResolvedValueOnce("/outro/lugar.xml");
    prisma.documentoSefaz.create.mockRejectedValueOnce(new Error("falhou"));
    await expect(gravarDocumento(completo(), CNPJ_EMPRESA)).rejects.toThrow("falhou");
    expect(storage.excluir).not.toHaveBeenCalled();
  });
});

describe("manifestarPendentes: limites", () => {
  const CHAVE_2 = outraChave("2");

  it("sem pendentes não chama a Sefaz", async () => {
    const cliente = clienteFalso([]);
    expect(await manifestarPendentes(CNPJ_EMPRESA, cliente, AGORA)).toEqual({ enviadas: 0, erros: 0 });
    expect(cliente.enviarCiencia).not.toHaveBeenCalled();
  });

  it("falha de transporte deixa tudo pendente e devolve o motivo", async () => {
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE));
    const falha = clienteFalso([], async () => {
      throw new Error("Sefaz não respondeu em 25 s.");
    });
    expect(await manifestarPendentes(CNPJ_EMPRESA, falha, AGORA)).toEqual({ enviadas: 0, erros: 0, mensagem: "Sefaz não respondeu em 25 s." });
    expect(banco.documentos[0].manifestacao).toBe("PENDENTE");

    const estranha = clienteFalso([], async () => {
      throw "?";
    });
    expect(await manifestarPendentes(CNPJ_EMPRESA, estranha, AGORA)).toMatchObject({ mensagem: "Falha ao enviar a Ciência" });
  });

  it("nota sem retorno vira erro; motivo longo é cortado em 500", async () => {
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE), pendente("d2", CHAVE_2));
    const cliente = clienteFalso([], async () => [{ chave: CHAVE_2, cStat: "999", xMotivo: "x".repeat(600) }]);
    expect(await manifestarPendentes(CNPJ_EMPRESA, cliente, AGORA)).toEqual({ enviadas: 0, erros: 2 });
    expect(banco.documentos[0]).toMatchObject({ manifestacao: "ERRO", manifestacaoErro: "Sem retorno da Sefaz para esta nota" });
    expect(banco.documentos[1].manifestacaoErro).toBe(`999 – ${"x".repeat(494)}`);
  });

  it("no reenvio, pega só os ids pedidos, inclusive os que deram erro", async () => {
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE, { manifestacao: "ERRO" }), pendente("d2", CHAVE_2));
    const cliente = clienteFalso([]);
    expect(await manifestarPendentes(CNPJ_EMPRESA, cliente, AGORA, ["d1"])).toEqual({ enviadas: 1, erros: 0 });
    expect(cliente.enviarCiencia).toHaveBeenCalledWith(CNPJ_EMPRESA, [CHAVE_FIXTURE], AGORA);
    expect(prisma.documentoSefaz.findMany.mock.calls[0][0]).toMatchObject({ take: MAX_CIENCIAS_POR_EXECUCAO });
  });
});

describe("sincronizarCnpj: limites", () => {
  it("pega a trava pelo tempo da execução e a solta no fim", async () => {
    await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([fimDaFila()])));
    expect(prisma.cursorSefaz.updateMany.mock.calls[0][0]).toMatchObject({ data: { travadoAte: new Date(AGORA.getTime() + DURACAO_TRAVA_MS) } });
    expect(banco.cursores.get(CNPJ_EMPRESA)!.travadoAte).toBeNull();
  });

  it("fora da janela: explica até que horas espera", async () => {
    banco.cursores.set(CNPJ_EMPRESA, {
      cnpj: CNPJ_EMPRESA,
      ultNsu: NSU(5),
      proximaConsultaEm: new Date("2026-10-17T13:45:00Z"),
      bloqueadoAte: null,
      travadoAte: null,
    });
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([]), "MANUAL"));
    expect(r).toEqual({ cnpj: CNPJ_EMPRESA, status: "PULADA", mensagem: "Aguardando a janela da Sefaz: a próxima consulta é às 10:45.", docsNovos: 0, ciencias: 0 });
  });

  it("rejeição da Sefaz vira ERRO, com o evento de log para o alerta", async () => {
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([{ cStat: "215", xMotivo: "Rejeição", ultNsu: NSU(0), maxNsu: NSU(0), docs: [] }])));
    expect(r.status).toBe("ERRO");
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({ severity: "ERROR", categoria: "sefaz", evento: "sefaz_captura_falhou", cnpj: CNPJ_EMPRESA, cStat: "215" }),
    );
  });

  it("rejeição depois de um lote com nota nova continua ERRO", async () => {
    const lote = { cStat: "138", xMotivo: "ok", ultNsu: NSU(1), maxNsu: NSU(5), docs: [doc(NSU(1), "resNFe_v1.01.xsd", resNfe())] };
    const rejeicao = { cStat: "215", xMotivo: "Rejeição", ultNsu: NSU(0), maxNsu: NSU(0), docs: [] };
    expect(await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([lote, rejeicao])))).toMatchObject({ status: "ERRO", docsNovos: 1 });
  });

  it("bloqueio registra o evento sefaz_bloqueada", async () => {
    await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([{ cStat: "656", xMotivo: "Consumo Indevido", ultNsu: NSU(0), maxNsu: NSU(0), docs: [] }])));
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({ severity: "ERROR", categoria: "sefaz", evento: "sefaz_bloqueada", cnpj: CNPJ_EMPRESA, cStat: "656" }),
    );
  });

  it("consulta sem novidade não loga erro nem registra atividade", async () => {
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([fimDaFila()])));
    expect(r).toEqual({ cnpj: CNPJ_EMPRESA, status: "SEM_NOVIDADES", mensagem: "Nenhum documento localizado", docsNovos: 0, ciencias: 0 });
    expect(consoleError).not.toHaveBeenCalled();
    expect(registrarAtividade).not.toHaveBeenCalled();
  });

  it("só Ciência enviada, sem nota nova, já é SUCESSO", async () => {
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE));
    expect(await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([fimDaFila()])))).toMatchObject({ status: "SUCESSO", ciencias: 1 });
  });

  it("nota nova sem Ciência a enviar também é SUCESSO, com a atividade no singular", async () => {
    const lote = { cStat: "137", xMotivo: "ok", ultNsu: NSU(1), maxNsu: NSU(1), docs: [doc(NSU(1), "procNFe_v4.00.xsd", procNfeFixture())] };
    expect(await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([lote])))).toMatchObject({ status: "SUCESSO", docsNovos: 1, ciencias: 0 });
    expect(registrarAtividade).toHaveBeenCalledWith(null, "sefaz.captura", { descricao: "Sefaz: 1 NF-e nova para o CNPJ 11.222.333/0001-81" });
  });

  it("duas notas novas: atividade no plural", async () => {
    const lote = {
      cStat: "137",
      xMotivo: "ok",
      ultNsu: NSU(2),
      maxNsu: NSU(2),
      docs: [doc(NSU(1), "resNFe_v1.01.xsd", resNfe()), doc(NSU(2), "resNFe_v1.01.xsd", resNfe({ chave: outraChave("2") }))],
    };
    await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([lote], async () => [])));
    expect(registrarAtividade).toHaveBeenCalledWith(null, "sefaz.captura", { descricao: "Sefaz: 2 NF-e novas para o CNPJ 11.222.333/0001-81" });
  });

  it("Ciência que não saiu ou foi recusada entra na mensagem", async () => {
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE));
    const falha = clienteFalso([fimDaFila("Fila vazia")], async () => {
      throw new Error("timeout");
    });
    expect((await sincronizarCnpj(CNPJ_EMPRESA, ctx(falha))).mensagem).toBe("Fila vazia · Ciência não enviada: timeout");

    limparBanco();
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE));
    const recusa = clienteFalso([fimDaFila("Fila vazia")], async (_c, chaves) => chaves.map((chave) => ({ chave, cStat: "999", xMotivo: "não" })));
    expect((await sincronizarCnpj(CNPJ_EMPRESA, ctx(recusa))).mensagem).toBe("Fila vazia · 1 Ciência(s) recusada(s)");
  });

  it("motivo longo: 500 caracteres no cursor e 1000 no histórico", async () => {
    await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([fimDaFila("m".repeat(1200))])));
    expect(banco.cursores.get(CNPJ_EMPRESA)!.ultimoMotivo).toBe("m".repeat(500));
    expect(banco.execucoes[0].mensagem).toBe("m".repeat(1000));
  });

  it("a duração é o tempo entre o início e o fim", async () => {
    let t = AGORA.getTime();
    const relogio = () => new Date((t += 1000));
    await sincronizarCnpj(CNPJ_EMPRESA, { ...ctx(clienteFalso([fimDaFila()])), agora: relogio });
    const exec = banco.execucoes[0] as { iniciadaEm: Date; finalizadaEm: Date; duracaoMs: number };
    expect(exec.duracaoMs).toBe(exec.finalizadaEm.getTime() - exec.iniciadaEm.getTime());
    expect(exec.duracaoMs).toBeGreaterThan(0);
  });

  it("erro inesperado vai para o log com o CNPJ; ErroSefaz não", async () => {
    const quebra = (erro: unknown) => ({ distribuicaoPorNsu: vi.fn().mockRejectedValue(erro), enviarCiencia: vi.fn() });
    expect(await sincronizarCnpj(CNPJ_EMPRESA, ctx(quebra(new TypeError("x is undefined"))))).toMatchObject({ status: "ERRO", mensagem: "x is undefined" });
    expect(consoleError).toHaveBeenCalledWith(`Captura Sefaz: erro inesperado (${CNPJ_EMPRESA})`, expect.any(TypeError));

    consoleError.mockClear();
    limparBanco();
    await sincronizarCnpj(CNPJ_EMPRESA, ctx(quebra(new ErroSefaz("HTTP 503"))));
    expect(consoleError.mock.calls.some((c) => String(c[0]).startsWith("Captura Sefaz"))).toBe(false);

    limparBanco();
    expect((await sincronizarCnpj(CNPJ_EMPRESA, ctx(quebra("?")))).mensagem).toBe("Erro inesperado na consulta à Sefaz");
  });
});

describe("sincronizar", () => {
  it("configuração inválida devolve o motivo sem consultar", async () => {
    montarConfig.mockReturnValue({ ok: false, erro: "Captura na Sefaz desligada (tela Empresa)." });
    expect(await sincronizar({ origem: "MANUAL" })).toEqual({ ok: false, erro: "Captura na Sefaz desligada (tela Empresa)." });
  });

  it("consulta cada CNPJ em sequência com o cliente montado da configuração", async () => {
    montarConfig.mockReturnValue({ ok: true, config: { cfg: 1 }, cnpjs: [CNPJ_EMPRESA, "11222333000262"], frequencia: "UMA_VEZ_DIA" });
    const cliente = clienteFalso([fimDaFila(), fimDaFila()]);
    clienteSefaz.mockReturnValue(cliente);
    const r = await sincronizar({ origem: "MANUAL" });
    expect(clienteSefaz).toHaveBeenCalledWith({ cfg: 1 });
    expect(r).toMatchObject({ ok: true, resultados: [{ cnpj: CNPJ_EMPRESA, status: "SEM_NOVIDADES" }, { cnpj: "11222333000262", status: "SEM_NOVIDADES" }] });
    expect(banco.execucoes.map((e) => [e.cnpj, e.disparadaPorId, e.iniciadaEm instanceof Date])).toEqual([
      [CNPJ_EMPRESA, null, true],
      ["11222333000262", null, true],
    ]);
  });

  it("usa o cliente, o usuário e o relógio recebidos", async () => {
    montarConfig.mockReturnValue({ ok: true, config: {}, cnpjs: [CNPJ_EMPRESA], frequencia: "UMA_VEZ_DIA" });
    await sincronizar({ origem: "MANUAL", usuarioId: "u1", cliente: clienteFalso([fimDaFila()]), agora: () => new Date(AGORA) });
    expect(clienteSefaz).not.toHaveBeenCalled();
    expect(banco.execucoes[0]).toMatchObject({ disparadaPorId: "u1", iniciadaEm: AGORA });
  });
});

describe("reenviarCiencia", () => {
  const CHAVE_2 = outraChave("2");
  const OUTRO_CNPJ = "11222333000262";

  beforeEach(() => {
    montarConfig.mockReturnValue({ ok: true, config: {}, cnpjs: [CNPJ_EMPRESA], frequencia: "UMA_VEZ_DIA" });
  });

  it("configuração inválida devolve o motivo", async () => {
    montarConfig.mockReturnValue({ ok: false, erro: "Certificado A1 vencido em 01/10/2026." });
    expect(await reenviarCiencia(["d1"])).toEqual({ ok: false, erro: "Certificado A1 vencido em 01/10/2026." });
  });

  it("reenvia por CNPJ destinatário e soma os resultados", async () => {
    banco.documentos.push(
      pendente("d1", CHAVE_FIXTURE, { manifestacao: "ERRO" }),
      pendente("d2", CHAVE_2, { manifestacao: "ERRO", cnpjDestinatario: OUTRO_CNPJ }),
      pendente("d3", outraChave("3"), { manifestacao: "ERRO" }),
    );
    const cliente = clienteFalso([], async (_c, chaves) => chaves.map((chave) => ({ chave, cStat: chave === CHAVE_2 ? "999" : "135", xMotivo: "" })));
    clienteSefaz.mockReturnValue(cliente);
    prisma.documentoSefaz.findMany.mockImplementationOnce(async () => banco.documentos.map((d) => ({ cnpjDestinatario: d.cnpjDestinatario })));
    expect(await reenviarCiencia(["d1", "d2", "d3"])).toEqual({ ok: true, enviadas: 2, erros: 1 });
    expect(cliente.enviarCiencia.mock.calls.map((c) => c[0])).toEqual([CNPJ_EMPRESA, OUTRO_CNPJ]);
  });

  it("para no primeiro CNPJ cuja Ciência não saiu", async () => {
    banco.documentos.push(pendente("d1", CHAVE_FIXTURE, { manifestacao: "ERRO" }));
    clienteSefaz.mockReturnValue(
      clienteFalso([], async () => {
        throw new Error("timeout");
      }),
    );
    prisma.documentoSefaz.findMany.mockImplementationOnce(async () => [{ cnpjDestinatario: CNPJ_EMPRESA }]);
    expect(await reenviarCiencia(["d1"])).toEqual({ ok: false, erro: "timeout" });
  });
});
