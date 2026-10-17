import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  parseNfeXml,
  decimalParaInteiro,
  unitarioCoerente,
  mapearFormaPagto,
  formatarDocumento,
  variantesDocumento,
  parcelasDaNfe,
  type Nfe,
} from "../nfe-xml";
import { calcularTotalItem, somaItens } from "../rateio";
import { validarParcelas } from "../parcelas";

const fixture = (nome: string) => readFileSync(path.join(__dirname, "fixtures", nome), "utf8");

function nfeOk(xml: string): Nfe {
  const r = parseNfeXml(xml);
  if (!r.ok) throw new Error(`esperava NF-e válida, veio: ${r.erro}`);
  return r.nfe;
}

describe("decimalParaInteiro", () => {
  it("converte sem ponto flutuante, arredondando meio-para-cima", () => {
    expect(decimalParaInteiro("1234.56", 2)).toBe(123456);
    expect(decimalParaInteiro("0.1", 2)).toBe(10);
    expect(decimalParaInteiro("12.345", 2)).toBe(1235);
    expect(decimalParaInteiro("12.3449", 2)).toBe(1234);
    expect(decimalParaInteiro("1.2345", 3)).toBe(1235);
    expect(decimalParaInteiro("38.9000000000", 2)).toBe(3890);
    expect(decimalParaInteiro("7", 2)).toBe(700);
  });

  it("recusa texto não numérico", () => {
    expect(decimalParaInteiro("abc", 2)).toBeNull();
    expect(decimalParaInteiro("-1.00", 2)).toBeNull();
    expect(decimalParaInteiro("1,50", 2)).toBeNull();
    expect(decimalParaInteiro(undefined, 2)).toBeNull();
  });
});

