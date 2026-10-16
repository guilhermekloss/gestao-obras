import { describe, expect, it } from "vitest";
import { formatarMoeda } from "@/lib/format";
import { formatarDocumento, mapearFormaPagto, parcelasDaNfe, parseNfeXml, unitarioCoerente, variantesDocumento, type Nfe } from "../nfe-xml";

const CHAVE = "35260811222333000181550010000123451000012345";

type Partes = {
  id?: string;
  ide?: string;
  emit?: string;
  dets?: string;
  total?: string;
  cobr?: string;
  pag?: string;
  raiz?: (inf: string) => string;
};

const IDE = "<ide><nNF>12345</nNF><serie>1</serie><dhEmi>2026-08-15T10:30:00-03:00</dhEmi></ide>";
const EMIT = "<emit><CNPJ>11222333000181</CNPJ><xNome>DEPOSITO LTDA</xNome></emit>";
const det = (desc: string, qtde: string, unit: string, vProd: string, extra = "") =>
  `<det><prod><xProd>${desc}</xProd><qCom>${qtde}</qCom><vUnCom>${unit}</vUnCom><vProd>${vProd}</vProd>${extra}</prod></det>`;
const DET = det("CIMENTO", "10.0000", "30.0000000000", "300.00");
const TOTAL = "<total><ICMSTot><vNF>300.00</vNF></ICMSTot></total>";

function xml(p: Partes = {}): string {
  const inf = `<infNFe Id="${p.id ?? `NFe${CHAVE}`}">${p.ide ?? IDE}${p.emit ?? EMIT}${p.dets ?? DET}${p.total ?? TOTAL}${p.cobr ?? ""}${p.pag ?? ""}</infNFe>`;
  return p.raiz ? p.raiz(inf) : `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe>${inf}</NFe></nfeProc>`;
}

function ok(p: Partes = {}): Nfe {
  const r = parseNfeXml(xml(p));
  if (!r.ok) throw new Error(`esperava NF-e válida, veio: ${r.erro}`);
  return r.nfe;
}

const erro = (p: Partes | string) => {
  const r = parseNfeXml(typeof p === "string" ? p : xml(p));
  if (r.ok) throw new Error("esperava erro");
  return r.erro;
};

describe("parseNfeXml: arquivo e estrutura", () => {
  it("recusa vazio e só espaços", () => {
    expect(erro("")).toBe("Arquivo vazio.");
    expect(erro("  \n ")).toBe("Arquivo vazio.");
  });
  it("aceita BOM no início e NFe sem nfeProc", () => {
    expect(ok({ raiz: (inf) => `﻿<NFe>${inf}</NFe>` }).numero).toBe("12345");
  });
  it("recusa DOCTYPE (XXE) com a mensagem de arquivo que não é NF-e", () => {
    const msg = "O arquivo não é o XML de uma NF-e (esperado <nfeProc> ou <NFe> com <infNFe>).";
    expect(erro('<!DOCTYPE x [<!ENTITY a "b">]><NFe/>')).toBe(msg);
    expect(erro('<!doctype x><NFe/>')).toBe(msg);
  });
  it("XML malformado informa a linha", () => {
    expect(erro("<NFe>\n<a></b>\n</NFe>")).toMatch(/^XML inválido \(linha 2\): /);
  });
  it("XML válido que não é NF-e", () => {
    const msg = "O arquivo não é o XML de uma NF-e (esperado <nfeProc> ou <NFe> com <infNFe>).";
    expect(erro("<outra><coisa/></outra>")).toBe(msg);
    expect(erro("<nfeProc><NFe><semInf/></NFe></nfeProc>")).toBe(msg);
  });
});

