import { describe, expect, it } from "vitest";
import { classificar, pontuar } from "../classificacao";
import { documentoVazio, encontrarAncoras, formaPagamentoDoTexto, tipoDoItem } from "../comum";
import { construirDoc } from "../documento";
import { lerLinhaProduto } from "../interpretes/danfe";
import { lerCaudaItem } from "../interpretes/nfce";
import { parcelasDoTrecho, telefoneDoTrecho } from "../interpretes/auxiliares";
import { cobertura, confianca, consistente } from "../legibilidade";
import { dataDe, documentoDe, numeroDe, rotulosDaLinha, textoDe, unidadesDaLinha, valorDe } from "../rotulos";
import { montarTexto, type OpcoesTexto } from "./auxiliar";
import { BOLETO, DANFE, DAS, NAO_DOCUMENTO, NFCE, NFSE_NACIONAL, NFSE_SP, RECIBO } from "./fixtures";

const doc = (texto: string, opcoes: OpcoesTexto = {}) => construirDoc(montarTexto(texto, opcoes));

describe("documento", () => {
  it("tokens com posição real e células pelos vãos", () => {
    const d = doc("NOME          CNPJ\nCONSTRUTORA X   98.765.432/0001-98");
    expect(d.comPosicoes).toBe(true);
    expect(d.linhas[0].tokens.map((t) => t.celula)).toEqual([0, 1]);
    expect(d.linhas[1].tokens[0].x0).toBeCloseTo(0);
    expect(doc("A B", { posicoes: false }).comPosicoes).toBe(false);
  });
});

describe("rótulos", () => {
  it("o rótulo mais longo vence a sobreposição", () => {
    const d = doc("BASE DE CÁLC. DO ICMS  VALOR DO ICMS  BASE DE CÁLC. ICMS S.T.  VALOR DO ICMS SUBST.  V. TOTAL PRODUTOS");
    expect(rotulosDaLinha(d.linhas[0]).map((o) => o.chave)).toEqual(["BC_ICMS", "V_ICMS", "BC_ST", "V_ST", "V_PROD"]);
    const b = doc("CPF/CNPJ do Beneficiário: 11.222.333/0001-81");
    expect(rotulosDaLinha(b.linhas[0]).map((o) => o.chave)).toEqual(["CNPJ_BENEFICIARIO"]);
  });

  it("valor na mesma linha, até o próximo rótulo", () => {
    const d = doc("Nosso Número 109/12345678-2   Vencimento 30/10/2026   Valor do Documento R$ 1.234,56");
    expect(dataDe(d, ["VENCIMENTO"])).toBe("2026-10-30");
    expect(valorDe(d, ["VALOR_DOCUMENTO"])).toBe(1234.56);
    expect(numeroDe(d, ["NOSSO_NUMERO"])).toBe("109/12345678-2");
  });

  it.each<[string, OpcoesTexto]>([
    ["com posições", {}],
    ["sem posições", { posicoes: false }],
    ["texto corrido", { posicoes: false, colapsar: true }],
  ])("valor na linha de baixo, na coluna do rótulo (%s)", (_n, opcoes) => {
    const d = doc(
      "VALOR DO FRETE  VALOR DO SEGURO  DESCONTO  OUTRAS DESPESAS  VALOR TOTAL IPI  V. TOTAL DA NOTA\n80,00           0,00             5,00      0,00             19,47            1.675,50",
      opcoes,
    );
    expect(valorDe(d, ["V_FRETE"])).toBe(80);
    expect(valorDe(d, ["DESCONTO"])).toBe(5);
    expect(valorDe(d, ["V_IPI"])).toBe(19.47);
    expect(valorDe(d, ["V_NF"])).toBe(1675.5);
  });

  it("com posições, coluna vazia não pega o valor do vizinho", () => {
    const d = doc("INSCRIÇÃO ESTADUAL  INSCRIÇÃO ESTADUAL DO SUBST. TRIB.  CNPJ\n110.042.490.114                                         11.222.333/0001-81");
    expect(numeroDe(d, ["IE_ST"])).toBeNull();
    expect(documentoDe(d, ["CNPJ"])?.valor).toBe("11222333000181");
  });

  it("texto: nome sem o CNPJ anexado", () => {
    const d = doc("Pagador: CONSTRUTORA EXEMPLO LTDA - CNPJ 98.765.432/0001-98");
    expect(textoDe(d, ["PAGADOR"])).toBe("CONSTRUTORA EXEMPLO LTDA");
    expect(documentoDe(d, ["PAGADOR"])?.valor).toBe("98765432000198");
  });

  it("unidades de valor juntam R$, data+hora e telefone", () => {
    const d = doc("R$ 5.000,00 15/10/2026 09:12:45 (11) 3333-4444 Retido pelo Tomador 5,00 %", { colapsar: true });
    expect(unidadesDaLinha(d.linhas[0]).map((u) => u.texto)).toEqual([
      "R$ 5.000,00",
      "15/10/2026 09:12:45",
      "(11) 3333-4444",
      "Retido pelo Tomador",
      "5,00 %",
    ]);
  });
});

