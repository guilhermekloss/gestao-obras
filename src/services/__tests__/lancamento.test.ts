import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { erroDeRegras, gravarLancamento, numeroDoLancamento, registrarLancamento } = await import("../lancamento");
type Lancamento = Parameters<typeof registrarLancamento>[0];

// chave de acesso com dígito verificador válido (a mesma dos testes do leitor)
const CHAVE = "35200114200166000187550010000000046000000040";

function novoBanco() {
  const db = {
    notaFiscal: {
      findFirst: vi.fn(async (_: object) => null as { id: string } | null),
      findUnique: vi.fn(async (_: object) => null as { id: string; numero: string } | null),
      findMany: vi.fn(async () => [] as { numero: string }[]),
      create: vi.fn(async (_: object) => ({ id: "nota-1" })),
      update: vi.fn(async () => ({})),
    },
    material: {
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => ({ nome: "Cimento CP II" })),
      findFirst: vi.fn(async () => null as { id: string } | null),
      create: vi.fn(async () => ({ id: "mat-novo", nome: "Areia", unidade: "M3", tipo: "MATERIAL", categoria: null })),
    },
    materialApelido: { upsert: vi.fn(async () => ({})) },
    etapa: { findMany: vi.fn(async () => [] as { id: string; obraId: string }[]) },
    fornecedor: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => ({ nome: "Ferragens Silva" })),
      create: vi.fn(async ({ data }: { data: { nome: string } }) => ({ id: "forn-novo", ...data })),
    },
    parcela: {
      findMany: vi.fn(async () => [] as object[]),
      deleteMany: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      createMany: vi.fn(async (_: object) => ({})),
    },
    itemNota: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async (_: object) => ({})) },
    rateioNota: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async (_: object) => ({})) },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return db;
}

type Banco = ReturnType<typeof novoBanco>;
const comoPrisma = (db: Banco) => db as never;

function lancamento(extra: Partial<Lancamento> = {}): Lancamento {
  return {
    fornecedor: { id: "forn-1" },
    tipoDocumento: "NF",
    numero: "123",
    dataCompra: "2026-10-01",
    totalCents: 10_000,
    formaPagto: "BOLETO",
    itens: [{ descricao: "Cimento CP II", tipo: "MATERIAL", qtde: 10, unidade: "SC", unitCents: 1_000, descontoCents: 0 }],
    rateios: [{ obraId: "o1", fracaoBp: 10_000 }],
    parcelas: [{ numero: 1, valorCents: 10_000, vencimento: "2026-11-01" }],
    criadoPor: "u1",
    ...extra,
  };
}

describe("erroDeRegras", () => {
  it("aceita um lançamento consistente", () => {
    expect(erroDeRegras(lancamento())).toBeNull();
  });
  it("NF exige número; recibo não", () => {
    expect(erroDeRegras(lancamento({ numero: "  " }))).toBe("Número da NF é obrigatório");
    expect(erroDeRegras(lancamento({ numero: "", tipoDocumento: "RECIBO" }))).toBeNull();
  });
  it("recusa a mesma obra duas vezes no rateio (o banco rejeitaria com P2002)", () => {
    const l = lancamento({ rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 5_000 }, { obraId: "o1", etapaId: "e2", fracaoBp: 5_000 }] });
    expect(erroDeRegras(l)).toMatch(/mesma obra/);
  });
  it("rateio precisa somar 100%", () => {
    expect(erroDeRegras(lancamento({ rateios: [{ obraId: "o1", fracaoBp: 9_000 }] }))).toMatch(/Rateio deve somar 100%/);
  });
  it("parcelas precisam fechar com o total, salvo na planilha antiga", () => {
    const l = lancamento({ parcelas: [{ numero: 1, valorCents: 9_000, vencimento: "2026-11-01" }] });
    expect(erroDeRegras(l)).toMatch(/Soma das parcelas difere/);
    expect(erroDeRegras(l, { somaParcelas: false })).toBeNull();
  });
  it("exige ao menos uma parcela mesmo quando a soma é tolerada", () => {
    expect(erroDeRegras(lancamento({ parcelas: [] }), { somaParcelas: false })).toMatch(/ao menos 1 parcela/);
  });
});

