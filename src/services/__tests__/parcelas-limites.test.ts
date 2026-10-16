import { describe, expect, it } from "vitest";
import { avisoParcelasPagas, dividirValor, gerarParcelas, reconciliarParcelas, type ParcelaExistente } from "../parcelas";

describe("dividirValor / gerarParcelas: entradas inválidas", () => {
  it("recusa menos de 1 parcela, com mensagem", () => {
    expect(() => dividirValor(1000, 0)).toThrow("Número de parcelas deve ser ≥ 1");
  });
  it("recusa total zero e negativo, com mensagem", () => {
    const base = { numParcelas: 1, formaPagto: "PIX" as const, dataCompra: new Date(2026, 0, 10) };
    expect(() => gerarParcelas({ ...base, totalCents: 0 })).toThrow("Total deve ser maior que zero");
    expect(() => gerarParcelas({ ...base, totalCents: -1 })).toThrow("Total deve ser maior que zero");
  });
});

describe("reconciliarParcelas: ordenação do resultado", () => {
  const paga = (numero: number): ParcelaExistente => ({
    numero,
    valorCents: 1000,
    vencimento: "2026-01-10",
    status: "PAGA",
    pagaEm: new Date(2026, 0, 10),
  });

  it("devolve removidas e pagas afetadas em ordem crescente, qualquer que seja a ordem de entrada", () => {
    const r = reconciliarParcelas(
      [paga(3), paga(10), paga(2), paga(1)],
      [{ numero: 3, valorCents: 999, vencimento: "2026-01-10" }],
    );
    expect(r.removidas).toEqual([1, 2, 10]);
    expect(r.pagasAfetadas).toEqual([
      { numero: 1, motivo: "removida" },
      { numero: 2, motivo: "removida" },
      { numero: 3, motivo: "alterada" },
      { numero: 10, motivo: "removida" },
    ]);
  });
});

describe("avisoParcelasPagas: composição da frase", () => {
  it("só removida, no singular", () => {
    expect(avisoParcelasPagas([{ numero: 2, motivo: "removida" }])).toBe(
      "A 2ª parcela, já paga, foi removida. O registro desse pagamento será perdido.",
    );
  });
  it("só removidas, no plural", () => {
    expect(
      avisoParcelasPagas([
        { numero: 2, motivo: "removida" },
        { numero: 3, motivo: "removida" },
      ]),
    ).toBe("As parcelas 2ª e 3ª, já pagas, foram removidas. O registro desses pagamentos será perdido.");
  });
  it("lista com três ou mais separa por vírgula e o último por 'e'", () => {
    expect(
      avisoParcelasPagas([
        { numero: 1, motivo: "alterada" },
        { numero: 2, motivo: "alterada" },
        { numero: 3, motivo: "alterada" },
      ]),
    ).toBe(
      "As parcelas 1ª, 2ª e 3ª, já pagas, foram alteradas e voltam a ficar em aberto. O registro desses pagamentos será perdido.",
    );
  });
  it("uma alterada e uma removida", () => {
    expect(
      avisoParcelasPagas([
        { numero: 1, motivo: "alterada" },
        { numero: 2, motivo: "removida" },
      ]),
    ).toBe(
      "A 1ª parcela, já paga, foi alterada e volta a ficar em aberto; a 2ª parcela, já paga, foi removida. O registro desses pagamentos será perdido.",
    );
  });
});