describe("classificação", () => {
  it.each([
    [DANFE, "NFE"],
    [NFCE, "NFCE"],
    [NFSE_NACIONAL, "NFSE"],
    [NFSE_SP, "NFSE"],
    [BOLETO, "BOLETO"],
    [DAS, "GUIA"],
    [RECIBO, "RECIBO"],
    [NAO_DOCUMENTO, "NAO_E_DOCUMENTO"],
  ])("%#: %s", (texto, tipo) => {
    const d = doc(texto);
    expect(classificar(d, encontrarAncoras(d))).toBe(tipo);
  });

  it("sem âncoras, pela pontuação", () => {
    const semChave = DANFE.replace("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218", "");
    const d = doc(semChave);
    expect(pontuar(d).NFE).toBeGreaterThanOrEqual(5);
    expect(classificar(d, encontrarAncoras(d))).toBe("NFE");
  });

  it("palavra BOLETO nas informações complementares não muda o tipo", () => {
    const semChave = DANFE.replace("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218", "");
    const d = doc(semChave);
    expect(classificar(d, encontrarAncoras(d))).toBe("NFE");
  });

  it("texto curto demais não é documento", () => {
    const d = doc("R$ 10,00");
    expect(classificar(d, encontrarAncoras(d))).toBe("NAO_E_DOCUMENTO");
  });
});

describe("intérpretes: peças", () => {
  it("linha de produto do DANFE ancorada em NCM/CST/CFOP", () => {
    expect(lerLinhaProduto("000456 VERGALHAO CA-50 10,0MM BARRA 12M 72142000 000 5102 BR 15,0000 38,5000 577,50 577,50 103,95 0,00 18,00 0,00")).toMatchObject({
      codigo: "000456",
      descricao: "VERGALHAO CA-50 10,0MM BARRA 12M",
      ncm: "72142000",
      cst: "000",
      cfop: "5102",
      unidade: "BR",
      numeros: ["15,0000", "38,5000", "577,50", "577,50", "103,95", "0,00", "18,00", "0,00"],
    });
    expect(lerLinhaProduto("CÓDIGO PRODUTO DESCRIÇÃO NCM/SH")).toBeNull();
    expect(lerLinhaProduto("NERVURADO")).toBeNull();
  });

  it("cauda de item de NFC-e em várias grafias", () => {
    expect(lerCaudaItem("001 789 CIMENTO CP II 50KG 3 SC x 32,90 98,70".split(" "))).toMatchObject({
      quantidade: 3,
      unidade: "SC",
      unitario: 32.9,
      total: 98.7,
      inicio: 6,
    });
    expect(lerCaudaItem("10UN X 1,85 18,50".split(" "))).toMatchObject({ quantidade: 10, unidade: "UN", total: 18.5 });
    expect(lerCaudaItem("2,000 KG 6,90 13,80 T1".split(" "))).toMatchObject({ quantidade: 2, unidade: "KG", total: 13.8 });
    expect(lerCaudaItem("LUVA PVC SOLDAVEL 25MM".split(" "))).toBeNull();
  });

  it("parcelas pela ordem quando datas e valores vêm em linhas separadas", () => {
    const d = doc("FATURA\nNum. 001   Num. 002\nVenc. 15/10/2026   Venc. 14/11/2026\nValor R$ 1.677,66   Valor R$ 1.677,66");
    expect(parcelasDoTrecho(d, { de: 0, ate: 4 })).toEqual([
      { vencimento: "2026-10-15", valor: 1677.66 },
      { vencimento: "2026-11-14", valor: 1677.66 },
    ]);
  });

  it("telefone depois de FONE/TEL", () => {
    expect(telefoneDoTrecho("SAO PAULO - SP  FONE: (11) 2222-3333")).toBe("(11) 2222-3333");
    expect(telefoneDoTrecho("Fone: (11) 98888-7777")).toBe("(11) 98888-7777");
    expect(telefoneDoTrecho("CEP 01001-000")).toBeNull();
  });

  it("forma de pagamento e tipo do item por palavras-chave", () => {
    expect(formaPagamentoDoTexto("Pagamento Instantâneo (PIX) 98,50")).toBe("PIX");
    expect(formaPagamentoDoTexto("Cartão de Débito")).toBe("DEBITO");
    expect(formaPagamentoDoTexto("Cartão de Crédito")).toBe("CARTAO");
    expect(formaPagamentoDoTexto("Dinheiro 50,00")).toBe("DINHEIRO");
    expect(formaPagamentoDoTexto("PAGAMENTO VIA BOLETO BANCARIO")).toBe("BOLETO");
    expect(formaPagamentoDoTexto("Transferência bancária")).toBe("TRANSFERENCIA");
    expect(formaPagamentoDoTexto("à vista")).toBe("NAO_INFORMADA");
    expect(tipoDoItem("FRETE ENTREGA")).toBe("FRETE");
    expect(tipoDoItem("mão de obra de assentamento")).toBe("SERVICO");
    expect(tipoDoItem("MONTAGEM", "MATERIAL", "5933")).toBe("SERVICO");
    expect(tipoDoItem("CIMENTO")).toBe("MATERIAL");
  });
});

describe("legibilidade: peças", () => {
  it("confiança aceita 0..1, 0..100 e PDF sem confiança", () => {
    expect(confianca(doc("X", { confianca: 0.7 }))).toBe(0.7);
    expect(confianca(doc("X", { confianca: 70 }))).toBe(0.7);
    expect(confianca(doc("X", { confianca: null, origem: "pdf-texto" }))).toBe(1);
  });

  it("cobertura e consistência", () => {
    const lido = { ...documentoVazio("RECIBO"), valorTotal: 10, dataEmissao: "2026-10-10" };
    expect(cobertura(lido, false)).toBeCloseTo(2 / 3);
    expect(consistente(lido)).toBe(true);
    expect(consistente({ ...lido, emitente: { nome: null, documento: "11222333000182", telefone: null } })).toBe(false);
    expect(consistente({ ...lido, parcelas: [{ vencimento: "2026-11-10", valor: 9 }] })).toBe(false);
  });
});
