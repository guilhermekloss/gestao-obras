import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { CHAVE, comoPrisma, lancamento, novoBanco, type Banco } from "./lancamento-banco";
import { dadosImportaveis, lancamentoDoXml, parseDocumentoXml } from "../documento-xml";
import { chaveDocumentoValida, chaveNfseValida } from "../leitura-documento";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { numeroDoLancamento, registrarLancamento } = await import("../lancamento");

const CHAVE_NFSE = "35503082211222333000181000000000123426101234567894";

// o lançamento como a action do import monta a partir da fixture
function daFixture(nome = "nfse-ibscbs-retencoes-cno.xml") {
  const r = parseDocumentoXml(readFileSync(path.join(__dirname, "fixtures", nome), "utf8"));
  if (!r.ok) throw new Error(r.erro);
  const d = dadosImportaveis(r.doc);
  return lancamentoDoXml(
    d,
    {
      tipos: d.itens.map((i) => i.tipoSugerido),
      materiais: d.itens.map(() => ({ modo: "nenhum" as const })),
      rateios: [{ obraId: "o1", fracaoBp: 10_000 }],
      parcelas: d.parcelas.map(({ numero, valorCents, vencimento }) => ({ numero, valorCents, vencimento })),
    },
    { fornecedor: { id: "forn-1" }, anexoUrl: "/api/fotos/1700000000000-abcdef12.xml", criadoPor: "u1" },
  );
}

type DadosCreate = { data: Record<string, unknown> };
type DadosCreateMany = { data: Record<string, unknown>[] };

describe("chave da NFS-e", () => {
  it("50 dígitos valem; a da NF-e continua exigindo o DV", () => {
    expect(chaveNfseValida(CHAVE_NFSE)).toBe(true);
    expect(chaveNfseValida(CHAVE_NFSE.slice(1))).toBe(false);
    expect(chaveNfseValida(`NFS${CHAVE_NFSE}`)).toBe(false);
    expect(chaveNfseValida(`${CHAVE_NFSE.slice(0, 49)}X`)).toBe(false);
    expect(chaveDocumentoValida(CHAVE_NFSE)).toBe(true);
    expect(chaveDocumentoValida(CHAVE)).toBe(true);
    expect(chaveDocumentoValida(`${CHAVE.slice(0, 43)}${(Number(CHAVE[43]) + 1) % 10}`)).toBe(false);
  });
});

describe("numeroDoLancamento na NFS-e", () => {
  it("tira os zeros à esquerda, como na NF (foto '000228' × XML '228')", () => {
    expect(numeroDoLancamento("NFSE", "000228")).toBe("228");
    expect(numeroDoLancamento("NFSE", " 2026/000123 ")).toBe("2026000123");
    expect(numeroDoLancamento("NFSE", "A-12")).toBe("A-12");
  });
});

describe("registrarLancamento: NFS-e importada do XML", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });

  it("grava tipo NFSE, a chave de 50 posições, o CRT e o item de serviço com NBS e IBS/CBS", async () => {
    const r = await registrarLancamento(daFixture(), { forcar: true }, comoPrisma(db));
    expect(r).toMatchObject({ ok: true, notaId: "nota-1", numero: "1234" });

    const nota = (db.notaFiscal.create.mock.calls[0][0] as DadosCreate).data;
    expect(nota).toMatchObject({
      tipoDocumento: "NFSE",
      numero: "1234",
      chaveNfe: CHAVE_NFSE,
      crtEmitente: "3",
      totalCents: 1_000_000,
      anexoUrl: "/api/fotos/1700000000000-abcdef12.xml",
    });
    expect(String(nota.obs)).toMatch(/Retenções a recolher em guia/);

    const [item] = (db.itemNota.createMany.mock.calls[0][0] as DadosCreateMany).data;
    expect(item).toMatchObject({
      tipo: "SERVICO",
      totalCents: 1_000_000,
      ncm: null,
      nbs: "101011100",
      cst: "000",
      cClassTrib: "000001",
      ibsCbsBaseCents: 950_000,
      cbsCents: 8_550,
      ibsUfCents: 950,
      pCbs: "0.9",
    });

    // líquido ao prestador + guias: o financeiro fecha com o custo
    const parcelas = (db.parcela.createMany.mock.calls[0][0] as DadosCreateMany).data;
    expect(parcelas.map((p) => p.valorCents)).toEqual([778_500, 50_000, 171_500]);
  });

  it("procura a duplicata pela chave de 50 posições e recusa com a mensagem da NFS-e", async () => {
    db.notaFiscal.findUnique.mockResolvedValue({ id: "n9", numero: "1234" });
    const r = await registrarLancamento(daFixture(), { forcar: true }, comoPrisma(db));
    expect(db.notaFiscal.findUnique).toHaveBeenCalledWith({ where: { chaveNfe: CHAVE_NFSE }, select: { id: true, numero: true } });
    expect(r).toEqual({ ok: false, erro: "Esta NFS-e já foi lançada (NFS-e 1234).", notaExistenteId: "n9" });
    expect(db.notaFiscal.create).not.toHaveBeenCalled();
  });

  it("mesma NFS-e lançada antes pela foto, com zeros à esquerda: bloqueia pelo fornecedor + número", async () => {
    db.notaFiscal.findFirst.mockResolvedValue({ id: "n7" });
    const r = await registrarLancamento({ ...daFixture(), numero: "0001234" }, { forcar: true }, comoPrisma(db));
    expect(db.notaFiscal.findFirst.mock.calls[0][0]).toMatchObject({
      where: { fornecedorId: "forn-1", numero: { in: ["1234", "0001234"] } },
    });
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/Já existe a NFS-e 1234/), notaExistenteId: "n7" });
  });

  it("chave fora do formato não entra", async () => {
    const r = await registrarLancamento({ ...daFixture(), chaveNfe: CHAVE_NFSE.slice(1) }, { forcar: true }, comoPrisma(db));
    expect(r).toEqual({ ok: false, erro: "Chave de acesso inválida" });
  });

  it("corrida na chave (P2002): mensagem da NFS-e", async () => {
    db.notaFiscal.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x", meta: { target: ["chaveNfe"] } }),
    );
    const r = await registrarLancamento(daFixture(), { forcar: true }, comoPrisma(db));
    expect(r).toEqual({ ok: false, erro: "Esta NFS-e acabou de ser lançada por outra pessoa." });
  });

  it("NF-e mantém a mensagem de sempre", async () => {
    db.notaFiscal.findUnique.mockResolvedValue({ id: "n9", numero: "46" });
    const r = await registrarLancamento(lancamento({ chaveNfe: CHAVE }), {}, comoPrisma(db));
    expect(r).toEqual({ ok: false, erro: "Esta NF-e já foi lançada (NF 46).", notaExistenteId: "n9" });
  });

  it("sem os avisos confirmados, a soma dos itens fecha com o total (nada a perguntar)", async () => {
    const r = await registrarLancamento(daFixture("nfse-simples-sem-ibscbs.xml"), {}, comoPrisma(db));
    // dataCompra de 2026-09 não é futura; itens = total; parcelas = total
    expect(r).toMatchObject({ ok: true });
  });
});
