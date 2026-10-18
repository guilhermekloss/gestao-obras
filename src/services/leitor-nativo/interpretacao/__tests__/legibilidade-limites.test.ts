import { describe, expect, it } from "vitest";
import { documentoVazio } from "../comum";
import { construirDoc } from "../documento";
import { avaliarLegibilidade, cobertura, confianca, consistente } from "../legibilidade";
import { montarTexto, type OpcoesTexto } from "./auxiliar";
import type { DocumentoLido } from "../../../leitura-documento";

const doc = (texto: string, opcoes: OpcoesTexto = {}) => construirDoc(montarTexto(texto, opcoes));
const lidoCom = (tipo: DocumentoLido["tipo"], extra: Partial<DocumentoLido> = {}): DocumentoLido => ({ ...documentoVazio(tipo), ...extra });
const TEXTO_LONGO = "ALFA BRAVO CHARLIE DELTA ECO FOXTROT GOLF HOTEL INDIA JULIETT KILO LIMA MIKE NOVEMBER OSCAR PAPA QUEBEC";

describe("confianca", () => {
  it("usa a confiança média do documento, em 0..1 ou 0..100", () => {
    expect(confianca(doc("X", { confianca: 0.7 }))).toBe(0.7);
    expect(confianca(doc("X", { confianca: 70 }))).toBe(0.7);
    expect(confianca(doc("X", { confianca: 1 }))).toBe(1);
    expect(confianca(doc("X", { confianca: 0 }))).toBe(0);
    expect(confianca(doc("X", { confianca: 100 }))).toBe(1);
  });

  it("sem média: PDF com texto vale 1", () => {
    expect(confianca(doc("X", { confianca: null, origem: "pdf-texto" }))).toBe(1);
  });

  it("sem média e sem confiança nas linhas: 0,8", () => {
    const d = doc("AAAA", { confianca: null, origem: "ocr-local" });
    d.linhas.forEach((l) => (l.confianca = null));
    expect(confianca(d)).toBe(0.8);
  });

  it("sem média: média das linhas ponderada pelo tamanho do texto", () => {
    const d = doc("AAAA\nBBBBBBBB", { confianca: null, origem: "ocr-local" });
    d.linhas[0].confianca = 0.5;
    d.linhas[1].confianca = 0.8;
    expect(confianca(d)).toBeCloseTo(0.7);
    d.linhas[0].confianca = 50;
    d.linhas[1].confianca = 80;
    expect(confianca(d)).toBeCloseTo(0.7);
  });

  it("linhas sem confiança ficam fora da média", () => {
    const d = doc("AAAA\nBBBBBBBB", { confianca: null, origem: "ocr-local" });
    d.linhas[0].confianca = null;
    d.linhas[1].confianca = 0.6;
    expect(confianca(d)).toBeCloseTo(0.6);
  });
});

