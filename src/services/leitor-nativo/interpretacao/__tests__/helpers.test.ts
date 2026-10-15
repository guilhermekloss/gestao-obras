import { describe, expect, it } from "vitest";
import {
  arrecadacaoDaLinha,
  arrecadacaoDasBarras,
  boletoDaLinha,
  boletoDasBarras,
  chaveDosCodigos,
  chaveNfseNoTexto,
  chaveNoTexto,
  codigoPagamentoNoTexto,
  lerQrNfce,
  vencimentoDoFator,
} from "../codigos";
import {
  chaveAcessoValida,
  chaveNfseValida,
  cnpjValido,
  corrigirChave,
  corrigirDocumento,
  cpfValido,
  dadosChaveNfe,
  dadosChaveNfse,
  dvsCnpj,
  encontrarDocumentos,
  modulo10,
  modulo11Arrecadacao,
  modulo11Boleto,
} from "../digitos";
import {
  anoCompleto,
  corrigirOcrNumerico,
  encontrarDatas,
  encontrarValores,
  extensoParaNumero,
  formatarReais,
  lerData,
  lerDecimal,
  lerValor,
  normalizarTexto,
} from "../normalizacao";

const CHAVE_NFE = "35260911222333000181550010000123451876543218";
const CHAVE_NFCE = "35261011222333000181650010000007891135724688";
const CHAVE_ALFA = "35261012ABC34501DE35550010000000421246813577";
const CHAVE_NFSE = "35503082211222333000181000000000012326101234567898";
const LINHA_BOLETO = "34191.09123 34567.821235 45678.900007 1 16150000123456";
const BARRAS_BOLETO = "34191161500001234561091234567821234567890000";
const LINHA_DAS = "85800000004-6 56780328072-9 02609123456-9 78901234567-5";
const BARRAS_DAS = "85800000004567803280720260912345678901234567";

