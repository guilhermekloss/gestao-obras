import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parcelasDaNfe, parseNfeXml, type Nfe } from "../nfe-xml";
import { DESCRICAO_IBS_CBS_POR_FORA } from "../tributacao/ibs-cbs";
import { somaItens } from "../rateio";

const fixture = (nome: string) => readFileSync(path.join(__dirname, "fixtures", nome), "utf8");

function nfeOk(xml: string): Nfe {
  const r = parseNfeXml(xml);
  if (!r.ok) throw new Error(`esperava NF-e válida, veio: ${r.erro}`);
  return r.nfe;
}

describe("parseNfeXml: IBS/CBS, regime normal e vNFTot (fixture CRT 3, 2027)", () => {
  const nfe = nfeOk(fixture("nfe-ibscbs-crt3-vnftot.xml"));

  it("lê o CRT do emitente e os dois totais", () => {
    expect(nfe.crtEmitente).toBe("3");
    expect(nfe.vNfCents).toBe(59_000);
    expect(nfe.vNfTotCents).toBe(62_116);
  });

  it("total a pagar = vNFTot; a diferença entra como encargo e a soma dos itens fecha", () => {
    expect(nfe.totalCents).toBe(62_116);
    const porFora = nfe.itens.find((i) => i.descricao === DESCRICAO_IBS_CBS_POR_FORA);
    expect(porFora).toMatchObject({ totalCents: 3_116, tipoSugerido: "ENCARGO", origem: "ACESSORIO", qtde: 1 });
    expect(porFora?.ibsCbs).toBeUndefined();
    expect(somaItens(nfe.itens)).toBe(nfe.totalCents);
    expect(parcelasDaNfe(nfe)).toEqual([{ numero: 1, valorCents: 62_116, vencimento: "2027-03-12" }]);
    expect(nfe.avisos).toEqual([]);
  });

  it("item tributado: CST, cClassTrib, base, alíquotas exatas e valores em centavos", () => {
    expect(nfe.itens[0]).toMatchObject({ descricao: "CIMENTO CP II 50KG", ncm: "25232910" });
    expect(nfe.itens[0].ibsCbs).toEqual({
      cst: "000",
      cClassTrib: "000001",
      ibsCbsBaseCents: 35_000,
      pCbs: "8.8",
      pIbsUf: "0.05",
      pIbsMun: "0.05",
      pRedCbs: null,
      pRedIbs: null,
      cbsCents: 3_080,
      ibsUfCents: 18,
      ibsMunCents: 18,
      ibsCbsDiferidoCents: null,
      cCredPres: null,
      credPresCents: null,
    });
  });

  it("item sem gIBSCBS (CST 410): classificação lida, valores nulos (não zero)", () => {
    expect(nfe.itens[1].ibsCbs).toMatchObject({ cst: "410", cClassTrib: "410999", ibsCbsBaseCents: null, cbsCents: null, ibsUfCents: null });
  });

  it("totais do IBSCBSTot", () => {
    expect(nfe.totaisIbsCbs).toEqual({
      ibsCbsBaseCents: 35_000,
      cbsCents: 3_080,
      ibsUfCents: 18,
      ibsMunCents: 18,
      ibsCbsDiferidoCents: 0,
      credPresCents: 0,
      cbsMonoCents: 0,
      ibsMonoCents: 0,
    });
  });
});

describe("parseNfeXml: IBS/CBS, Simples Nacional em 2026 (fixture CRT 1)", () => {
  const nfe = nfeOk(fixture("nfe-ibscbs-crt1-2026.xml"));

  it("sem vNFTot o total continua o vNF, sem item de IBS/CBS", () => {
    expect(nfe.crtEmitente).toBe("1");
    expect(nfe.vNfTotCents).toBeNull();
    expect(nfe.totalCents).toBe(80_000);
    expect(nfe.itens).toHaveLength(1);
    expect(somaItens(nfe.itens)).toBe(80_000);
  });

  it("redução de alíquota (gRed) e alíquotas sem zeros sobrando; IBS municipal zerado é 0, não nulo", () => {
    expect(nfe.itens[0].ibsCbs).toMatchObject({
      cst: "200",
      cClassTrib: "200038",
      pCbs: "0.9",
      pIbsUf: "0.1",
      pIbsMun: "0",
      pRedCbs: "60",
      pRedIbs: "60",
      cbsCents: 288,
      ibsUfCents: 32,
      ibsMunCents: 0,
    });
  });
});

describe("parseNfeXml: nota anterior à reforma continua igual", () => {
  it("sem grupo IBSCBS: itens sem ibsCbs, sem totais e sem vNFTot", () => {
    for (const nome of ["nfe-1-item.xml", "nfe-varios-itens.xml"]) {
      const nfe = nfeOk(fixture(nome));
      expect(nfe.itens.every((i) => !("ibsCbs" in i))).toBe(true);
      expect(nfe.totaisIbsCbs).toBeNull();
      expect(nfe.vNfTotCents).toBeNull();
      expect(nfe.totalCents).toBe(nfe.vNfCents);
      expect(nfe.itens.some((i) => i.descricao === DESCRICAO_IBS_CBS_POR_FORA)).toBe(false);
    }
  });
});