describe("cobertura", () => {
  it("NF-e: chave, CNPJ, número, data, total e itens", () => {
    const cheio = lidoCom("NFE", {
      chaveAcesso: "1",
      emitente: { nome: null, documento: "1", telefone: null },
      numero: "1",
      dataEmissao: "2026-01-01",
      valorTotal: 0,
      itens: [{ descricao: "x", quantidade: 1, unidade: "UN", valorUnitario: 1, desconto: null, valorTotal: 1, tipo: "MATERIAL" }],
    });
    expect(cobertura(cheio, false)).toBe(1);
    expect(cobertura({ ...cheio, chaveAcesso: null }, false)).toBeCloseTo(5 / 6);
    expect(cobertura({ ...cheio, numero: null }, false)).toBeCloseTo(5 / 6);
    expect(cobertura({ ...cheio, itens: [] }, false)).toBeCloseTo(5 / 6);
    expect(cobertura({ ...cheio, valorTotal: null }, false)).toBeCloseTo(5 / 6);
    expect(cobertura(lidoCom("NFE"), false)).toBe(0);
  });

  it("NFC-e não exige número", () => {
    const cheio = lidoCom("NFCE", {
      chaveAcesso: "1",
      emitente: { nome: null, documento: "1", telefone: null },
      dataEmissao: "2026-01-01",
      valorTotal: 1,
      itens: [{ descricao: "x", quantidade: 1, unidade: "UN", valorUnitario: 1, desconto: null, valorTotal: 1, tipo: "MATERIAL" }],
    });
    expect(cobertura(cheio, false)).toBe(1);
    expect(cobertura({ ...cheio, itens: [] }, false)).toBeCloseTo(4 / 5);
  });

  it("NFS-e: número, CNPJ, data e total", () => {
    const cheio = lidoCom("NFSE", { numero: "1", emitente: { nome: null, documento: "1", telefone: null }, dataEmissao: "2026-01-01", valorTotal: 1 });
    expect(cobertura(cheio, false)).toBe(1);
    expect(cobertura({ ...cheio, numero: null }, false)).toBeCloseTo(3 / 4);
  });

  it("boleto: código, total, vencimento e nome do beneficiário", () => {
    const cheio = lidoCom("BOLETO", { valorTotal: 1, parcelas: [{ vencimento: "2026-01-01", valor: 1 }], emitente: { nome: "X", documento: null, telefone: null } });
    expect(cobertura(cheio, true)).toBe(1);
    expect(cobertura(cheio, false)).toBeCloseTo(3 / 4);
    expect(cobertura({ ...cheio, parcelas: [] }, true)).toBeCloseTo(3 / 4);
    expect(cobertura({ ...cheio, emitente: { nome: null, documento: null, telefone: null } }, true)).toBeCloseTo(3 / 4);
  });

  it("guia: código, total, vencimento e documento do contribuinte", () => {
    const cheio = lidoCom("GUIA", { valorTotal: 1, parcelas: [{ vencimento: "2026-01-01", valor: 1 }], destinatario: { nome: null, documento: "1" } });
    expect(cobertura(cheio, true)).toBe(1);
    expect(cobertura({ ...cheio, destinatario: { nome: null, documento: null } }, true)).toBeCloseTo(3 / 4);
  });

  it("recibo: total, data e nome", () => {
    const cheio = lidoCom("RECIBO", { valorTotal: 1, dataEmissao: "2026-01-01", emitente: { nome: "X", documento: null, telefone: null } });
    expect(cobertura(cheio, false)).toBe(1);
    expect(cobertura({ ...cheio, dataEmissao: null }, false)).toBeCloseTo(2 / 3);
  });

  it("outro: total, data e nome ou documento do emitente", () => {
    const cheio = lidoCom("OUTRO", { valorTotal: 1, dataEmissao: "2026-01-01", emitente: { nome: null, documento: "1", telefone: null } });
    expect(cobertura(cheio, false)).toBe(1);
    expect(cobertura({ ...cheio, emitente: { nome: "X", documento: null, telefone: null } }, false)).toBe(1);
    expect(cobertura({ ...cheio, emitente: { nome: null, documento: null, telefone: null } }, false)).toBeCloseTo(2 / 3);
  });

  it("valor total zero conta como lido; nulo, não", () => {
    expect(cobertura(lidoCom("RECIBO", { valorTotal: 0 }), false)).toBeCloseTo(1 / 3);
    expect(cobertura(lidoCom("RECIBO", { valorTotal: null }), false)).toBe(0);
  });

  it("não é documento: sempre completo", () => {
    expect(cobertura(lidoCom("NAO_E_DOCUMENTO"), false)).toBe(1);
  });
});

describe("consistente", () => {
  it("documentos com dígito errado deixam de ser consistentes", () => {
    expect(consistente(lidoCom("NFE"))).toBe(true);
    expect(consistente(lidoCom("NFE", { emitente: { nome: null, documento: "11222333000181", telefone: null } }))).toBe(true);
    expect(consistente(lidoCom("NFE", { emitente: { nome: null, documento: "11222333000182", telefone: null } }))).toBe(false);
    expect(consistente(lidoCom("NFE", { destinatario: { nome: null, documento: "98765432000198" } }))).toBe(true);
    expect(consistente(lidoCom("NFE", { destinatario: { nome: null, documento: "98765432000199" } }))).toBe(false);
  });

  it("parcelas têm de somar o total, com folga de 1 centavo", () => {
    const com = (soma: number) => lidoCom("NFE", { valorTotal: 100, parcelas: [{ vencimento: "2026-01-01", valor: soma }] });
    expect(consistente(com(100))).toBe(true);
    expect(consistente(com(100.01))).toBe(true);
    expect(consistente(com(99.99))).toBe(true);
    expect(consistente(com(100.02))).toBe(false);
    expect(consistente(com(99.98))).toBe(false);
    expect(consistente(lidoCom("NFE", { valorTotal: 100, parcelas: [{ vencimento: "2026-01-01", valor: null as never }] }))).toBe(false);
  });

  it("sem total ou sem parcelas, não confere", () => {
    expect(consistente(lidoCom("NFE", { valorTotal: null, parcelas: [{ vencimento: "2026-01-01", valor: 5 }] }))).toBe(true);
    expect(consistente(lidoCom("NFE", { valorTotal: 100, parcelas: [] }))).toBe(true);
  });

  it("itens mais frete e outras despesas, menos desconto, têm de dar o total", () => {
    const item = (valorTotal: number | null) => ({ descricao: "x", quantidade: 1, unidade: "UN", valorUnitario: 1, desconto: null, valorTotal, tipo: "MATERIAL" as const });
    const base = { valorTotal: 110, itens: [item(60), item(40)], valorFrete: 20, valorOutrasDespesas: 5, descontoGeral: 15 };
    expect(consistente(lidoCom("NFE", base))).toBe(true);
    expect(consistente(lidoCom("NFE", { ...base, valorTotal: 111 }))).toBe(false);
    expect(consistente(lidoCom("NFE", { ...base, valorFrete: null }))).toBe(false);
    expect(consistente(lidoCom("NFE", { ...base, valorOutrasDespesas: null }))).toBe(false);
    expect(consistente(lidoCom("NFE", { ...base, descontoGeral: null }))).toBe(false);
    expect(consistente(lidoCom("NFE", { ...base, valorTotal: 110.01 }))).toBe(true);
    expect(consistente(lidoCom("NFE", { ...base, itens: [item(60), item(null)] }))).toBe(false);
  });

  it("sem itens ou sem total, não confere", () => {
    expect(consistente(lidoCom("NFE", { valorTotal: 50, itens: [] }))).toBe(true);
    expect(consistente(lidoCom("NFE", { valorTotal: null, valorFrete: 5 }))).toBe(true);
  });
});