describe("parseNfeXml: chave, número e data", () => {
  const msgChave = "Chave de acesso ausente ou inválida (infNFe/@Id deve ter 44 dígitos).";
  it("chave com 44 dígitos, com ou sem prefixo NFe", () => {
    expect(ok().chave).toBe(CHAVE);
    expect(ok({ id: CHAVE }).chave).toBe(CHAVE);
  });
  it("recusa chave curta, longa, com letras ou ausente", () => {
    expect(erro({ id: `NFe${CHAVE.slice(1)}` })).toBe(msgChave);
    expect(erro({ id: `NFe${CHAVE}0` })).toBe(msgChave);
    expect(erro({ id: `NFe${CHAVE.slice(0, 43)}X` })).toBe(msgChave);
    expect(erro({ id: `x${CHAVE}` })).toBe(msgChave);
    expect(erro({ raiz: (inf) => `<NFe>${inf.replace(/ Id="[^"]*"/, "")}</NFe>` })).toBe(msgChave);
  });
  it("número obrigatório; série opcional", () => {
    expect(erro({ ide: "<ide><dhEmi>2026-08-15T10:30:00-03:00</dhEmi></ide>" })).toBe("NF-e sem número (ide/nNF).");
    expect(ok({ ide: "<ide><nNF>7</nNF><dhEmi>2026-08-15T10:30:00-03:00</dhEmi></ide>" })).toMatchObject({ numero: "7", serie: "" });
    expect(ok().serie).toBe("1");
  });
  it("data de emissão: usa os 10 primeiros caracteres de dhEmi, ou dEmi", () => {
    expect(ok().dataEmissao).toBe("2026-08-15");
    expect(ok({ ide: "<ide><nNF>7</nNF><dEmi>2026-01-02</dEmi></ide>" }).dataEmissao).toBe("2026-01-02");
  });
  it("recusa data ausente ou fora do formato", () => {
    const msg = "NF-e sem data de emissão válida (ide/dhEmi).";
    expect(erro({ ide: "<ide><nNF>7</nNF></ide>" })).toBe(msg);
    expect(erro({ ide: "<ide><nNF>7</nNF><dhEmi>15/08/2026</dhEmi></ide>" })).toBe(msg);
    expect(erro({ ide: "<ide><nNF>7</nNF><dhEmi>2026-8-15</dhEmi></ide>" })).toBe(msg);
  });
});

describe("parseNfeXml: emitente", () => {
  const msg = "NF-e sem emitente identificado (emit/CNPJ e emit/xNome).";
  it("CNPJ: só dígitos, tipo e telefone", () => {
    const e = ok({ emit: "<emit><CNPJ>11.222.333/0001-81</CNPJ><xNome>X LTDA</xNome><enderEmit><fone>1133334444</fone></enderEmit></emit>" }).emitente;
    expect(e).toEqual({ documento: "11222333000181", tipoDocumento: "CNPJ", razaoSocial: "X LTDA", fone: "1133334444" });
  });
  it("CPF quando não há CNPJ; sem telefone vira null", () => {
    expect(ok({ emit: "<emit><CPF>123.456.789-09</CPF><xNome>JOAO</xNome></emit>" }).emitente).toEqual({
      documento: "12345678909",
      tipoDocumento: "CPF",
      razaoSocial: "JOAO",
      fone: null,
    });
  });
  it("exige documento e razão social", () => {
    expect(erro({ emit: "<emit><xNome>X</xNome></emit>" })).toBe(msg);
    expect(erro({ emit: "<emit><CNPJ>11222333000181</CNPJ></emit>" })).toBe(msg);
    expect(erro({ emit: "" })).toBe(msg);
  });
});

