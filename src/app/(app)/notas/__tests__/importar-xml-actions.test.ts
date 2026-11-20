import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { Lancamento } from "@/services/lancamento";
import { dadosImportaveis, parseDocumentoXml } from "@/services/documento-xml";

// a action pura: sem sessão, banco, storage nem Next; o wrapper só repassa o usuário
vi.mock("@/lib/acao", () => ({
  acaoDeEscrita: (_opcoes: unknown, handler: (u: { id: string }, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) => handler({ id: "u1" }, ...args),
}));
vi.mock("@/lib/auth", () => ({ exigirPapel: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/atividade", () => ({ anotarAtividade: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const storage = { salvar: vi.fn(), excluir: vi.fn(async () => undefined) };
vi.mock("@/lib/storage", () => ({ storage }));
const registrarLancamento = vi.fn();
vi.mock("@/services/lancamento", async (original) => ({
  ...(await original<typeof import("@/services/lancamento")>()),
  registrarLancamento,
}));
const buscarFornecedorPorDocumento = vi.fn();
vi.mock("@/services/fornecedores", async (original) => ({
  ...(await original<typeof import("@/services/fornecedores")>()),
  buscarFornecedorPorDocumento,
}));
vi.mock("@/services/materiais-db", () => ({ carregarBaseMateriais: vi.fn() }));
vi.mock("@/services/obras", () => ({ obrasPorCno: vi.fn() }));

const { importarNfe } = await import("../importar-xml/actions");
const { redirect } = await import("next/navigation");

const fixture = (nome: string) =>
  readFileSync(path.join(__dirname, "../../../../services/__tests__/fixtures", nome), "utf8");

const ANEXO = "/api/fotos/1700000000000-abcdef12.xml";
const CHAVE_NFSE = "35503082211222333000181000000000123426101234567894";

const entrada = (xml: string, extra: Record<string, unknown> = {}) => ({
  xml,
  nomeArquivo: "nfse.xml",
  tipos: ["SERVICO" as const],
  materiais: [{ modo: "nenhum" as const }],
  rateios: [{ obraId: "o1", fracaoBp: 10_000 }],
  parcelas: [
    { numero: 1, valorCents: 778_500, vencimento: "2026-10-20" },
    { numero: 2, valorCents: 50_000, vencimento: "2026-11-10" },
    { numero: 3, valorCents: 171_500, vencimento: "2026-11-20" },
  ],
  ...extra,
});

const lancado = (): Lancamento => registrarLancamento.mock.calls[0][0];

describe("importarNfe com XML de NFS-e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.salvar.mockResolvedValue(ANEXO);
    buscarFornecedorPorDocumento.mockResolvedValue({ id: "forn-1" });
    registrarLancamento.mockResolvedValue({ ok: true, notaId: "nota-1", numero: "1234", fornecedorNome: "Empreiteira", fornecedorCriado: false });
  });

  it("grava NFSE com a chave de 50 posições, NBS e IBS/CBS lidos no servidor", async () => {
    await importarNfe(entrada(fixture("nfse-ibscbs-retencoes-cno.xml")));
    expect(buscarFornecedorPorDocumento).toHaveBeenCalledWith("11222333000181");
    expect(storage.salvar).toHaveBeenCalledWith(expect.any(Buffer), "xml");
    expect(registrarLancamento).toHaveBeenCalledWith(expect.anything(), { forcar: true });
    expect(lancado()).toMatchObject({
      fornecedor: { id: "forn-1" },
      tipoDocumento: "NFSE",
      numero: "1234",
      chaveNfe: CHAVE_NFSE,
      totalCents: 1_000_000,
      crtEmitente: "3",
      anexoUrl: ANEXO,
      anexoNome: "nfse.xml",
      criadoPor: "u1",
    });
    expect(lancado().itens).toEqual([
      expect.objectContaining({ tipo: "SERVICO", nbs: "101011100", ncm: null, ibsCbs: expect.objectContaining({ cst: "000" }) }),
    ]);
    expect(redirect).toHaveBeenCalledWith("/notas/nota-1");
  });

  it("o que o client manda além das escolhas é ignorado (fiscais só do XML)", async () => {
    const forjado = entrada(fixture("nfse-ibscbs-retencoes-cno.xml"), {
      totalCents: 1,
      chaveNfe: "1".repeat(50),
      itens: [{ descricao: "x", ibsCbs: { cst: "999" } }],
    });
    await importarNfe(forjado as never);
    expect(lancado()).toMatchObject({ totalCents: 1_000_000, chaveNfe: CHAVE_NFSE });
    expect(lancado().itens[0].ibsCbs).toMatchObject({ cst: "000" });
  });

  it("prestador sem cadastro vira fornecedor novo, com CNPJ formatado", async () => {
    buscarFornecedorPorDocumento.mockResolvedValue(null);
    await importarNfe(entrada(fixture("nfse-ibscbs-retencoes-cno.xml")));
    expect(lancado().fornecedor).toEqual({
      novo: { nome: "EMPREITEIRA BOA OBRA LTDA", cnpj: "11.222.333/0001-81", fone: "11988887777" },
    });
  });

  it("duplicada: devolve a nota existente e apaga o XML que acabou de guardar", async () => {
    registrarLancamento.mockResolvedValue({ ok: false, erro: "Esta NFS-e já foi lançada (NFS-e 1234).", notaExistenteId: "n9" });
    const r = await importarNfe(entrada(fixture("nfse-ibscbs-retencoes-cno.xml")));
    expect(r).toEqual({ ok: false, erro: "Esta NFS-e já foi lançada (NFS-e 1234).", notaExistenteId: "n9" });
    expect(storage.excluir).toHaveBeenCalledWith("1700000000000-abcdef12.xml");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("erro inesperado na gravação também apaga o XML", async () => {
    registrarLancamento.mockRejectedValue(new Error("banco fora"));
    await expect(importarNfe(entrada(fixture("nfse-ibscbs-retencoes-cno.xml")))).rejects.toThrow("banco fora");
    expect(storage.excluir).toHaveBeenCalledWith("1700000000000-abcdef12.xml");
  });

  it("itens que não conferem com o XML, XML inválido ou grande demais: nada é gravado", async () => {
    const xml = fixture("nfse-ibscbs-retencoes-cno.xml");
    expect(await importarNfe(entrada(xml, { tipos: ["SERVICO", "SERVICO"] }))).toMatchObject({ ok: false, erro: expect.stringMatching(/não conferem/) });
    expect(await importarNfe(entrada(`<!DOCTYPE x>${xml}`))).toMatchObject({ ok: false });
    expect(await importarNfe(entrada("<CompNfse/>"))).toMatchObject({ ok: false, erro: expect.stringMatching(/NF-e nem de uma NFS-e/) });
    expect(await importarNfe(entrada(xml + " ".repeat(1_000_001)))).toMatchObject({ ok: false, erro: expect.stringMatching(/grande demais/) });
    expect(storage.salvar).not.toHaveBeenCalled();
    expect(registrarLancamento).not.toHaveBeenCalled();
  });
});

describe("importarNfe com XML de NF-e (sem regressão)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.salvar.mockResolvedValue(ANEXO);
    buscarFornecedorPorDocumento.mockResolvedValue({ id: "forn-1" });
    registrarLancamento.mockResolvedValue({ ok: true, notaId: "nota-2", numero: "1", fornecedorNome: "F", fornecedorCriado: false });
  });

  it("continua gravando como NF", async () => {
    const xml = fixture("nfe-1-item.xml");
    const r = parseDocumentoXml(xml);
    if (!r.ok) throw new Error(r.erro);
    const d = dadosImportaveis(r.doc);
    await importarNfe({
      ...entrada(xml),
      tipos: d.itens.map(() => "MATERIAL" as const),
      materiais: d.itens.map(() => ({ modo: "nenhum" as const })),
      parcelas: d.parcelas.map(({ numero, valorCents, vencimento }) => ({ numero, valorCents, vencimento })),
    });
    expect(lancado()).toMatchObject({ tipoDocumento: "NF" });
    expect(lancado().chaveNfe).toHaveLength(44);
    expect(lancado().itens[0]).toMatchObject({ nbs: null });
  });
});
