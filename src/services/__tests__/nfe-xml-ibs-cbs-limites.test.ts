import { describe, expect, it } from "vitest";
import { formatarMoeda } from "@/lib/format";
import { DESCRICAO_IBS_CBS_POR_FORA, parseNfeXml, totalAPagar, type Nfe } from "../nfe-xml";
import { somaItens } from "../rateio";

const CHAVE = "35260811222333000181550010000123451000012345";
const IDE = "<ide><nNF>12345</nNF><serie>1</serie><dhEmi>2027-08-15T10:30:00-03:00</dhEmi></ide>";
const emit = (crt = "3") => `<emit><CNPJ>11222333000181</CNPJ><xNome>DEPOSITO LTDA</xNome><CRT>${crt}</CRT></emit>`;
const det = (imposto = "") =>
  `<det><prod><xProd>CIMENTO</xProd><qCom>10.0000</qCom><vUnCom>30.00</vUnCom><vProd>300.00</vProd></prod><imposto>${imposto}</imposto></det>`;
const total = (vNF = "300.00", extra = "") => `<total><ICMSTot><vNF>${vNF}</vNF></ICMSTot>${extra}</total>`;
const dup = (...valores: string[]) =>
  `<cobr>${valores.map((v, i) => `<dup><nDup>00${i + 1}</nDup><dVenc>2027-09-15</dVenc><vDup>${v}</vDup></dup>`).join("")}</cobr>`;

function nfe(p: { emit?: string; dets?: string; total?: string; cobr?: string } = {}): Nfe {
  const inf = `<infNFe Id="NFe${CHAVE}">${IDE}${p.emit ?? emit()}${p.dets ?? det()}${p.total ?? total()}${p.cobr ?? ""}</infNFe>`;
  const r = parseNfeXml(`<nfeProc><NFe>${inf}</NFe></nfeProc>`);
  if (!r.ok) throw new Error(r.erro);
  return r.nfe;
}

const grupo = (corpo: string, cst = "000", cClassTrib = "000001") =>
  `<IBSCBS><CST>${cst}</CST><cClassTrib>${cClassTrib}</cClassTrib>${corpo}</IBSCBS>`;
const gIBSCBS = (uf: string, mun: string, cbs: string) =>
  `<gIBSCBS><vBC>300.00</vBC><gIBSUF>${uf}</gIBSUF><gIBSMun>${mun}</gIBSMun><vIBS>0</vIBS><gCBS>${cbs}</gCBS></gIBSCBS>`;

describe("totalAPagar", () => {
  it("sem vNFTot, ou vNFTot que não passa do vNF: vale o vNF", () => {
    expect(totalAPagar(30_000, null, null)).toEqual({ totalCents: 30_000, porForaCents: 0, aviso: null });
    expect(totalAPagar(30_000, 30_000, 30_000)).toEqual({ totalCents: 30_000, porForaCents: 0, aviso: null });
    // vNFTot menor que o vNF não faz sentido no leiaute: ignorado
    expect(totalAPagar(30_000, 29_000, null)).toEqual({ totalCents: 30_000, porForaCents: 0, aviso: null });
  });
  it("vNFTot maior: vale ele, com ou sem duplicatas, e a diferença é o valor por fora", () => {
    expect(totalAPagar(30_000, 32_700, null)).toEqual({ totalCents: 32_700, porForaCents: 2_700, aviso: null });
    expect(totalAPagar(30_000, 32_700, 32_700)).toEqual({ totalCents: 32_700, porForaCents: 2_700, aviso: null });
  });
  it("duplicatas que somam o vNF (e não o vNFTot): vale o vNF, com aviso", () => {
    const r = totalAPagar(30_000, 32_700, 30_000);
    expect(r).toMatchObject({ totalCents: 30_000, porForaCents: 0 });
    expect(r.aviso).toBe(
      `A nota informa ${formatarMoeda(32_700)} com IBS/CBS por fora (vNFTot), mas as duplicatas somam o vNF (${formatarMoeda(30_000)}): foi usado o vNF. Confira com o fornecedor.`,
    );
  });
  it("duplicatas que não batem com nenhum dos dois: vale o vNFTot (o aviso de duplicatas sai no parse)", () => {
    expect(totalAPagar(30_000, 32_700, 31_000)).toMatchObject({ totalCents: 32_700, porForaCents: 2_700, aviso: null });
  });
});