describe("normalização de texto e valores", () => {
  it("normalizarTexto mantém o comprimento e tira acentos", () => {
    const s = "Emissão: Nº 1 — Serviço";
    const n = normalizarTexto(s);
    expect(n).toBe("EMISSAO: Nº 1 — SERVICO");
    expect(n.length).toBe(s.length);
  });

  it.each([
    ["1.234,56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["R$1.234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["RS 12,50", 12.5],
    ["R5 12,50", 12.5],
    ["1234.56", 1234.56],
    ["1.234", 1234],
    ["150", 150],
    ["-3,00", -3],
    ["1.8OO,OO", 1800],
    ["0,00", 0],
  ])("lerValor(%s) = %s", (s, v) => {
    expect(lerValor(s)).toBe(v);
  });

  it("lerValor recusa texto", () => {
    expect(lerValor("ABC")).toBeNull();
    expect(lerValor("")).toBeNull();
    expect(lerValor(null)).toBeNull();
  });

  it("lerDecimal aceita quantidades e unitários com várias casas", () => {
    expect(lerDecimal("20,0000")).toBe(20);
    expect(lerDecimal("32,9000")).toBe(32.9);
    expect(lerDecimal("3,5")).toBe(3.5);
    expect(lerDecimal("1.234,5678")).toBe(1234.5678);
    expect(lerDecimal("1.500")).toBe(1500);
    expect(lerDecimal("2,000")).toBe(2);
  });

  it("encontrarValores acha valores e ignora quantidades, percentuais e descrições", () => {
    const v = encontrarValores("SC 20,0000 32,9000 658,00 alíquota 5,00% VERGALHAO 10,0MM total R$ 1.675,50 e R$ 1 234,56");
    expect(v.map((x) => x.valor)).toEqual([658, 1675.5, 1234.56]);
  });

  it("corrigirOcrNumerico só mexe em tokens quase numéricos", () => {
    expect(corrigirOcrNumerico("2O26")).toBe("2026");
    expect(corrigirOcrNumerico("SOLDA")).toBe("SOLDA");
    expect(corrigirOcrNumerico("SOLDA", true)).toBe("5010A");
  });

  it("formatarReais", () => {
    expect(formatarReais(1234.5)).toBe("R$ 1.234,50");
    expect(formatarReais(0.07)).toBe("R$ 0,07");
    expect(formatarReais(1000000)).toBe("R$ 1.000.000,00");
  });
});

describe("datas", () => {
  it.each([
    ["15/09/2026", "2026-09-15"],
    ["15.09.2026", "2026-09-15"],
    ["15-09-2026", "2026-09-15"],
    ["15/09/26", "2026-09-15"],
    ["2026-09-15", "2026-09-15"],
    ["São Paulo, 15 de setembro de 2026", "2026-09-15"],
    ["1º de março de 2026", "2026-03-01"],
    ["15/set/2026", "2026-09-15"],
    ["15/O9/2026", "2026-09-15"],
    ["emitida 15/10/2026 09:12:45", "2026-10-15"],
  ])("lerData(%s) = %s", (s, iso) => {
    expect(lerData(s)).toBe(iso);
  });

  it("recusa datas impossíveis e códigos parecidos com data", () => {
    expect(lerData("31/02/2026")).toBeNull();
    expect(lerData("07.02.01")).toBeNull();
    expect(lerData("Número 07.20.26291.2345678-9")).toBeNull();
    expect(lerData("Nosso Número 109/12345678-2")).toBeNull();
  });

  it("encontrarDatas devolve todas na ordem", () => {
    expect(encontrarDatas("de 01/10/2026 a 10 de outubro de 2026").map((d) => d.valor)).toEqual(["2026-10-01", "2026-10-10"]);
  });

  it("ano com 2 dígitos usa a referência", () => {
    expect(anoCompleto(26)).toBe(2026);
    expect(anoCompleto(99)).toBe(1999);
    expect(anoCompleto(28, 2026)).toBe(1928);
    expect(anoCompleto(27, 2026)).toBe(2027);
  });

  it("valor por extenso", () => {
    expect(extensoParaNumero("mil e quinhentos reais")).toBe(1500);
    expect(extensoParaNumero("dois mil, trezentos e quarenta e cinco reais e sessenta centavos")).toBe(2345.6);
    expect(extensoParaNumero("cinquenta centavos")).toBe(0.5);
    expect(extensoParaNumero("um milhão de reais")).toBe(1000000);
    expect(extensoParaNumero("valor combinado")).toBeNull();
  });
});

describe("dígitos verificadores", () => {
  it("CNPJ numérico (exemplo da especificação)", () => {
    expect(dvsCnpj("112223330001")).toBe("81");
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("98.765.432/0001-98")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });

  it("CNPJ alfanumérico: exemplo da Receita e o 1º CNPJ real", () => {
    expect(dvsCnpj("12ABC34501DE")).toBe("35");
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("00.000.000/E08G-12")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-36")).toBe(false);
  });

  it("CPF", () => {
    expect(cpfValido("123.456.789-09")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });

  it("chave de acesso (numérica, NFC-e e com CNPJ alfanumérico)", () => {
    expect(chaveAcessoValida(CHAVE_NFE)).toBe(true);
    expect(chaveAcessoValida(CHAVE_NFCE)).toBe(true);
    expect(chaveAcessoValida(CHAVE_ALFA)).toBe(true);
    expect(chaveAcessoValida(CHAVE_NFE.slice(0, 43) + "9")).toBe(false);
    expect(dadosChaveNfe(CHAVE_NFE)).toMatchObject({ cnpj: "11222333000181", modelo: "55", serie: "1", numero: "12345", ano: 2026, mes: 9 });
    expect(dadosChaveNfe(CHAVE_ALFA).cnpj).toBe("12ABC34501DE35");
  });

  it("chave da NFS-e nacional (50)", () => {
    expect(chaveNfseValida(CHAVE_NFSE)).toBe(true);
    expect(dadosChaveNfse(CHAVE_NFSE)).toMatchObject({ municipio: "3550308", documento: "11222333000181", numero: "123" });
  });

  it("módulos de boleto e arrecadação (exemplos da especificação)", () => {
    expect(modulo10("341910912")).toBe(3);
    expect(modulo10("3456782123")).toBe(5);
    expect(modulo10("4567890000")).toBe(7);
    expect(modulo11Boleto("3419161500001234561091234567821234567890000")).toBe(1);
    expect(modulo11Arrecadacao("858" + "00000045678" + "0328" + "0720260912345678901234567")).toBe(0);
    expect(modulo11Arrecadacao("85800000004")).toBe(6);
    expect(modulo11Arrecadacao("56780328072")).toBe(9);
  });

  it("corrige CNPJ com O/0 trocados só quando o DV fecha", () => {
    expect(corrigirDocumento("11.222.333/OOO1-81")).toMatchObject({ valor: "11222333000181", valido: true, corrigido: true });
    expect(corrigirDocumento("11.222.333/0001-8l")).toMatchObject({ valor: "11222333000181", valido: true });
    expect(corrigirDocumento("123.456.789-O9")).toMatchObject({ valor: "12345678909", valido: true, tipo: "CPF" });
    expect(corrigirDocumento("12.ABC.345/01DE-35")).toMatchObject({ valor: "12ABC34501DE35", valido: true, corrigido: false });
    expect(corrigirDocumento("11.222.333/0001-99")).toMatchObject({ valor: "11222333000199", valido: false });
  });

  it("corrige chave com letras nas posições numéricas", () => {
    const lida = CHAVE_NFE.replace(/^3526/, "3S26").replace("0181", "O18l");
    expect(corrigirChave(lida)).toBe(CHAVE_NFE);
    expect(corrigirChave(CHAVE_ALFA)).toBe(CHAVE_ALFA);
  });

  it("encontra CNPJ/CPF no texto, inclusive com ruído de OCR", () => {
    const docs = encontrarDocumentos("CNPJ: 11.222.333/OOO1-81 IE: 110.042.490.114 CPF 123.456.789-09 tel (11) 3333-4444");
    expect(docs.map((d) => [d.valor, d.valido])).toEqual([
      ["11222333000181", true],
      ["12345678909", true],
    ]);
    expect(encontrarDocumentos("CNPJ 98765432000198", true)[0]?.valor).toBe("98765432000198");
    expect(encontrarDocumentos("protocolo 98765432000198")).toEqual([]);
  });
});

describe("códigos", () => {
  it("chave no texto em 11 grupos de 4, com e sem ruído", () => {
    expect(chaveNoTexto("CHAVE 3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218")).toEqual({ chave: CHAVE_NFE, valida: true });
    expect(chaveNoTexto("3526 O911 2223 33OO 0181 5500 1000 0123 4518 7654 3218")?.chave).toBe(CHAVE_NFE);
    expect(chaveNoTexto(CHAVE_NFCE)?.chave).toBe(CHAVE_NFCE);
    expect(chaveNoTexto("3526 1012 ABC3 4501 DE35 5500 1000 0000 4212 4681 3577")?.chave).toBe(CHAVE_ALFA);
    expect(chaveNoTexto("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3219")).toEqual({
      chave: "35260911222333000181550010000123451876543219",
      valida: false,
    });
  });

  it("chave NFS-e (50)", () => {
    expect(chaveNfseNoTexto(`Chave ${CHAVE_NFSE}`)).toBe(CHAVE_NFSE);
    expect(chaveNfseNoTexto("35503082211222333000181000000000012326101234567899")).toBeNull();
  });

  it("QR Code da NFC-e: v2 online, v3 offline e v1", () => {
    expect(lerQrNfce(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE_NFCE}|2|1|1|DBC72319076AE674E49D848CD22C7DBC374663B9`)).toMatchObject({
      chave: CHAVE_NFCE,
      versao: "2",
      ambiente: "1",
      valor: null,
    });
    expect(lerQrNfce(`https://x/qr?p=${CHAVE_NFCE}|3|1|15|98.50|2|12345678909|QVNTSU5B`)).toMatchObject({
      versao: "3",
      dia: 15,
      valor: 98.5,
      destinatario: "12345678909",
    });
    expect(lerQrNfce(`https://x/qr?chNFe=${CHAVE_NFCE}&nVersao=100&tpAmb=1&vNF=98.50`)).toMatchObject({ versao: "1", valor: 98.5 });
    expect(lerQrNfce("https://x/qr?p=35261011222333000181650010000007891135724689|2|1")).toBeNull();
    expect(chaveDosCodigos([{ formato: "CODE128", texto: CHAVE_NFE, pagina: 1 }])?.chave).toBe(CHAVE_NFE);
  });

  it("boleto: linha 47 ↔ barras 44, valor e fator", () => {
    const b = boletoDaLinha(LINHA_BOLETO);
    expect(b).toMatchObject({ barras: BARRAS_BOLETO, banco: "341", fator: 1615, valor: 1234.56 });
    expect(boletoDasBarras(BARRAS_BOLETO)?.valor).toBe(1234.56);
    expect(boletoDaLinha(LINHA_BOLETO.replace("34191.09123", "34191.09124"))).toBeNull();
    expect(codigoPagamentoNoTexto(`341-7 | ${LINHA_BOLETO}`)?.tipo).toBe("BOLETO");
  });

  it("fator de vencimento com o reinício de 22/02/2025", () => {
    expect(vencimentoDoFator(1615)).toBe("2026-10-30");
    expect(vencimentoDoFator(1615, "2026-09-15")).toBe("2026-10-30");
    expect(vencimentoDoFator(1615, "2002-03-01")).toBe("2002-03-10");
    expect(vencimentoDoFator(9999, "2025-02-01")).toBe("2025-02-21");
    expect(vencimentoDoFator(1000, "2025-03-01")).toBe("2025-02-22");
    expect(vencimentoDoFator(0)).toBeNull();
  });

  it("arrecadação: linha 48 ↔ barras 44 e valor efetivo", () => {
    const a = arrecadacaoDaLinha(LINHA_DAS);
    expect(a).toMatchObject({ barras: BARRAS_DAS, segmento: "5", identificadorValor: "8", valor: 456.78, orgao: "0328" });
    expect(arrecadacaoDasBarras(BARRAS_DAS)?.valor).toBe(456.78);
    expect(arrecadacaoDaLinha(LINHA_DAS.replace("-6", "-7"))).toBeNull();
    expect(codigoPagamentoNoTexto(LINHA_DAS)?.tipo).toBe("ARRECADACAO");
  });
});