describe("parseNfeXml: itens", () => {
  const incompleto = (n: number) => `Item ${n} da NF-e incompleto (xProd, qCom ou vUnCom).`;
  it("sem itens", () => {
    expect(erro({ dets: "" })).toBe("NF-e sem itens (det).");
  });
  it("item incompleto informa a posição (começando em 1)", () => {
    expect(erro({ dets: det("A", "1", "10", "10.00") + `<det><prod><qCom>1</qCom><vUnCom>1</vUnCom></prod></det>` })).toBe(incompleto(2));
    expect(erro({ dets: `<det><prod><xProd>A</xProd><vUnCom>1</vUnCom></prod></det>` })).toBe(incompleto(1));
    expect(erro({ dets: `<det><prod><xProd>A</xProd><qCom>1</qCom></prod></det>` })).toBe(incompleto(1));
    expect(erro({ dets: det("A", "abc", "1", "1.00") })).toBe(incompleto(1));
  });
  it("quantidade zero também é item incompleto", () => {
    expect(erro({ dets: det("A", "0", "10", "0.00") })).toBe(incompleto(1));
    expect(erro({ dets: det("A", "0.0004", "10", "0.00") })).toBe(incompleto(1));
  });
  it("lê descrição, NCM, unidade (maiúscula, padrão UN), quantidade e valores", () => {
    const n = ok({
      dets: det("Areia", "2.5000", "100.0000", "250.00", "<NCM>25051000</NCM><uCom>m3</uCom>") + det("Brita", "1", "50", "50.00"),
      total: "<total><ICMSTot><vNF>300.00</vNF></ICMSTot></total>",
    });
    expect(n.itens).toEqual([
      { descricao: "Areia", ncm: "25051000", qtde: 2.5, unidade: "M3", unitCents: 10000, descontoCents: 0, totalCents: 25000, origem: "PRODUTO", tipoSugerido: "MATERIAL" },
      { descricao: "Brita", ncm: null, qtde: 1, unidade: "UN", unitCents: 5000, descontoCents: 0, totalCents: 5000, origem: "PRODUTO", tipoSugerido: "MATERIAL" },
    ]);
  });
  it("desconto do XML soma com o ajuste de fração de centavo", () => {
    const n = ok({ dets: det("X", "3", "0.33", "1.00", "<vDesc>0.05</vDesc>"), total: "<total><ICMSTot><vNF>0.95</vNF></ICMSTot></total>" });
    expect(n.itens[0]).toMatchObject({ unitCents: 34, descontoCents: 7, totalCents: 95 });
  });
  it("avisa quando o ajuste de centavos passa de R$ 0,10, e não avisa até esse valor", () => {
    const grande = ok({ dets: det("PARAFUSO", "1000", "0.01", "14.90"), total: "<total><ICMSTot><vNF>14.90</vNF></ICMSTot></total>" });
    expect(grande.avisos).toEqual([
      `Item 1 (PARAFUSO): o unitário do XML tem frações de centavo; ${formatarMoeda(510)} entraram como desconto para o total do item bater com a nota.`,
    ]);
    const limite = ok({ dets: det("X", "20", "0.01", "0.30"), total: "<total><ICMSTot><vNF>0.30</vNF></ICMSTot></total>" });
    expect(limite.itens[0].descontoCents).toBe(10);
    expect(limite.avisos).toEqual([]);
  });
  it("a posição no aviso é a do item (segundo item → 2)", () => {
    const n = ok({
      dets: det("A", "1", "10", "10.00") + det("B", "1000", "0.01", "14.90"),
      total: "<total><ICMSTot><vNF>24.90</vNF></ICMSTot></total>",
    });
    expect(n.avisos[0]).toMatch(/^Item 2 \(B\):/);
  });
});

describe("unitarioCoerente: quantidade inválida", () => {
  it("quantidade zero ou negativa mantém o unitário do XML, sem ajuste", () => {
    expect(unitarioCoerente(0, 100, 5)).toEqual({ unitCents: 100, ajusteCents: 0 });
    expect(unitarioCoerente(-1, 100, 5)).toEqual({ unitCents: 100, ajusteCents: 0 });
  });
});

