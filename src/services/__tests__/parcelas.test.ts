import { describe, it, expect } from "vitest";
import { gerarParcelas, dividirValor, validarParcelas } from "../parcelas";

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