describe("parseNfeXml: vNFTot", () => {
  it("duplicata no vNF: total vNF, sem item por fora, só o aviso do vNFTot", () => {
    const n = nfe({ total: total("300.00", "<vNFTot>327.00</vNFTot>"), cobr: dup("300.00") });
    expect(n.totalCents).toBe(30_000);
    expect(n.itens.some((i) => i.descricao === DESCRICAO_IBS_CBS_POR_FORA)).toBe(false);
    expect(n.avisos).toHaveLength(1);
    expect(n.avisos[0]).toMatch(/vNFTot/);
  });
  it("duplicata fora dos dois: total vNFTot e o aviso de duplicatas de sempre", () => {
    const n = nfe({ total: total("300.00", "<vNFTot>327.00</vNFTot>"), cobr: dup("310.00") });
    expect(n.totalCents).toBe(32_700);
    expect(somaItens(n.itens)).toBe(32_700);
    expect(n.avisos).toEqual([expect.stringMatching(/^A soma das duplicatas .* difere do total da nota/)]);
  });
  it("vNFTot igual ao vNF ou vazio: nada muda", () => {
    expect(nfe({ total: total("300.00", "<vNFTot>300.00</vNFTot>") }).itens).toHaveLength(1);
    expect(nfe({ total: total("300.00", "<vNFTot></vNFTot>") }).vNfTotCents).toBeNull();
  });
  it("o item por fora entra antes do ajuste: a soma fecha mesmo com outro acessório", () => {
    const n = nfe({ total: "<total><ICMSTot><vFrete>10.00</vFrete><vNF>310.00</vNF></ICMSTot><vNFTot>337.00</vNFTot></total>" });
    expect(n.itens.map((i) => [i.descricao, i.totalCents])).toEqual([
      ["CIMENTO", 30_000],
      ["Frete (NF-e)", 1_000],
      [DESCRICAO_IBS_CBS_POR_FORA, 2_700],
    ]);
  });
});

describe("parseNfeXml: CRT do emitente", () => {
  it("1 a 4 valem; fora da tabela ou ausente vira nulo", () => {
    expect(nfe({ emit: emit("4") }).crtEmitente).toBe("4");
    expect(nfe({ emit: emit("5") }).crtEmitente).toBeNull();
    expect(nfe({ emit: "<emit><CNPJ>11222333000181</CNPJ><xNome>X</xNome></emit>" }).crtEmitente).toBeNull();
  });
});