describe("parseNfeXml: fechamento no total da nota", () => {
  const totalDe = (vNF: string, extra = "") => `<total><ICMSTot>${extra}<vNF>${vNF}</vNF></ICMSTot></total>`;
  const base = det("A", "1", "100", "100.00");

  it("exige valor total", () => {
    const msg = "NF-e sem valor total (total/ICMSTot/vNF).";
    expect(erro({ total: "" })).toBe(msg);
    expect(erro({ total: totalDe("0.00") })).toBe(msg);
  });

  it("frete vira item próprio", () => {
    const n = ok({ dets: base, total: totalDe("110.00", "<vFrete>10.00</vFrete>") });
    expect(n.itens[1]).toEqual({
      descricao: "Frete (NF-e)", ncm: null, qtde: 1, unidade: "UN", unitCents: 1000, descontoCents: 0, totalCents: 1000, origem: "ACESSORIO", tipoSugerido: "FRETE",
    });
    expect(n.itens).toHaveLength(2);
  });

  it("seguro, outras despesas, IPI, IPI devolvido, ST, FCP ST e II somam num item de encargos", () => {
    const extra = "<vSeg>0.01</vSeg><vOutro>0.02</vOutro><vIPI>0.04</vIPI><vIPIDevol>0.08</vIPIDevol><vST>0.16</vST><vFCPST>0.32</vFCPST><vII>0.64</vII>";
    const n = ok({ dets: base, total: totalDe("101.27", extra) });
    expect(n.itens[1]).toMatchObject({
      descricao: "Impostos e despesas acessórias (IPI, ST, seguro, outras)",
      totalCents: 127,
      unitCents: 127,
      origem: "ACESSORIO",
      tipoSugerido: "ENCARGO",
    });
    expect(n.itens).toHaveLength(2);
  });

  it("sem frete e sem encargos não cria itens extras", () => {
    expect(ok({ dets: base, total: totalDe("100.00") }).itens).toHaveLength(1);
  });

  it("sobra positiva vira item de ajuste", () => {
    const n = ok({ dets: base, total: totalDe("100.50") });
    expect(n.itens[1]).toMatchObject({ descricao: "Ajuste para o total da NF-e", totalCents: 50, origem: "AJUSTE", tipoSugerido: "ENCARGO", unidade: "UN", qtde: 1 });
  });

  it("sobra negativa vira desconto no maior item", () => {
    const n = ok({ dets: det("A", "1", "30", "30.00") + det("B", "1", "70", "70.00"), total: totalDe("95.00") });
    expect(n.itens.map((i) => [i.descricao, i.descontoCents, i.totalCents])).toEqual([
      ["A", 0, 3000],
      ["B", 500, 6500],
    ]);
    expect(n.avisos).toEqual([]);
  });

  it("entre itens de mesmo valor, o desconto vai para o primeiro", () => {
    const n = ok({ dets: det("A", "1", "50", "50.00") + det("B", "1", "50", "50.00"), total: totalDe("95.00") });
    expect(n.itens.map((i) => i.descontoCents)).toEqual([500, 0]);
  });

  it("o maior item absorve exatamente quando ele é do tamanho da sobra", () => {
    const n = ok({ dets: det("A", "1", "5", "5.00") + det("B", "1", "1", "1.00"), total: totalDe("1.00") });
    expect(n.itens.map((i) => i.totalCents)).toEqual([0, 100]);
    expect(n.avisos).toEqual([]);
  });

  it("se nem o maior item absorve a sobra, avisa e mantém os itens", () => {
    const n = ok({ dets: det("A", "1", "3", "3.00") + det("B", "1", "2", "2.00"), total: totalDe("0.10") });
    expect(n.itens.map((i) => i.totalCents)).toEqual([300, 200]);
    expect(n.avisos).toEqual(["A soma dos itens é maior que o total da nota e não foi possível ajustar automaticamente."]);
  });

  it("a soma dos itens sempre fecha com o total quando há ajuste possível", () => {
    for (const vNF of ["100.00", "100.01", "99.99", "250.00", "1.00"]) {
      const n = ok({ dets: base, total: totalDe(vNF) });
      expect(n.itens.reduce((a, i) => a + i.totalCents, 0)).toBe(n.totalCents);
    }
  });
});

