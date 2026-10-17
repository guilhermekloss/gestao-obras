import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteSefaz } from "../cliente";
import type { RetornoDistribuicao } from "../xml";
import { CHAVE_FIXTURE, CNPJ_EMPRESA, procNfeFixture, resEventoCancelamento, resNfe } from "./respostas";

// Banco em memória com só o que o orquestrador usa.
type Linha = Record<string, unknown>;
const banco = {
  cursores: new Map<string, Linha>(),
  documentos: [] as Linha[],
  execucoes: [] as Linha[],
  notas: [] as { id: string; chaveNfe: string }[],
};

function casa(linha: Linha, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Record<string, unknown>[]).some((w) => casa(linha, w));
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const op = v as { in?: unknown[]; lt?: Date; not?: unknown };
      if (op.in) return op.in.includes(linha[k]);
      if (op.lt) return linha[k] instanceof Date && (linha[k] as Date) < op.lt;
      if ("not" in op) return linha[k] !== op.not;
    }
    return (linha[k] ?? null) === v;
  });
}

function aplicar(linha: Linha, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) if (v !== undefined) linha[k] = v;
}

let seq = 0;
const prisma = {
  cursorSefaz: {
    upsert: vi.fn(async ({ where, create }: { where: { cnpj: string }; create: Linha }) => {
      if (!banco.cursores.has(where.cnpj)) {
        banco.cursores.set(where.cnpj, {
          ultNsu: "000000000000000",
          maxNsu: "000000000000000",
          proximaConsultaEm: null,
          bloqueadoAte: null,
          travadoAte: null,
          ...create,
        });
      }
      return banco.cursores.get(where.cnpj);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
      const c = banco.cursores.get(where.cnpj as string);
      if (!c || !casa(c, where)) return { count: 0 };
      aplicar(c, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: { where: { cnpj: string }; data: Linha }) => {
      aplicar(banco.cursores.get(where.cnpj)!, data);
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { cnpj: string } }) => ({ ...banco.cursores.get(where.cnpj)! })),
  },
  documentoSefaz: {
    findUnique: vi.fn(async ({ where }: { where: { chave: string } }) => banco.documentos.find((d) => d.chave === where.chave) ?? null),
    findMany: vi.fn(async ({ where, take }: { where: Linha; take: number }) =>
      banco.documentos.filter((d) => casa(d, where)).slice(0, take),
    ),
    create: vi.fn(async ({ data }: { data: Linha }) => {
      if (banco.documentos.some((d) => d.chave === data.chave)) throw new Error("unique chave");
      const linha = { id: `doc${++seq}`, manifestacaoErro: null, xmlUrl: null, notaFiscalId: null, ...data };
      banco.documentos.push(linha);
      return linha;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Linha }) => {
      aplicar(banco.documentos.find((d) => d.id === where.id)!, data);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
      const alvo = banco.documentos.filter((d) => casa(d, where));
      alvo.forEach((d) => aplicar(d, data));
      return { count: alvo.length };
    }),
  },
  notaFiscal: {
    findUnique: vi.fn(async ({ where }: { where: { chaveNfe: string } }) => banco.notas.find((n) => n.chaveNfe === where.chaveNfe) ?? null),
  },
  execucaoSefaz: {
    create: vi.fn(async ({ data }: { data: Linha }) => banco.execucoes.push(data)),
  },
};

const storage = {
  salvar: vi.fn(async () => `/api/fotos/1760000000000-${String(++seq).padStart(12, "0")}.xml`),
  excluir: vi.fn(async () => undefined),
  ler: vi.fn(),
};
const registrarAtividade = vi.fn(async () => undefined);

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/storage", () => ({ storage }));
vi.mock("@/lib/atividade", () => ({ registrarAtividade }));

const { sincronizarCnpj, gravarDocumento } = await import("../sincronizar");
const { classificarDocumento } = await import("../xml");

const AGORA = new Date("2026-10-17T13:00:00Z");
const relogio = () => new Date(AGORA);