describe("parseNfeXml: grupo IBSCBS do item", () => {
  it("sem CST ou sem cClassTrib o grupo é ignorado", () => {
    expect(nfe({ dets: det("<IBSCBS><CST>000</CST></IBSCBS>") }).itens[0].ibsCbs).toBeUndefined();
    expect(nfe({ dets: det("<IBSCBS><cClassTrib>000001</cClassTrib></IBSCBS>") }).itens[0].ibsCbs).toBeUndefined();
  });

  it("alíquota fora do formato vira nula; valor ausente é nulo e valor 0 é zero", () => {
    const t = nfe({
      dets: det(grupo(gIBSCBS("<pIBSUF>abc</pIBSUF><vIBSUF>0</vIBSUF>", "<pIBSMun>1234.5</pIBSMun>", "<pCBS>008.80</pCBS><vCBS>26.40</vCBS>"))),
    }).itens[0].ibsCbs;
    expect(t).toMatchObject({ pIbsUf: null, pIbsMun: null, pCbs: "8.8", ibsUfCents: 0, ibsMunCents: null, cbsCents: 2_640 });
  });

  it("valores com frações de centavo arredondam meio-para-cima, por texto", () => {
    const t = nfe({ dets: det(grupo(gIBSCBS("<vIBSUF>0.125</vIBSUF>", "<vIBSMun>0.124</vIBSMun>", "<vCBS>26.405</vCBS>"))) }).itens[0].ibsCbs;
    expect(t).toMatchObject({ ibsUfCents: 13, ibsMunCents: 12, cbsCents: 2_641 });
  });

  it("diferimento: soma os vDif de UF, município e CBS", () => {
    const gDif = (v: string) => `<gDif><pDif>100</pDif><vDif>${v}</vDif></gDif>`;
    const t = nfe({
      dets: det(grupo(gIBSCBS(`<pIBSUF>0.05</pIBSUF>${gDif("0.15")}<vIBSUF>0</vIBSUF>`, `${gDif("0.15")}<vIBSMun>0</vIBSMun>`, `${gDif("26.40")}<vCBS>0</vCBS>`), "510", "510001")),
    }).itens[0].ibsCbs;
    expect(t).toMatchObject({ cst: "510", ibsCbsDiferidoCents: 2_670, cbsCents: 0 });
  });

  it("redução do IBS: usa a da UF e, sem ela, a do município", () => {
    const gRed = (p: string) => `<gRed><pRedAliq>${p}</pRedAliq><pAliqEfet>0</pAliqEfet></gRed>`;
    expect(nfe({ dets: det(grupo(gIBSCBS(gRed("40.00"), gRed("30"), ""))) }).itens[0].ibsCbs?.pRedIbs).toBe("40");
    expect(nfe({ dets: det(grupo(gIBSCBS("", gRed("30.5000"), ""))) }).itens[0].ibsCbs?.pRedIbs).toBe("30.5");
  });

  it("monofásico (CST 620): CBS e IBS do total do item; sem base nem IBS municipal", () => {
    const mono = "<gIBSCBSMono><gMonoPadrao><qBCMono>100.0000</qBCMono><adRemIBS>0.30</adRemIBS><adRemCBS>0.90</adRemCBS><vIBSMono>30.00</vIBSMono><vCBSMono>90.00</vCBSMono></gMonoPadrao><vTotIBSMonoItem>30.00</vTotIBSMonoItem><vTotCBSMonoItem>90.00</vTotCBSMonoItem></gIBSCBSMono>";
    const t = nfe({ dets: det(grupo(mono, "620", "620001")) }).itens[0].ibsCbs;
    expect(t).toMatchObject({ cst: "620", ibsCbsBaseCents: null, cbsCents: 9_000, ibsUfCents: 3_000, ibsMunCents: null });
  });

  it("crédito presumido da operação: código e soma de IBS + CBS", () => {
    const cp = "<gCredPresOper><vBCCredPres>300.00</vBCCredPres><cCredPres>1</cCredPres><gIBSCredPres><pCredPres>1</pCredPres><vCredPres>3.00</vCredPres></gIBSCredPres><gCBSCredPres><pCredPres>2</pCredPres><vCredPres>6.00</vCredPres></gCBSCredPres></gCredPresOper>";
    expect(nfe({ dets: det(grupo(gIBSCBS("", "", "") + cp)) }).itens[0].ibsCbs).toMatchObject({ cCredPres: "1", credPresCents: 900 });
    expect(nfe({ dets: det(grupo(gIBSCBS("", "", ""))) }).itens[0].ibsCbs).toMatchObject({ cCredPres: null, credPresCents: null });
  });

  it("IBSCBSTot ausente: totais nulos mesmo com o grupo nos itens", () => {
    expect(nfe({ dets: det(grupo(gIBSCBS("", "", ""))) }).totaisIbsCbs).toBeNull();
  });
});
