import { describe, it, expect } from "vitest";
import {
  avisoParcelasPagas,
  gerarParcelas,
  dividirValor,
  reconciliarParcelas,
  validarParcelas,
  type ParcelaExistente,
} from "../parcelas";

describe("dividirValor", () => {
  it("divide valor exato sem resto", () => {
    expect(dividirValor(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it("joga o resto do arredondamento na primeira parcela", () => {
    // R$ 100,00 em 3x → 33,34 + 33,33 + 33,33
    expect(dividirValor(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("soma das parcelas é sempre o total (propriedade)", () => {
    for (const total of [1, 99, 10001, 265432187]) {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const soma = dividirValor(total, n).reduce((a, b) => a + b, 0);
        expect(soma).toBe(total);
      }
    }
  });

  it("rejeita n < 1", () => {
    expect(() => dividirValor(1000, 0)).toThrow();
  });
});

describe("gerarParcelas", () => {
  const dataCompra = new Date(2026, 0, 15); // 15/01/2026

  it("PIX é sempre 1 parcela à vista na data da compra", () => {
    const p = gerarParcelas({
      totalCents: 50000,
      numParcelas: 3, // ignorado para PIX
      formaPagto: "PIX",
      dataCompra,
    });
    expect(p).toHaveLength(1);
    expect(p[0].valorCents).toBe(50000);
    expect(p[0].vencimento).toEqual(dataCompra);
  });

  it("DÉBITO é à vista como PIX", () => {
    const p = gerarParcelas({
      totalCents: 1234,
      numParcelas: 1,
      formaPagto: "DEBITO",
      dataCompra,
    });
    expect(p).toHaveLength(1);
    expect(p[0].vencimento).toEqual(dataCompra);
  });

  it("DINHEIRO é à vista como PIX", () => {
    const p = gerarParcelas({
      totalCents: 9000,
      numParcelas: 3, // ignorado
      formaPagto: "DINHEIRO",
      dataCompra,
    });
    expect(p).toHaveLength(1);
    expect(p[0].vencimento).toEqual(dataCompra);
  });

  it("TRANSFERÊNCIA: 1ª na data da compra, demais mês a mês", () => {
    const p = gerarParcelas({
      totalCents: 30000,
      numParcelas: 3,
      formaPagto: "TRANSFERENCIA",
      dataCompra,
    });
    expect(p.map((x) => x.vencimento)).toEqual([
      dataCompra,
      new Date(2026, 1, 15),
      new Date(2026, 2, 15),
    ]);
  });

  it("TRANSFERÊNCIA em 1x vence na data da compra", () => {
    const p = gerarParcelas({ totalCents: 100, numParcelas: 1, formaPagto: "TRANSFERENCIA", dataCompra });
    expect(p).toEqual([{ numero: 1, valorCents: 100, vencimento: dataCompra }]);
  });

  it("CARTÃO vence dia 20 do mês seguinte, uma parcela por mês", () => {
    const p = gerarParcelas({
      totalCents: 30000,
      numParcelas: 3,
      formaPagto: "CARTAO",
      dataCompra, // compra em jan → vencimentos 20/fev, 20/mar, 20/abr
    });
    expect(p.map((x) => [x.vencimento.getDate(), x.vencimento.getMonth()])).toEqual([
      [20, 1],
      [20, 2],
      [20, 3],
    ]);
  });

  it("BOLETO parcela mês a mês a partir do mês seguinte", () => {
    const p = gerarParcelas({
      totalCents: 20000,
      numParcelas: 2,
      formaPagto: "BOLETO",
      dataCompra,
    });
    expect(p[0].vencimento).toEqual(new Date(2026, 1, 15));
    expect(p[1].vencimento).toEqual(new Date(2026, 2, 15));
  });

  it("compra dia 31 ajusta para o último dia de mês mais curto", () => {
    const p = gerarParcelas({
      totalCents: 10000,
      numParcelas: 1,
      formaPagto: "BOLETO",
      dataCompra: new Date(2026, 0, 31), // 31/jan → fev tem 28
    });
    expect(p[0].vencimento).toEqual(new Date(2026, 1, 28));
  });

  it("soma das parcelas geradas = total, sempre", () => {
    const p = gerarParcelas({
      totalCents: 99999,
      numParcelas: 6,
      formaPagto: "CARTAO",
      dataCompra,
    });
    expect(p.reduce((a, x) => a + x.valorCents, 0)).toBe(99999);
  });
});

describe("validarParcelas", () => {
  it("aceita quando soma bate", () => {
    expect(validarParcelas([{ valorCents: 600 }, { valorCents: 400 }], 1000).ok).toBe(true);
  });

  it("rejeita e informa a diferença quando não bate", () => {
    const r = validarParcelas([{ valorCents: 600 }, { valorCents: 300 }], 1000);
    expect(r.ok).toBe(false);
    expect(r.diferencaCents).toBe(-100);
  });
});

describe("reconciliarParcelas", () => {
  const pagaEm = new Date(2026, 1, 10);
  const paga = (numero: number, valorCents: number, vencimento: string): ParcelaExistente => ({
    numero,
    valorCents,
    vencimento,
    status: "PAGA",
    pagaEm,
  });
  const aberta = (numero: number, valorCents: number, vencimento: string): ParcelaExistente => ({
    numero,
    valorCents,
    vencimento,
    status: "ABERTA",
    pagaEm: null,
  });

  it("nota nova: todas as parcelas são criadas abertas, sem aviso", () => {
    const r = reconciliarParcelas([], [{ numero: 1, valorCents: 1000, vencimento: "2026-02-15" }]);
    expect(r.parcelas).toEqual([
      { numero: 1, valorCents: 1000, vencimento: "2026-02-15", acao: "criar", status: "ABERTA", pagaEm: null },
    ]);
    expect(r.removidas).toEqual([]);
    expect(r.pagasAfetadas).toEqual([]);
  });

  it("preserva status e pagaEm quando valor e vencimento não mudaram", () => {
    const r = reconciliarParcelas(
      [paga(1, 5000, "2026-02-15"), aberta(2, 5000, "2026-03-15")],
      [
        { numero: 1, valorCents: 5000, vencimento: "2026-02-15" },
        { numero: 2, valorCents: 5000, vencimento: "2026-03-15" },
      ],
    );
    expect(r.parcelas.map((p) => [p.numero, p.acao, p.status, p.pagaEm])).toEqual([
      [1, "manter", "PAGA", pagaEm],
      [2, "manter", "ABERTA", null],
    ]);
    expect(r.pagasAfetadas).toEqual([]);
  });

  it("parcela paga com valor alterado volta a ABERTA e gera aviso", () => {
    const r = reconciliarParcelas(
      [paga(1, 5000, "2026-02-15")],
      [{ numero: 1, valorCents: 6000, vencimento: "2026-02-15" }],
    );
    expect(r.parcelas[0]).toMatchObject({ acao: "atualizar", status: "ABERTA", pagaEm: null, valorCents: 6000 });
    expect(r.pagasAfetadas).toEqual([{ numero: 1, motivo: "alterada" }]);
  });

  it("parcela paga com vencimento alterado também volta a ABERTA", () => {
    const r = reconciliarParcelas(
      [paga(1, 5000, "2026-02-15")],
      [{ numero: 1, valorCents: 5000, vencimento: "2026-02-20" }],
    );
    expect(r.parcelas[0]).toMatchObject({ acao: "atualizar", status: "ABERTA" });
    expect(r.pagasAfetadas).toEqual([{ numero: 1, motivo: "alterada" }]);
  });

  it("alterar parcela ABERTA atualiza sem aviso", () => {
    const r = reconciliarParcelas(
      [paga(1, 5000, "2026-02-15"), aberta(2, 5000, "2026-03-15")],
      [
        { numero: 1, valorCents: 5000, vencimento: "2026-02-15" },
        { numero: 2, valorCents: 7000, vencimento: "2026-04-15" },
      ],
    );
    expect(r.parcelas[1]).toMatchObject({ acao: "atualizar", status: "ABERTA" });
    expect(r.pagasAfetadas).toEqual([]);
  });

  it("remover parcela PAGA gera aviso; remover ABERTA não", () => {
    const r = reconciliarParcelas(
      [paga(1, 5000, "2026-02-15"), paga(2, 5000, "2026-03-15"), aberta(3, 5000, "2026-04-15")],
      [{ numero: 1, valorCents: 15000, vencimento: "2026-02-15" }],
    );
    expect(r.removidas).toEqual([2, 3]);
    expect(r.pagasAfetadas).toEqual([
      { numero: 1, motivo: "alterada" },
      { numero: 2, motivo: "removida" },
    ]);
  });

  it("aumentar o número de parcelas cria as novas e mantém as pagas", () => {
    const r = reconciliarParcelas(
      [paga(1, 5000, "2026-02-15")],
      [
        { numero: 1, valorCents: 5000, vencimento: "2026-02-15" },
        { numero: 2, valorCents: 5000, vencimento: "2026-03-15" },
      ],
    );
    expect(r.parcelas.map((p) => p.acao)).toEqual(["manter", "criar"]);
    expect(r.pagasAfetadas).toEqual([]);
  });

  it("rejeita número de parcela repetido", () => {
    expect(() =>
      reconciliarParcelas([], [
        { numero: 1, valorCents: 1, vencimento: "2026-02-15" },
        { numero: 1, valorCents: 1, vencimento: "2026-03-15" },
      ]),
    ).toThrow(/repetida/);
  });
});

describe("avisoParcelasPagas", () => {
  it("null quando nenhuma parcela paga é afetada", () => {
    expect(avisoParcelasPagas([])).toBeNull();
  });

  it("singular para uma parcela alterada", () => {
    expect(avisoParcelasPagas([{ numero: 2, motivo: "alterada" }])).toBe(
      "A 2ª parcela, já paga, foi alterada e volta a ficar em aberto. O registro desse pagamento será perdido.",
    );
  });

  it("junta alteradas e removidas no plural", () => {
    expect(
      avisoParcelasPagas([
        { numero: 1, motivo: "alterada" },
        { numero: 2, motivo: "alterada" },
        { numero: 3, motivo: "removida" },
      ]),
    ).toBe(
      "As parcelas 1ª e 2ª, já pagas, foram alteradas e voltam a ficar em aberto; a 3ª parcela, já paga, foi removida. O registro desses pagamentos será perdido.",
    );
  });
});
