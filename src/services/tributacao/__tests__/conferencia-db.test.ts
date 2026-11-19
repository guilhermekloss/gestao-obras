import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { carregarReferenciasConferencia, analisarIbsCbsDaNota } = await import("../conferencia-db");

const classificacao = {
  codigo: "000001",
  inicioVigencia: new Date("2026-01-01T00:00:00Z"),
  fimVigencia: null,
  cst: "000",
  descricaoCst: "Tributação integral",
  descricao: "Situações tributadas integralmente",
  tipoAliquota: "Padrão",
  nomenclatura: "Não possui",
  pRedCbs: null,
  pRedIbs: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
  creditoPresumidoFornecedor: false,
  indEstornoCredito: false,
  indCreditoPresumidoOperacao: false,
  creditoOperacaoAntecedente: null,
  indReducao: false,
  indDiferimento: false,
};

const nomenclatura = {
  id: 1,
  tipo: "NCM",
  codigo: "2523",
  cClassTrib: "000001",
  excecao: false,
  itemLc116: null,
  cIndOp: null,
  inicioVigencia: new Date("2026-01-01T00:00:00Z"),
  fimVigencia: new Date("2026-12-31T00:00:00Z"),
};

function banco() {
  return {
    classificacaoTributaria: { findMany: vi.fn(async (_: object) => [classificacao]) },
    classificacaoNomenclatura: { findMany: vi.fn(async (_: object) => [nomenclatura]) },
  };
}

describe("carregarReferenciasConferencia", () => {
  it("uma consulta por tabela para todos os códigos, sem repetir nem usar vazios", async () => {
    const db = banco();
    await carregarReferenciasConferencia(["000001", null, "000001", "", "200003", undefined], db as never);
    expect(db.classificacaoTributaria.findMany).toHaveBeenCalledTimes(1);
    expect(db.classificacaoNomenclatura.findMany).toHaveBeenCalledTimes(1);
    expect(db.classificacaoNomenclatura.findMany.mock.calls[0][0]).toEqual({ where: { cClassTrib: { in: ["000001", "200003"] } } });
  });

  it("converte as vigências para aaaa-mm-dd pelo UTC", async () => {
    const { nomenclaturas, classificacoes } = await carregarReferenciasConferencia(["000001"], banco() as never);
    expect(nomenclaturas).toEqual([
      { tipo: "NCM", codigo: "2523", cClassTrib: "000001", excecao: false, inicioVigencia: "2026-01-01", fimVigencia: "2026-12-31" },
    ]);
    expect(classificacoes[0]).toMatchObject({ inicioVigencia: "2026-01-01", fimVigencia: null });
  });

  it("vigência sem fim vira nula", async () => {
    const db = banco();
    db.classificacaoNomenclatura.findMany.mockResolvedValue([{ ...nomenclatura, fimVigencia: null as never }]);
    const { nomenclaturas } = await carregarReferenciasConferencia(["000001"], db as never);
    expect(nomenclaturas[0].fimVigencia).toBeNull();
  });

  it("sem códigos não vai ao banco", async () => {
    const db = banco();
    expect(await carregarReferenciasConferencia([null, undefined], db as never)).toEqual({ classificacoes: [], nomenclaturas: [] });
    expect(await carregarReferenciasConferencia([], db as never)).toEqual({ classificacoes: [], nomenclaturas: [] });
    expect(db.classificacaoTributaria.findMany).not.toHaveBeenCalled();
    expect(db.classificacaoNomenclatura.findMany).not.toHaveBeenCalled();
  });
});

describe("analisarIbsCbsDaNota", () => {
  const dec = (s: string) => ({ toString: () => s });
  const itemGravado = {
    ncm: "25232910",
    nbs: null,
    cst: "000",
    cClassTrib: "000001",
    ibsCbsBaseCents: 1_000_000,
    pCbs: dec("0.9000"),
    pIbsUf: dec("0.1000"),
    pIbsMun: null,
    pRedCbs: null,
    pRedIbs: null,
    cbsCents: 9_000,
    ibsUfCents: 1_000,
    ibsMunCents: null,
    ibsCbsDiferidoCents: null,
  };
  const manual = { ...itemGravado, ncm: null, cst: null, cClassTrib: null, ibsCbsBaseCents: null, pCbs: null, pIbsUf: null, cbsCents: null, ibsUfCents: null };

  it("lê o banco uma vez para todos os itens e calcula o crédito", async () => {
    const db = banco();
    const r = await analisarIbsCbsDaNota(
      { dataCompra: new Date(2027, 2, 10, 12), crtEmitente: "3", itens: [itemGravado, itemGravado] },
      "REGULAR",
      db as never,
    );
    expect(db.classificacaoTributaria.findMany).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ temDados: true, achados: [], creditoCents: 20_000, destacadoCents: 20_000 });
    expect(r.itens[0]).toMatchObject({ classificacaoDescricao: "Situações tributadas integralmente", credito: { situacao: "PERMITIDO" } });
  });

  it("2026 é ano de teste: destacado, mas sem crédito", async () => {
    const r = await analisarIbsCbsDaNota({ dataCompra: new Date(2026, 5, 10, 12), crtEmitente: "3", itens: [itemGravado] }, "REGULAR", banco() as never);
    expect(r).toMatchObject({ creditoCents: 0, destacadoCents: 10_000 });
    expect(r.itens[0].credito.situacao).toBe("PERIODO_TESTE");
  });

  it("nota sem dados de IBS/CBS: sem seção, e nem consulta o banco", async () => {
    const db = banco();
    const r = await analisarIbsCbsDaNota({ dataCompra: new Date(2026, 5, 10, 12), crtEmitente: null, itens: [manual] }, "REGULAR", db as never);
    expect(r).toMatchObject({ temDados: false, achados: [], creditoCents: 0 });
    expect(db.classificacaoTributaria.findMany).not.toHaveBeenCalled();
  });

  it("regime normal sem destaque gera o aviso da nota, mesmo sem dados por item", async () => {
    const r = await analisarIbsCbsDaNota({ dataCompra: new Date(2027, 0, 5, 12), crtEmitente: "3", itens: [manual] }, "REGULAR", banco() as never);
    expect(r.temDados).toBe(false);
    expect(r.achados.map((a) => a.codigo)).toEqual(["SEM_DESTAQUE_DO_FORNECEDOR"]);
  });
});
