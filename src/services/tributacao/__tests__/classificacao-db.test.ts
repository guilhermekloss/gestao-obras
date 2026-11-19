import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { carregarClassificacoes } = await import("../classificacao-db");

const linha = {
  codigo: "200038",
  inicioVigencia: new Date("2026-01-01T00:00:00Z"),
  fimVigencia: new Date("2026-12-31T00:00:00Z"),
  cst: "200",
  descricaoCst: "Alíquota reduzida",
  descricao: "Fornecimento dos insumos agropecuários e aquícolas (Anexo IX)",
  tipoAliquota: "Padrão",
  nomenclatura: "NBS ou NCM",
  pRedCbs: { toString: () => "60" },
  pRedIbs: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
  creditoPresumidoFornecedor: false,
  indEstornoCredito: false,
  indCreditoPresumidoOperacao: false,
  creditoOperacaoAntecedente: "Manutenção",
  indReducao: true,
  indDiferimento: false,
};

function banco() {
  return { classificacaoTributaria: { findMany: vi.fn(async (_: object) => [linha]) } };
}

describe("carregarClassificacoes", () => {
  it("datas @db.Date em aaaa-mm-dd pelo UTC (sem voltar um dia no fuso local) e reduções em texto", async () => {
    const db = banco();
    const [c] = await carregarClassificacoes(["200038"], db as never);
    expect(c).toMatchObject({ inicioVigencia: "2026-01-01", fimVigencia: "2026-12-31", pRedCbs: "60", pRedIbs: null });
  });

  it("filtra pelos códigos sem repetir e ignora vazios; lista vazia nem consulta", async () => {
    const db = banco();
    await carregarClassificacoes(["200038", null, "200038", "", "000001"], db as never);
    expect(db.classificacaoTributaria.findMany.mock.calls[0][0]).toMatchObject({ where: { codigo: { in: ["200038", "000001"] } } });
    expect(await carregarClassificacoes([null], db as never)).toEqual([]);
    expect(db.classificacaoTributaria.findMany).toHaveBeenCalledTimes(1);
  });

  it("sem códigos, a tabela inteira", async () => {
    const db = banco();
    await carregarClassificacoes(undefined, db as never);
    expect(db.classificacaoTributaria.findMany.mock.calls[0][0]).toMatchObject({ where: undefined });
  });
});