function clienteFalso(respostas: RetornoDistribuicao[], ciencia?: ClienteSefaz["enviarCiencia"]) {
  const distribuicaoPorNsu = vi.fn(async () => {
    const r = respostas.shift();
    if (!r) throw new Error("consulta a mais");
    return r;
  });
  const enviarCiencia = vi.fn(
    ciencia ?? (async (_cnpj: string, chaves: string[]) => chaves.map((chave) => ({ chave, cStat: "135", xMotivo: "ok" }))),
  );
  return { distribuicaoPorNsu, enviarCiencia } satisfies ClienteSefaz;
}

const ctx = (cliente: ClienteSefaz, origem: "AGENDADA" | "MANUAL" = "AGENDADA") => ({
  cliente,
  origem,
  usuarioId: null,
  agora: relogio,
});

const doc = (nsu: string, schema: string, xml: string) => ({ nsu, schema, xml });

beforeEach(() => {
  banco.cursores.clear();
  banco.documentos.length = 0;
  banco.execucoes.length = 0;
  banco.notas.length = 0;
  vi.clearAllMocks();
});

describe("sincronizarCnpj", () => {
  it("percorre a fila, grava o resumo, dá Ciência e espera 1 h no fim da fila", async () => {
    const cliente = clienteFalso([
      { cStat: "138", xMotivo: "ok", ultNsu: "000000000000001", maxNsu: "000000000000002", docs: [doc("000000000000001", "resNFe_v1.01.xsd", resNfe())] },
      { cStat: "137", xMotivo: "Nenhum documento localizado", ultNsu: "000000000000002", maxNsu: "000000000000002", docs: [] },
    ]);
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));

    expect(r).toMatchObject({ status: "SUCESSO", docsNovos: 1, ciencias: 1 });
    expect(cliente.distribuicaoPorNsu.mock.calls).toEqual([
      [CNPJ_EMPRESA, "000000000000000"],
      [CNPJ_EMPRESA, "000000000000001"],
    ]);
    expect(cliente.enviarCiencia).toHaveBeenCalledWith(CNPJ_EMPRESA, [CHAVE_FIXTURE], AGORA);

    const cursor = banco.cursores.get(CNPJ_EMPRESA)!;
    expect(cursor).toMatchObject({ ultNsu: "000000000000002", maxNsu: "000000000000002", travadoAte: null, ultimoCStat: "137" });
    expect(cursor.proximaConsultaEm).toEqual(new Date(AGORA.getTime() + 61 * 60 * 1000));

    expect(banco.documentos).toHaveLength(1);
    expect(banco.documentos[0]).toMatchObject({
      chave: CHAVE_FIXTURE,
      situacao: "RESUMO",
      manifestacao: "CIENCIA_ENVIADA",
      status: "NOVA",
      numero: "1234",
      serie: "1",
      valorCents: 155600,
      emitenteDoc: "98765432000110",
    });
    expect(banco.execucoes[0]).toMatchObject({ status: "SUCESSO", lotes: 2, docsRecebidos: 1, ciencias: 1, nsuInicial: "000000000000000", nsuFinal: "000000000000002" });
    expect(registrarAtividade).toHaveBeenCalledWith(null, "sefaz.captura", expect.anything());
  });

  it("dentro da janela de 1 h não consulta; agendada pulada não polui o histórico", async () => {
    banco.cursores.set(CNPJ_EMPRESA, {
      cnpj: CNPJ_EMPRESA,
      ultNsu: "000000000000005",
      proximaConsultaEm: new Date(AGORA.getTime() + 10 * 60 * 1000),
      bloqueadoAte: null,
      travadoAte: null,
    });
    const cliente = clienteFalso([]);
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(r.status).toBe("PULADA");
    expect(cliente.distribuicaoPorNsu).not.toHaveBeenCalled();
    expect(banco.execucoes).toHaveLength(0);
    expect(banco.cursores.get(CNPJ_EMPRESA)!.travadoAte).toBeNull();
  });

  it("manual pulada fica no histórico com o horário liberado", async () => {
    banco.cursores.set(CNPJ_EMPRESA, {
      cnpj: CNPJ_EMPRESA,
      ultNsu: "000000000000005",
      proximaConsultaEm: null,
      bloqueadoAte: new Date("2026-10-17T13:30:00Z"),
      travadoAte: null,
    });
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(clienteFalso([]), "MANUAL"));
    expect(r.mensagem).toBe("CNPJ bloqueado pela Sefaz por consumo indevido até 10:30.");
    expect(banco.execucoes[0]).toMatchObject({ status: "PULADA", origem: "MANUAL" });
  });

  it("com outra execução em andamento, não consulta (o NSU sairia de sequência)", async () => {
    banco.cursores.set(CNPJ_EMPRESA, {
      cnpj: CNPJ_EMPRESA,
      ultNsu: "000000000000005",
      proximaConsultaEm: null,
      bloqueadoAte: null,
      travadoAte: new Date(AGORA.getTime() + 60 * 1000),
    });
    const cliente = clienteFalso([]);
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(r).toMatchObject({ status: "PULADA", mensagem: "Outra consulta deste CNPJ está em andamento." });
    expect(cliente.distribuicaoPorNsu).not.toHaveBeenCalled();
    // a trava é de quem a pegou: quem pulou não a solta
    expect(banco.cursores.get(CNPJ_EMPRESA)!.travadoAte).toEqual(new Date(AGORA.getTime() + 60 * 1000));
  });

  it("trava vencida (instância que morreu) não impede a consulta", async () => {
    banco.cursores.set(CNPJ_EMPRESA, {
      cnpj: CNPJ_EMPRESA,
      ultNsu: "000000000000005",
      proximaConsultaEm: null,
      bloqueadoAte: null,
      travadoAte: new Date(AGORA.getTime() - 1),
    });
    const cliente = clienteFalso([{ cStat: "137", xMotivo: "", ultNsu: "000000000000005", maxNsu: "000000000000005", docs: [] }]);
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(r.status).toBe("SEM_NOVIDADES");
    expect(cliente.distribuicaoPorNsu).toHaveBeenCalledWith(CNPJ_EMPRESA, "000000000000005");
  });

  it("656: marca bloqueio, mantém o NSU e registra BLOQUEADA", async () => {
    banco.cursores.set(CNPJ_EMPRESA, { cnpj: CNPJ_EMPRESA, ultNsu: "000000000000007", proximaConsultaEm: null, bloqueadoAte: null, travadoAte: null });
    const cliente = clienteFalso([{ cStat: "656", xMotivo: "Consumo Indevido", ultNsu: "000000000000000", maxNsu: "000000000000000", docs: [] }]);
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(r.status).toBe("BLOQUEADA");
    const cursor = banco.cursores.get(CNPJ_EMPRESA)!;
    expect(cursor.ultNsu).toBe("000000000000007");
    expect(cursor.bloqueadoAte).toEqual(new Date(AGORA.getTime() + 65 * 60 * 1000));
  });

  it("para no limite de lotes e deixa a próxima execução continuar logo", async () => {
    const lotes = Array.from({ length: 8 }, (_, i) => ({
      cStat: "138",
      xMotivo: "",
      ultNsu: String(i + 1).padStart(15, "0"),
      maxNsu: "000000000000100",
      docs: [],
    }));
    const cliente = clienteFalso(lotes);
    await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(cliente.distribuicaoPorNsu).toHaveBeenCalledTimes(8);
    expect(banco.cursores.get(CNPJ_EMPRESA)).toMatchObject({ ultNsu: "000000000000008", proximaConsultaEm: null });
  });

  it("falha de rede: registra ERRO, solta a trava e não perde o NSU já processado", async () => {
    const cliente: ClienteSefaz = {
      distribuicaoPorNsu: vi
        .fn()
        .mockResolvedValueOnce({ cStat: "138", xMotivo: "", ultNsu: "000000000000003", maxNsu: "000000000000009", docs: [] })
        .mockRejectedValueOnce(new Error("Sefaz não respondeu em 25 s.")),
      enviarCiencia: vi.fn(),
    };
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(r).toMatchObject({ status: "ERRO", mensagem: "Sefaz não respondeu em 25 s." });
    expect(banco.cursores.get(CNPJ_EMPRESA)).toMatchObject({ ultNsu: "000000000000003", travadoAte: null });
    expect(banco.execucoes[0]).toMatchObject({ status: "ERRO" });
  });

  it("Ciência recusada fica com ERRO e o motivo, para o ADMIN reenviar", async () => {
    const cliente = clienteFalso(
      [{ cStat: "138", xMotivo: "", ultNsu: "1", maxNsu: "1", docs: [doc("1", "resNFe_v1.01.xsd", resNfe())] }],
      async (_c, chaves) => chaves.map((chave) => ({ chave, cStat: "596", xMotivo: "Rejeição: evento apresentado fora do prazo" })),
    );
    const r = await sincronizarCnpj(CNPJ_EMPRESA, ctx(cliente));
    expect(r.ciencias).toBe(0);
    expect(r.mensagem).toContain("1 Ciência(s) recusada(s)");
    expect(banco.documentos[0]).toMatchObject({ manifestacao: "ERRO", manifestacaoErro: "596 – Rejeição: evento apresentado fora do prazo" });
  });
});