describe("numeroDoLancamento", () => {
  it("tira zeros à esquerda só da NF", () => {
    expect(numeroDoLancamento("NF", "000123")).toBe("123");
    expect(numeroDoLancamento("RECIBO", " REC-0004 ")).toBe("REC-0004");
  });
});

describe("registrarLancamento", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });

  it("grava nota, rateio, itens e parcelas e devolve o número e o fornecedor", async () => {
    const r = await registrarLancamento(lancamento(), {}, comoPrisma(db));
    expect(r).toEqual({ ok: true, notaId: "nota-1", numero: "123", fornecedorNome: "Ferragens Silva", fornecedorCriado: false });
    expect(db.rateioNota.createMany).toHaveBeenCalledTimes(1);
    expect(db.itemNota.createMany.mock.calls[0][0]).toMatchObject({ data: [{ totalCents: 10_000 }] });
    expect(db.parcela.createMany).toHaveBeenCalledTimes(1);
  });

  it("não deixa o número '000123' passar por cima da NF 123 do mesmo fornecedor", async () => {
    db.notaFiscal.findFirst.mockResolvedValue({ id: "existente" });
    const r = await registrarLancamento(lancamento({ numero: "000123" }), {}, comoPrisma(db));
    expect(r).toMatchObject({ ok: false, notaExistenteId: "existente" });
    const { where } = db.notaFiscal.findFirst.mock.calls[0][0] as { where: { numero: { in: string[] } } };
    expect(where.numero.in.sort()).toEqual(["000123", "123"]);
    expect(db.notaFiscal.create).not.toHaveBeenCalled();
  });

  it("bloqueia a chave de acesso repetida e devolve a nota existente", async () => {
    db.notaFiscal.findUnique.mockResolvedValue({ id: "n9", numero: "46" });
    const r = await registrarLancamento(lancamento({ chaveNfe: CHAVE }), {}, comoPrisma(db));
    expect(r).toEqual({ ok: false, erro: "Esta NF-e já foi lançada (NF 46).", notaExistenteId: "n9" });
  });

  it("ignora a chave na edição", async () => {
    await registrarLancamento(lancamento({ id: "nota-1", chaveNfe: CHAVE }), { forcar: true }, comoPrisma(db));
    expect(db.notaFiscal.findUnique).not.toHaveBeenCalled();
    expect(db.notaFiscal.update).toHaveBeenCalledTimes(1);
  });

  it("recusa material que não existe mais", async () => {
    db.material.count.mockResolvedValue(0);
    const l = lancamento({ itens: [{ ...lancamento().itens[0], materialId: "sumiu" }] });
    expect(await registrarLancamento(l, {}, comoPrisma(db))).toMatchObject({ ok: false, erro: expect.stringMatching(/não existe mais/) });
  });

  it("recusa etapa de outra obra", async () => {
    db.etapa.findMany.mockResolvedValue([{ id: "e1", obraId: "outra" }]);
    const l = lancamento({ rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }] });
    expect(await registrarLancamento(l, {}, comoPrisma(db))).toMatchObject({ ok: false, erro: "Etapa do rateio não pertence à obra escolhida" });
  });

  it("junta os avisos numa pergunta e só grava com forcar", async () => {
    const l = lancamento({ totalCents: 12_000, parcelas: [{ numero: 1, valorCents: 12_000, vencimento: "2026-11-01" }] });
    const pergunta = await registrarLancamento(l, {}, comoPrisma(db));
    expect(pergunta).toMatchObject({ ok: false, aviso: true });
    expect((pergunta as { erro: string }).erro).toMatch(/Soma dos itens[\s\S]*Salvar mesmo assim\?/);
    expect(db.notaFiscal.create).not.toHaveBeenCalled();

    expect(await registrarLancamento(l, { forcar: true }, comoPrisma(db))).toMatchObject({ ok: true });
  });

  it("avisa quando editar apaga o registro de uma parcela paga", async () => {
    db.parcela.findMany.mockResolvedValue([{ numero: 1, valorCents: 10_000, vencimento: new Date("2026-11-01T12:00:00"), status: "PAGA", pagaEm: new Date() }]);
    const l = lancamento({ id: "nota-1", parcelas: [{ numero: 1, valorCents: 10_000, vencimento: "2026-12-01" }] });
    const r = await registrarLancamento(l, {}, comoPrisma(db));
    expect(r).toMatchObject({ ok: false, aviso: true });
    expect((r as { erro: string }).erro).toMatch(/já paga/);
  });

  it("cria fornecedor novo dentro da mesma transação", async () => {
    const r = await registrarLancamento(lancamento({ fornecedor: { novo: { nome: "Novo Ltda" } } }), {}, comoPrisma(db));
    expect(r).toMatchObject({ ok: true, fornecedorNome: "Novo Ltda", fornecedorCriado: true });
    expect(db.notaFiscal.create.mock.calls[0][0]).toMatchObject({ data: { fornecedorId: "forn-novo" } });
  });

  it("cria o material novo junto e registra o apelido", async () => {
    const l = lancamento({ itens: [{ ...lancamento().itens[0], descricao: "AREIA MEDIA", materialNovo: { nome: "Areia", unidade: "m³" } }] });
    await registrarLancamento(l, { forcar: true }, comoPrisma(db));
    expect(db.material.create).toHaveBeenCalledTimes(1);
    expect(db.itemNota.createMany.mock.calls[0][0]).toMatchObject({ data: [{ materialId: "mat-novo" }] });
    expect(db.materialApelido.upsert).toHaveBeenCalled();
  });

  it("gera o número sequencial do recibo por fornecedor", async () => {
    db.notaFiscal.findMany.mockResolvedValue([{ numero: "REC-0007" }]);
    const r = await registrarLancamento(lancamento({ tipoDocumento: "RECIBO", numero: "" }), { forcar: true }, comoPrisma(db));
    expect(r).toMatchObject({ ok: true, numero: "REC-0008" });
  });

  describe("corrida (P2002)", () => {
    const p2002 = (target: string[]) =>
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x", meta: { target } });

    it.each([
      [["fornecedorId", "numero"], /Já existe a NF 123 deste fornecedor/],
      [["chaveNfe"], /acabou de ser lançada/],
      [["notaId", "obraId"], /mesma obra/],
    ])("traduz %j para a mensagem do índice que falhou", async (alvo, mensagem) => {
      db.notaFiscal.create.mockRejectedValue(p2002(alvo));
      const r = await registrarLancamento(lancamento(), {}, comoPrisma(db));
      expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(mensagem) });
    });

    it("não esconde um P2002 que não reconhece", async () => {
      db.notaFiscal.create.mockRejectedValue(p2002(["notaId", "numero"]));
      await expect(registrarLancamento(lancamento(), {}, comoPrisma(db))).rejects.toThrow("unique");
    });
  });
});

describe("gravarLancamento", () => {
  it("parcela com pagaEm entra como PAGA (planilha antiga)", async () => {
    const db = novoBanco();
    const paga = new Date("2026-10-05T12:00:00");
    await gravarLancamento(
      db as never,
      lancamento({ parcelas: [{ numero: 1, valorCents: 10_000, vencimento: "2026-10-05", pagaEm: paga }] }),
    );
    expect(db.parcela.createMany.mock.calls[0][0]).toMatchObject({ data: [{ status: "PAGA", pagaEm: paga }] });
  });

  it("grava a data de compra ao meio-dia local, para voltar igual em qualquer fuso", async () => {
    const db = novoBanco();
    await gravarLancamento(db as never, lancamento({ dataCompra: "2026-10-01" }));
    const { data } = db.notaFiscal.create.mock.calls[0][0] as { data: { dataCompra: Date } };
    expect(data.dataCompra.getHours()).toBe(12);
    expect(data.dataCompra.getDate()).toBe(1);
  });
});