describe("parseNfeXml: duplicatas e pagamento", () => {
  it("lê as duplicatas; sem número usa 001, 002; sem vencimento usa a emissão", () => {
    const n = ok({
      cobr: "<cobr><dup><nDup>A1</nDup><dVenc>2026-09-15</dVenc><vDup>100.00</vDup></dup><dup><vDup>200.00</vDup></dup></cobr>",
      total: "<total><ICMSTot><vNF>300.00</vNF></ICMSTot></total>",
    });
    expect(n.duplicatas).toEqual([
      { numero: "A1", vencimento: "2026-09-15", valorCents: 10000 },
      { numero: "002", vencimento: "2026-08-15", valorCents: 20000 },
    ]);
    expect(n.avisos).toEqual([]);
  });
  it("vencimento com horário é cortado na data", () => {
    const n = ok({ cobr: "<cobr><dup><nDup>1</nDup><dVenc>2026-09-15T00:00:00-03:00</dVenc><vDup>300.00</vDup></dup></cobr>" });
    expect(n.duplicatas[0].vencimento).toBe("2026-09-15");
  });
  it("uma duplicata só (objeto, não lista) também é lida", () => {
    expect(ok({ cobr: "<cobr><dup><nDup>1</nDup><vDup>300.00</vDup></dup></cobr>" }).duplicatas).toHaveLength(1);
  });
  it("avisa quando a soma das duplicatas difere do total", () => {
    const n = ok({ cobr: "<cobr><dup><nDup>1</nDup><vDup>100.00</vDup></dup></cobr>" });
    expect(n.avisos).toEqual([`A soma das duplicatas (${formatarMoeda(10000)}) difere do total da nota (${formatarMoeda(30000)}) — ajuste as parcelas antes de importar.`]);
  });
  it("sem duplicatas não há aviso", () => {
    expect(ok().avisos).toEqual([]);
  });

  const pag = (...d: [string, string][]) => `<pag>${d.map(([t, v]) => `<detPag><tPag>${t}</tPag><vPag>${v}</vPag></detPag>`).join("")}</pag>`;
  it("forma de pagamento: vale a de maior valor e a 90 é ignorada", () => {
    expect(ok({ pag: pag(["01", "50.00"], ["17", "250.00"]) }).formaPagto).toBe("PIX");
    expect(ok({ pag: pag(["17", "250.00"], ["01", "50.00"]) }).formaPagto).toBe("PIX");
    expect(ok({ pag: pag(["90", "300.00"], ["03", "10.00"]) }).formaPagto).toBe("CARTAO");
    expect(ok({ pag: pag(["90", "0.00"]) }).formaPagto).toBe("BOLETO");
    expect(ok().formaPagto).toBe("BOLETO");
  });
});

describe("mapearFormaPagto / formatarDocumento / variantesDocumento / parcelasDaNfe", () => {
  it("mapeia os códigos da SEFAZ", () => {
    expect(["01", "03", "04", "15", "16", "17", "18", "20"].map(mapearFormaPagto)).toEqual([
      "DINHEIRO", "CARTAO", "DEBITO", "BOLETO", "TRANSFERENCIA", "PIX", "TRANSFERENCIA", "PIX",
    ]);
    expect(mapearFormaPagto("1")).toBe("DINHEIRO");
    expect(mapearFormaPagto("99")).toBe("BOLETO");
    expect(mapearFormaPagto("")).toBe("BOLETO");
    expect(mapearFormaPagto(undefined)).toBe("BOLETO");
  });
  it("formata CNPJ e CPF, e devolve o original quando não tem 11 nem 14 dígitos", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("1234567890")).toBe("1234567890");
    expect(formatarDocumento("abc-12")).toBe("abc-12");
  });
  it("variantes: só dígitos e formatado, sem repetição", () => {
    expect(variantesDocumento("11.222.333/0001-81")).toEqual(["11222333000181", "11.222.333/0001-81"]);
    expect(variantesDocumento("123")).toEqual(["123"]);
  });
  it("parcelasDaNfe: sem duplicatas, uma parcela no total e na emissão; com duplicatas, numera de 1", () => {
    expect(parcelasDaNfe({ duplicatas: [], totalCents: 5000, dataEmissao: "2026-08-15" })).toEqual([{ numero: 1, valorCents: 5000, vencimento: "2026-08-15" }]);
    expect(
      parcelasDaNfe({
        duplicatas: [
          { numero: "A", vencimento: "2026-09-01", valorCents: 2000 },
          { numero: "B", vencimento: "2026-10-01", valorCents: 3000 },
        ],
        totalCents: 5000,
        dataEmissao: "2026-08-15",
      }),
    ).toEqual([
      { numero: 1, valorCents: 2000, vencimento: "2026-09-01" },
      { numero: 2, valorCents: 3000, vencimento: "2026-10-01" },
    ]);
  });
});