describe("gravarDocumento", () => {
  const completo = () => classificarDocumento(doc("2", "procNFe_v4.00.xsd", procNfeFixture()));
  const resumo = (xml = resNfe()) => classificarDocumento(doc("1", "resNFe_v1.01.xsd", xml));

  it("resumo e depois completo: mesma linha, XML guardado e Ciência dispensada", async () => {
    expect(await gravarDocumento(resumo(), CNPJ_EMPRESA)).toBe("NOVO");
    expect(await gravarDocumento(completo(), CNPJ_EMPRESA)).toBe("ATUALIZADO");
    expect(banco.documentos).toHaveLength(1);
    expect(banco.documentos[0]).toMatchObject({ situacao: "COMPLETO", manifestacao: "DISPENSADA", xmlUrl: expect.stringMatching(/\.xml$/) });
  });

  it("completo repetido não grava o XML duas vezes", async () => {
    await gravarDocumento(completo(), CNPJ_EMPRESA);
    expect(await gravarDocumento(completo(), CNPJ_EMPRESA)).toBe("IGNORADO");
    expect(storage.salvar).toHaveBeenCalledTimes(1);
  });

  it("resumo depois do completo não rebaixa a nota", async () => {
    await gravarDocumento(completo(), CNPJ_EMPRESA);
    expect(await gravarDocumento(resumo(), CNPJ_EMPRESA)).toBe("IGNORADO");
    expect(banco.documentos[0].situacao).toBe("COMPLETO");
  });

  it("cancelamento marca a nota e dispensa a Ciência pendente", async () => {
    await gravarDocumento(resumo(), CNPJ_EMPRESA);
    expect(await gravarDocumento(classificarDocumento(doc("3", "resEvento_v1.01.xsd", resEventoCancelamento())), CNPJ_EMPRESA)).toBe("ATUALIZADO");
    expect(banco.documentos[0]).toMatchObject({ situacao: "CANCELADA", manifestacao: "DISPENSADA" });
  });

  it("resumo de nota já cancelada entra como CANCELADA, sem Ciência", async () => {
    await gravarDocumento(resumo(resNfe({ cSit: "3" })), CNPJ_EMPRESA);
    expect(banco.documentos[0]).toMatchObject({ situacao: "CANCELADA", manifestacao: "DISPENSADA" });
  });

  it("nota já lançada pela importação entra como LANCADA, ligada ao lançamento", async () => {
    banco.notas.push({ id: "nota1", chaveNfe: CHAVE_FIXTURE });
    await gravarDocumento(resumo(), CNPJ_EMPRESA);
    expect(banco.documentos[0]).toMatchObject({ status: "LANCADA", notaFiscalId: "nota1" });
  });

  it("ignora nota emitida pela própria empresa e nota em que ela não é a destinatária", async () => {
    expect(await gravarDocumento(resumo(resNfe({ cnpjEmit: "11222333000262" })), CNPJ_EMPRESA)).toBe("IGNORADO");
    expect(await gravarDocumento(completo(), "55666777000188")).toBe("IGNORADO");
    expect(banco.documentos).toHaveLength(0);
  });

  it("se o banco recusar, o XML recém-gravado é apagado", async () => {
    prisma.documentoSefaz.create.mockRejectedValueOnce(new Error("falhou"));
    await expect(gravarDocumento(completo(), CNPJ_EMPRESA)).rejects.toThrow("falhou");
    expect(storage.excluir).toHaveBeenCalledTimes(1);
  });
});
