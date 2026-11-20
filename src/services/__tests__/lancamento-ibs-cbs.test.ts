import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { CHAVE, comoPrisma, lancamento, novoBanco, type Banco } from "./lancamento-banco";
import { parseNfeXml, type Nfe } from "../nfe-xml";
import type { ItemDoLancamento, ItemFiscalGravado } from "../lancamento";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { herdarDadosFiscais, registrarLancamento } = await import("../lancamento");

function nfeDaFixture(nome: string): Nfe {
  const r = parseNfeXml(readFileSync(path.join(__dirname, "fixtures", nome), "utf8"));
  if (!r.ok) throw new Error(r.erro);
  return r.nfe;
}

// os itens como o import do XML monta (importar-xml/actions.ts)
function itensDoXml(nfe: Nfe): ItemDoLancamento[] {
  return nfe.itens.map((i) => ({
    descricao: i.descricao,
    tipo: i.tipoSugerido,
    qtde: i.qtde,
    unidade: i.unidade,
    unitCents: i.unitCents,
    descontoCents: i.descontoCents,
    totalCents: i.totalCents,
    ncm: i.ncm,
    nbs: null,
    ibsCbs: i.ibsCbs ?? null,
  }));
}

const gravado = (extra: Partial<ItemFiscalGravado> = {}): ItemFiscalGravado => ({
  descricao: "Cimento CP II",
  ncm: "25232910",
  nbs: null,
  cst: "000",
  cClassTrib: "000001",
  ibsCbsBaseCents: 10_000,
  pCbs: { toString: () => "8.8" },
  pIbsUf: { toString: () => "0.05" },
  pIbsMun: { toString: () => "0.05" },
  pRedCbs: null,
  pRedIbs: null,
  cbsCents: 880,
  ibsUfCents: 5,
  ibsMunCents: 5,
  ibsCbsDiferidoCents: null,
  cCredPres: null,
  credPresCents: null,
  ...extra,
});

type DadosCreateMany = { data: Record<string, unknown>[] };

describe("registrarLancamento: dados fiscais do XML", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });

  it("grava CRT do emitente na nota e NCM + IBS/CBS por item", async () => {
    const nfe = nfeDaFixture("nfe-ibscbs-crt3-vnftot.xml");
    const l = lancamento({
      chaveNfe: CHAVE,
      crtEmitente: nfe.crtEmitente,
      totalCents: nfe.totalCents,
      itens: itensDoXml(nfe),
      parcelas: [{ numero: 1, valorCents: nfe.totalCents, vencimento: "2027-03-12" }],
      dataCompra: nfe.dataEmissao,
    });
    expect(await registrarLancamento(l, { forcar: true }, comoPrisma(db))).toMatchObject({ ok: true });

    expect(db.notaFiscal.create.mock.calls[0][0]).toMatchObject({ data: { crtEmitente: "3", totalCents: 62_116 } });
    const { data } = db.itemNota.createMany.mock.calls[0][0] as DadosCreateMany;
    expect(data[0]).toMatchObject({
      ncm: "25232910",
      nbs: null,
      cst: "000",
      cClassTrib: "000001",
      ibsCbsBaseCents: 35_000,
      pCbs: "8.8",
      pIbsUf: "0.05",
      pIbsMun: "0.05",
      cbsCents: 3_080,
      ibsUfCents: 18,
      ibsMunCents: 18,
    });
    expect(data[1]).toMatchObject({ cst: "410", cClassTrib: "410999", cbsCents: null });
    // o item acessório do IBS/CBS por fora não tem tributação própria
    expect(data[2]).toMatchObject({ tipo: "ENCARGO", totalCents: 3_116, cst: null, ncm: null });
  });

  it("lançamento manual: colunas fiscais nulas e CRT fora da nota", async () => {
    await registrarLancamento(lancamento(), {}, comoPrisma(db));
    const { data } = db.itemNota.createMany.mock.calls[0][0] as DadosCreateMany;
    expect(data[0]).toMatchObject({ ncm: null, cst: null, cbsCents: null, pCbs: null });
    expect(db.notaFiscal.create.mock.calls[0][0]).not.toHaveProperty("data.crtEmitente");
  });

  it("edição pelo formulário: o item de mesma descrição mantém NCM e IBS/CBS; o CRT gravado não é tocado", async () => {
    db.itemNota.findMany.mockResolvedValue([gravado()]);
    await registrarLancamento(lancamento({ id: "nota-1" }), { forcar: true }, comoPrisma(db));
    const { data } = db.itemNota.createMany.mock.calls[0][0] as DadosCreateMany;
    expect(data[0]).toMatchObject({ ncm: "25232910", cst: "000", cbsCents: 880, pCbs: "8.8", pRedCbs: null });
    expect(db.notaFiscal.update.mock.calls[0][0]).not.toHaveProperty("data.crtEmitente");
    // lê antes de apagar: senão não haveria o que herdar
    expect(db.itemNota.findMany.mock.invocationCallOrder[0]).toBeLessThan(db.itemNota.deleteMany.mock.invocationCallOrder[0]);
  });

  it("criação não consulta itens gravados", async () => {
    await registrarLancamento(lancamento(), {}, comoPrisma(db));
    expect(db.itemNota.findMany).not.toHaveBeenCalled();
  });
});

describe("herdarDadosFiscais", () => {
  const item = lancamento().itens[0];

  it("descrição trocada ou item novo ficam sem dados fiscais", () => {
    const [r] = herdarDadosFiscais([{ ...item, descricao: "Cimento CP IV" }], [gravado()]);
    expect(r).toEqual({ ...item, descricao: "Cimento CP IV" });
  });

  it("descrições repetidas herdam na ordem, uma vez cada; espaços nas pontas não contam", () => {
    const r = herdarDadosFiscais(
      [item, { ...item, descricao: " Cimento CP II " }, item],
      [gravado({ cbsCents: 1 }), gravado({ cbsCents: 2 })],
    );
    expect(r.map((i) => i.ibsCbs?.cbsCents ?? null)).toEqual([1, 2, null]);
  });

  it("item que já traz qualquer dado fiscal não herda (vale o que veio)", () => {
    const [r] = herdarDadosFiscais([{ ...item, ibsCbs: null }], [gravado()]);
    expect(r.ibsCbs).toBeNull();
    expect(r.ncm).toBeUndefined();
  });

  it("gravado sem CST ou cClassTrib herda só NCM/NBS", () => {
    const [r] = herdarDadosFiscais([item], [gravado({ cst: null })]);
    expect(r).toMatchObject({ ncm: "25232910", nbs: null, ibsCbs: null });
  });

  it("decimais do banco viram texto e a descrição não vaza para a tributação", () => {
    const [r] = herdarDadosFiscais([item], [gravado()]);
    expect(r.ibsCbs).toEqual({
      cst: "000",
      cClassTrib: "000001",
      ibsCbsBaseCents: 10_000,
      pCbs: "8.8",
      pIbsUf: "0.05",
      pIbsMun: "0.05",
      pRedCbs: null,
      pRedIbs: null,
      cbsCents: 880,
      ibsUfCents: 5,
      ibsMunCents: 5,
      ibsCbsDiferidoCents: null,
      cCredPres: null,
      credPresCents: null,
    });
  });
});