describe("unitarioCoerente", () => {
  it("mantém o unitário do XML quando ele reproduz vProd", () => {
    expect(unitarioCoerente(40, 3890, 155600)).toEqual({ unitCents: 3890, ajusteCents: 0 });
    expect(unitarioCoerente(0.5, 333, 167)).toEqual({ unitCents: 333, ajusteCents: 0 });
  });

  it("frações de centavo: menor unitário que alcança vProd, excesso vira desconto", () => {
    expect(unitarioCoerente(3, 33, 100)).toEqual({ unitCents: 34, ajusteCents: 2 });
    expect(unitarioCoerente(1000, 1, 1490)).toEqual({ unitCents: 2, ajusteCents: 510 });
    expect(unitarioCoerente(4, 249, 1000)).toEqual({ unitCents: 250, ajusteCents: 0 });
  });

  it("o total resultante é sempre o vProd do XML", () => {
    for (const [qtde, unit, vProd] of [
      [3, 33, 100],
      [1.235, 1000, 1235],
      [2.333, 1234, 2879],
      [0.001, 1, 1],
      [7.5, 13, 98],
    ]) {
      const r = unitarioCoerente(qtde, unit, vProd);
      expect(calcularTotalItem(qtde, r.unitCents, r.ajusteCents)).toBe(vProd);
      expect(r.ajusteCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("mapearFormaPagto", () => {
  it("mapeia os códigos tPag da SEFAZ", () => {
    expect(mapearFormaPagto("01")).toBe("DINHEIRO");
    expect(mapearFormaPagto("03")).toBe("CARTAO");
    expect(mapearFormaPagto("04")).toBe("DEBITO");
    expect(mapearFormaPagto("15")).toBe("BOLETO");
    expect(mapearFormaPagto("16")).toBe("TRANSFERENCIA");
    expect(mapearFormaPagto("17")).toBe("PIX");
    expect(mapearFormaPagto("18")).toBe("TRANSFERENCIA");
    expect(mapearFormaPagto("20")).toBe("PIX");
  });

  it("cai em BOLETO para códigos sem equivalente ou ausentes", () => {
    expect(mapearFormaPagto("05")).toBe("BOLETO");
    expect(mapearFormaPagto("99")).toBe("BOLETO");
    expect(mapearFormaPagto(undefined)).toBe("BOLETO");
  });
});

describe("formatarDocumento / variantesDocumento", () => {
  it("formata CNPJ e CPF", () => {
    expect(formatarDocumento("12345678000195")).toBe("12.345.678/0001-95");
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("123")).toBe("123");
  });

  it("gera as grafias com e sem máscara", () => {
    expect(variantesDocumento("12.345.678/0001-95")).toEqual(["12345678000195", "12.345.678/0001-95"]);
  });
});

describe("parseNfeXml — 1 item, envelope nfeProc, sem duplicata", () => {
  const nfe = nfeOk(fixture("nfe-1-item.xml"));

  it("lê cabeçalho e emitente", () => {
    expect(nfe.chave).toBe("35260998765432000110550010000012341876543210");
    expect(nfe.chave).toHaveLength(44);
    expect(nfe.numero).toBe("1234");
    expect(nfe.serie).toBe("1");
    expect(nfe.dataEmissao).toBe("2026-09-02");
    expect(nfe.emitente).toEqual({
      documento: "98765432000110",
      tipoDocumento: "CNPJ",
      razaoSocial: "TINTAS EXEMPLO COMERCIO LTDA",
      fone: "1133334444",
    });
  });

  it("lê o item em centavos e com unidade em maiúsculas", () => {
    expect(nfe.itens).toEqual([
      {
        descricao: "TINTA ACRILICA FOSCA BRANCA 18L",
        codigo: "TA-018",
        ncm: "32091010",
        qtde: 2,
        unidade: "GL",
        unitCents: 38990,
        descontoCents: 0,
        totalCents: 77980,
        origem: "PRODUTO",
        tipoSugerido: "MATERIAL",
      },
    ]);
    expect(nfe.totalCents).toBe(77980);
  });

  it("sem cobr: nenhuma duplicata, forma PIX e parcela única na emissão", () => {
    expect(nfe.duplicatas).toEqual([]);
    expect(nfe.formaPagto).toBe("PIX");
    expect(parcelasDaNfe(nfe)).toEqual([{ numero: 1, valorCents: 77980, vencimento: "2026-09-02" }]);
    expect(nfe.avisos).toEqual([]);
  });
});

describe("parseNfeXml — vários itens e duplicatas, <NFe> sem envelope", () => {
  const nfe = nfeOk(fixture("nfe-varios-itens.xml"));

  it("lê cabeçalho; data de emissão no fuso do emissor", () => {
    expect(nfe.chave).toBe("35260912345678000195550010000045211123456789");
    expect(nfe.numero).toBe("4521");
    expect(nfe.dataEmissao).toBe("2026-09-14");
    expect(nfe.emitente.documento).toBe("12345678000195");
    expect(nfe.totalCents).toBe(223635);
    expect(nfe.formaPagto).toBe("BOLETO");
  });

  it("produtos: desconto, quantidade com 3 casas e unitário coerente com vProd", () => {
    const produtos = nfe.itens.filter((i) => i.origem === "PRODUTO");
    expect(produtos.map((i) => [i.descricao, i.qtde, i.unidade, i.unitCents, i.descontoCents, i.totalCents])).toEqual([
      ["CIMENTO CP II-E-32 50KG", 40, "SC", 3890, 5600, 150000],
      ["VERGALHAO CA50 8,0MM 12M", 12, "BR", 5275, 0, 63300],
      ["ARAME RECOZIDO N 18", 1.235, "KG", 1000, 0, 1235],
      ["ESPACADOR PLASTICO 25MM", 3, "PC", 34, 2, 100],
    ]);
    expect(produtos.map((i) => i.ncm)).toEqual(["25232910", "72142000", "72172090", "39269090"]);
  });

  it("frete e IPI viram itens próprios; a soma dos itens fecha em vNF", () => {
    const extras = nfe.itens.filter((i) => i.origem !== "PRODUTO");
    expect(extras.map((i) => [i.descricao, i.tipoSugerido, i.totalCents])).toEqual([
      ["Frete (NF-e)", "FRETE", 8000],
      ["Impostos e despesas acessórias (IPI, ST, seguro, outras)", "ENCARGO", 1000],
    ]);
    expect(somaItens(nfe.itens)).toBe(nfe.totalCents);
  });

  it("todo item tem total = calcularTotalItem(qtde, unitário, desconto)", () => {
    for (const i of nfe.itens) {
      expect(i.totalCents).toBe(calcularTotalItem(i.qtde, i.unitCents, i.descontoCents));
    }
  });

  it("lê as duplicatas e as converte em parcelas que fecham com o total", () => {
    expect(nfe.duplicatas).toEqual([
      { numero: "001", vencimento: "2026-10-14", valorCents: 74545 },
      { numero: "002", vencimento: "2026-11-13", valorCents: 74545 },
      { numero: "003", vencimento: "2026-12-13", valorCents: 74545 },
    ]);
    const parcelas = parcelasDaNfe(nfe);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(validarParcelas(parcelas, nfe.totalCents).ok).toBe(true);
    expect(nfe.avisos).toEqual([]);
  });
});

describe("parseNfeXml — variações de formato", () => {
  const base = fixture("nfe-1-item.xml");

  it("aceita prefixo de namespace (nfe:NFe, nfe:infNFe...)", () => {
    const comPrefixo = base
      .replace(/<(\/?)(?!\?|!)([A-Za-z]+)/g, "<$1nfe:$2")
      .replace(/xmlns="/g, 'xmlns:nfe="');
    expect(comPrefixo).toContain("<nfe:infNFe");
    const nfe = nfeOk(comPrefixo);
    expect(nfe.chave).toBe("35260998765432000110550010000012341876543210");
    expect(nfe.itens).toHaveLength(1);
  });

  it("emitente pessoa física (CPF)", () => {
    const xml = base.replace("<CNPJ>98765432000110</CNPJ>", "<CPF>12345678909</CPF>");
    expect(nfeOk(xml).emitente).toMatchObject({ documento: "12345678909", tipoDocumento: "CPF" });
  });

  it("uma única duplicata (dup não repetido) também vira lista", () => {
    const xml = base.replace(
      "<pag>",
      "<cobr><dup><nDup>001</nDup><dVenc>2026-10-02</dVenc><vDup>779.80</vDup></dup></cobr><pag>",
    );
    expect(nfeOk(xml).duplicatas).toEqual([{ numero: "001", vencimento: "2026-10-02", valorCents: 77980 }]);
  });

  it("avisa quando a soma das duplicatas não bate com o total", () => {
    const xml = base.replace(
      "<pag>",
      "<cobr><dup><nDup>001</nDup><dVenc>2026-10-02</dVenc><vDup>700.00</vDup></dup></cobr><pag>",
    );
    const nfe = nfeOk(xml);
    expect(nfe.avisos).toHaveLength(1);
    expect(validarParcelas(parcelasDaNfe(nfe), nfe.totalCents).ok).toBe(false);
  });

  it("vários detPag: vale o de maior valor; tPag 90 (sem pagamento) é ignorado", () => {
    const xml = base.replace(
      /<pag>[\s\S]*<\/pag>/,
      "<pag><detPag><tPag>90</tPag><vPag>0.00</vPag></detPag><detPag><tPag>01</tPag><vPag>79.80</vPag></detPag><detPag><tPag>03</tPag><vPag>700.00</vPag></detPag></pag>",
    );
    expect(nfeOk(xml).formaPagto).toBe("CARTAO");
  });

  it("total menor que a soma dos itens (ex.: ICMS desonerado) vira desconto no maior item", () => {
    const xml = base.replace("<vNF>779.80</vNF>", "<vNF>760.00</vNF>");
    const nfe = nfeOk(xml);
    expect(nfe.itens).toHaveLength(1);
    expect(nfe.itens[0].descontoCents).toBe(1980);
    expect(nfe.itens[0].totalCents).toBe(76000);
    expect(somaItens(nfe.itens)).toBe(nfe.totalCents);
  });

  it("diferença positiva sem componente conhecido vira item de ajuste", () => {
    const xml = base.replace("<vNF>779.80</vNF>", "<vNF>779.85</vNF>");
    const nfe = nfeOk(xml);
    expect(nfe.itens.map((i) => [i.origem, i.totalCents])).toEqual([
      ["PRODUTO", 77980],
      ["AJUSTE", 5],
    ]);
    expect(somaItens(nfe.itens)).toBe(nfe.totalCents);
  });

  it("avisa quando o ajuste de unitário fracionado passa de 10 centavos", () => {
    const xml = base
      .replace("<qCom>2.0000</qCom>", "<qCom>1000.0000</qCom>")
      .replace("<vUnCom>389.9000000000</vUnCom>", "<vUnCom>0.0149000000</vUnCom>")
      .replace(/779\.80/g, "14.90");
    const nfe = nfeOk(xml);
    expect(nfe.itens[0]).toMatchObject({ qtde: 1000, unitCents: 2, descontoCents: 510, totalCents: 1490 });
    expect(nfe.avisos).toHaveLength(1);
    expect(nfe.avisos[0]).toMatch(/frações de centavo/);
  });

  it("aceita BOM no início do arquivo", () => {
    expect(parseNfeXml("﻿" + base).ok).toBe(true);
  });
});

describe("parseNfeXml — arquivos recusados", () => {
  it("XML malformado", () => {
    const r = parseNfeXml(fixture("nfe-invalida.xml"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/^XML inválido/);
  });

  it("texto que não é XML e arquivo vazio", () => {
    expect(parseNfeXml("isto não é xml").ok).toBe(false);
    const vazio = parseNfeXml("   ");
    expect(vazio).toEqual({ ok: false, erro: "Arquivo vazio." });
  });

  it("XML bem-formado que não é NF-e (evento de cancelamento)", () => {
    const evento = `<?xml version="1.0"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento><infEvento Id="ID1101113526099876543200011055001000001234187654321001"><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;
    const r = parseNfeXml(evento);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/não é o XML de uma NF-e/);
  });

  it("recusa DOCTYPE (proteção contra expansão de entidades)", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><NFe><infNFe Id="NFe1">&a;</infNFe></NFe>`;
    expect(parseNfeXml(xml).ok).toBe(false);
  });

  it("chave de acesso inválida, sem itens ou sem total", () => {
    const base = fixture("nfe-1-item.xml");
    const semChave = parseNfeXml(base.replace(/Id="NFe\d+"/, 'Id="NFe123"'));
    expect(semChave.ok).toBe(false);
    if (!semChave.ok) expect(semChave.erro).toMatch(/Chave de acesso/);

    const semItens = parseNfeXml(base.replace(/<det nItem="1">[\s\S]*<\/det>/, ""));
    expect(semItens.ok).toBe(false);
    if (!semItens.ok) expect(semItens.erro).toMatch(/sem itens/);

    const semTotal = parseNfeXml(base.replace("<vNF>779.80</vNF>", ""));
    expect(semTotal.ok).toBe(false);
  });
});

describe("parseNfeXml — CNO da obra", () => {
  const base = fixture("nfe-1-item.xml");
  const comInfAdic = (conteudo: string) => base.replace("</pag>", `</pag><infAdic>${conteudo}</infAdic>`);

  it("sem CNO na nota fica nulo", () => {
    expect(nfeOk(base).cno).toBeNull();
  });

  it("obsCont com xCampo CNO (o rótulo é o próprio campo)", () => {
    const xml = comInfAdic('<obsCont xCampo="CNO"><xTexto>900001234567</xTexto></obsCont>');
    expect(nfeOk(xml).cno).toBe("900001234567");
  });

  it("texto livre das informações complementares", () => {
    const xml = comInfAdic("<infCpl>PEDIDO 4471. ENTREGA NA OBRA RESIDENCIAL JARDIM - CNO: 90.000.12345/67</infCpl>");
    expect(nfeOk(xml).cno).toBe("900001234567");
  });

  it("complemento do local de entrega", () => {
    const xml = base.replace(
      "</dest>",
      "</dest><entrega><CNPJ>11222333000181</CNPJ><xLgr>RUA DA OBRA</xLgr><nro>10</nro><xCpl>LOTE 12 CEI 90.000.12345/67</xCpl><xBairro>CENTRO</xBairro><cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF></entrega>",
    );
    expect(nfeOk(xml).cno).toBe("900001234567");
  });

  it("informação adicional do item", () => {
    const xml = base.replace("</imposto>", "</imposto><infAdProd>Obra CNO 900001234567</infAdProd>");
    expect(nfeOk(xml).cno).toBe("900001234567");
  });

  it("dois CNOs distintos: usa o primeiro e avisa", () => {
    const xml = comInfAdic(
      '<infCpl>CNO 11.111.11111/11</infCpl><obsCont xCampo="CNO"><xTexto>90.000.12345/67</xTexto></obsCont>',
    );
    const nfe = nfeOk(xml);
    expect(nfe.cno).toBe("900001234567");
    expect(nfe.avisos.some((a) => a.includes("mais de um CNO") && a.includes("11.111.11111/11"))).toBe(true);
  });

  it("o mesmo CNO repetido em dois campos não gera aviso", () => {
    const xml = comInfAdic('<infCpl>CNO 90.000.12345/67</infCpl><obsCont xCampo="CNO"><xTexto>900001234567</xTexto></obsCont>');
    const nfe = nfeOk(xml);
    expect(nfe.cno).toBe("900001234567");
    expect(nfe.avisos).toEqual([]);
  });

  it("número de pedido com 12 dígitos não vira CNO", () => {
    expect(nfeOk(comInfAdic("<infCpl>PEDIDO 900001234567</infCpl>")).cno).toBeNull();
  });
});