describe("avaliarLegibilidade", () => {
  const cheioRecibo = lidoCom("RECIBO", { valorTotal: 10, dataEmissao: "2026-01-01", emitente: { nome: "X", documento: null, telefone: null } });
  const avalia = (lido: DocumentoLido, opcoesTexto: OpcoesTexto = {}, extra: { incompleto?: boolean } = {}, texto = TEXTO_LONGO) =>
    avaliarLegibilidade(doc(texto, opcoesTexto), lido, { temCodigoPagamento: false, ...extra });

  it("boa: confiança alta, cobertura completa, consistente e completo", () => {
    expect(avalia(cheioRecibo, { confianca: 0.9 })).toBe("BOA");
    expect(avalia(cheioRecibo, { confianca: 0.8 })).toBe("BOA");
  });

  it("parcial: confiança abaixo de 0,8, cobertura abaixo de 0,9, inconsistente ou incompleto", () => {
    expect(avalia(cheioRecibo, { confianca: 0.79 })).toBe("PARCIAL");
    expect(avalia({ ...cheioRecibo, dataEmissao: null }, { confianca: 0.9 })).toBe("PARCIAL");
    expect(avalia({ ...cheioRecibo, emitente: { nome: "X", documento: "11222333000182", telefone: null } }, { confianca: 0.9 })).toBe("PARCIAL");
    expect(avalia(cheioRecibo, { confianca: 0.9 }, { incompleto: true })).toBe("PARCIAL");
  });

  it("ruim: confiança abaixo de 0,55, cobertura abaixo de 0,35 ou pouco texto", () => {
    expect(avalia(cheioRecibo, { confianca: 0.54 })).toBe("RUIM");
    expect(avalia(cheioRecibo, { confianca: 0.55 })).toBe("PARCIAL");
    expect(avalia(lidoCom("RECIBO"), { confianca: 0.9 })).toBe("RUIM");
    expect(avalia({ ...cheioRecibo, dataEmissao: null, emitente: { nome: null, documento: null, telefone: null } }, { confianca: 0.9 })).toBe("RUIM");
    expect(avalia(cheioRecibo, { confianca: 0.9 }, {}, "ALFA BRAVO")).toBe("RUIM");
  });

  it("80 letras e dígitos são o mínimo de texto", () => {
    expect(avalia(cheioRecibo, { confianca: 0.9 }, {}, "A".repeat(80))).toBe("BOA");
    expect(avalia(cheioRecibo, { confianca: 0.9 }, {}, "A".repeat(79))).toBe("RUIM");
  });

  it("cobertura de um terço fica no limite de 0,35", () => {
    expect(avalia({ ...cheioRecibo, dataEmissao: null, emitente: { nome: null, documento: null, telefone: null } }, { confianca: 0.9 })).toBe("RUIM");
    expect(avalia({ ...cheioRecibo, dataEmissao: null }, { confianca: 0.9 })).toBe("PARCIAL");
  });

  it("não é documento: ruim com confiança baixa ou pouco texto; boa com confiança alta; senão parcial", () => {
    const nd = lidoCom("NAO_E_DOCUMENTO");
    expect(avalia(nd, { confianca: 0.5 })).toBe("RUIM");
    expect(avalia(nd, { confianca: 0.9 }, {}, "ALFA BRAVO")).toBe("RUIM");
    expect(avalia(nd, { confianca: 0.9 })).toBe("BOA");
    expect(avalia(nd, { confianca: 0.8 })).toBe("BOA");
    expect(avalia(nd, { confianca: 0.7 })).toBe("PARCIAL");
    expect(avalia(nd, { confianca: 0.55 })).toBe("PARCIAL");
    expect(avalia(nd, { confianca: 0.9 }, {}, "A".repeat(40))).toBe("BOA");
    expect(avalia(nd, { confianca: 0.9 }, {}, "A".repeat(39))).toBe("RUIM");
  });

  it("o código de pagamento entra na cobertura de boleto", () => {
    const boleto = lidoCom("BOLETO", { valorTotal: 1, parcelas: [{ vencimento: "2026-01-01", valor: 1 }], emitente: { nome: "X", documento: null, telefone: null } });
    expect(avaliarLegibilidade(doc(TEXTO_LONGO, { confianca: 0.9 }), boleto, { temCodigoPagamento: true })).toBe("BOA");
    expect(avaliarLegibilidade(doc(TEXTO_LONGO, { confianca: 0.9 }), boleto, { temCodigoPagamento: false })).toBe("PARCIAL");
  });
});
