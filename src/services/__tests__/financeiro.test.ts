import { describe, it, expect } from "vitest";
import {
  exigeNumero,
  fluxoMensal,
  FORMA_PAGTO_LABELS,
  gerarNumeroDocumento,
  parseTipoDocumento,
} from "../financeiro";

describe("fluxoMensal", () => {
  it("distribui parcelas por mês e obra conforme o rateio", () => {
    const fluxo = fluxoMensal([
      {
        valorCents: 10000,
        vencimento: new Date(2026, 0, 20),
        rateios: [
          { obraId: "L03", fracaoBp: 6000 },
          { obraId: "L19", fracaoBp: 4000 },
        ],
      },
      {
        valorCents: 5000,
        vencimento: new Date(2026, 1, 20),
        rateios: [{ obraId: "L03", fracaoBp: 10000 }],
      },
    ]);

    expect(fluxo.meses).toEqual(["2026-01", "2026-02"]);
    expect(fluxo.valores["2026-01"]["L03"]).toBe(6000);
    expect(fluxo.valores["2026-01"]["L19"]).toBe(4000);
    expect(fluxo.valores["2026-02"]["L03"]).toBe(5000);
    expect(fluxo.totalPorObra["L03"]).toBe(11000);
    expect(fluxo.totalPorMes["2026-01"]).toBe(10000);
  });

  it("lida com lista vazia", () => {
    const fluxo = fluxoMensal([]);
    expect(fluxo.meses).toEqual([]);
    expect(fluxo.obras).toEqual([]);
  });
});

describe("gerarNumeroDocumento", () => {
  it("começa em 0001 quando o fornecedor não tem documentos do tipo", () => {
    expect(gerarNumeroDocumento("RECIBO", [])).toBe("REC-0001");
    expect(gerarNumeroDocumento("FOLHA", ["123", "NF-9"])).toBe("FOL-0001");
  });

  it("segue a partir do maior número do mesmo prefixo, ignorando lacunas", () => {
    expect(gerarNumeroDocumento("RECIBO", ["REC-0001", "REC-0003"])).toBe("REC-0004");
  });

  it("cada tipo tem sua própria sequência", () => {
    const existentes = ["REC-0007", "GUIA-0002", "DOC-0001"];
    expect(gerarNumeroDocumento("GUIA", existentes)).toBe("GUIA-0003");
    expect(gerarNumeroDocumento("OUTRO", existentes)).toBe("DOC-0002");
    expect(gerarNumeroDocumento("FOLHA", existentes)).toBe("FOL-0001");
  });

  it("ignora números digitados que só se parecem com o padrão", () => {
    expect(gerarNumeroDocumento("RECIBO", ["REC-12A", "XREC-0009", "REC-"])).toBe("REC-0001");
  });

  it("passa de 9999 sem truncar", () => {
    expect(gerarNumeroDocumento("RECIBO", ["REC-9999"])).toBe("REC-10000");
  });
});

describe("exigeNumero / parseTipoDocumento", () => {
  it("só NF exige número", () => {
    expect(exigeNumero("NF")).toBe(true);
    expect(exigeNumero("RECIBO")).toBe(false);
    expect(exigeNumero("GUIA")).toBe(false);
  });

  it("interpreta o filtro da URL, ignorando valores inválidos", () => {
    expect(parseTipoDocumento("FOLHA")).toBe("FOLHA");
    expect(parseTipoDocumento("")).toBeUndefined();
    expect(parseTipoDocumento("nf")).toBeUndefined();
    expect(parseTipoDocumento(undefined)).toBeUndefined();
  });
});

describe("FORMA_PAGTO_LABELS", () => {
  it("inclui transferência e dinheiro", () => {
    expect(FORMA_PAGTO_LABELS.TRANSFERENCIA).toBe("Transferência");
    expect(FORMA_PAGTO_LABELS.DINHEIRO).toBe("Dinheiro");
  });
});
