import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { observacaoDaNfse, parseNfseXml, type Nfse } from "../nfse-xml";
import { somaItens } from "../rateio";

const fixture = (nome: string) => readFileSync(path.join(__dirname, "fixtures", nome), "utf8");

function nfseOk(xml: string): Nfse {
  const r = parseNfseXml(xml);
  if (!r.ok) throw new Error(`esperava NFS-e válida, veio: ${r.erro}`);
  return r.nfse;
}

// formatarMoeda separa "R$" do valor com espaço sem quebra
const texto = (s: string) => s.replace(/\u00a0/g, " ");

const somaParcelas = (n: Nfse) => n.parcelas.reduce((a, p) => a + p.valorCents, 0);

describe("parseNfseXml: empreitada com retenções, CNO e IBS/CBS de 2026", () => {
  const nfse = nfseOk(fixture("nfse-ibscbs-retencoes-cno.xml"));

  it("identifica a nota: chave de 50 posições, número, DPS, datas e situação", () => {
    expect(nfse.chave).toBe("35503082211222333000181000000000123426101234567894");
    expect(nfse.numero).toBe("1234");
    expect(nfse.dps).toEqual({ serie: "1", numero: "321", emitidaEm: "2026-10-20T10:14:58-03:00" });
    expect(nfse.dataEmissao).toBe("2026-10-20");
    expect(nfse.dataCompetencia).toBe("2026-10-15");
    expect(nfse.situacao).toBe("100");
    expect(nfse.homologacao).toBe(false);
  });

  it("prestador, regime e tomador", () => {
    expect(nfse.emitente).toMatchObject({
      documento: "11222333000181",
      tipoDocumento: "CNPJ",
      razaoSocial: "EMPREITEIRA BOA OBRA LTDA",
      inscricaoMunicipal: "4455667",
      fone: "11988887777",
      endereco: "RUA DAS BETONEIRAS, 45, VILA OPERARIA",
      codigoMunicipio: "3550308",
      uf: "SP",
    });
    // não optante pelo Simples = regime normal
    expect(nfse.regime.opSimpNac).toBe("1");
    expect(nfse.crtEmitente).toBe("3");
    expect(nfse.tomador).toMatchObject({ nome: "CONSTRUTORA EXEMPLO LTDA", endereco: "AVENIDA DO CANTEIRO, 1000, CONJ 12, CENTRO" });
  });

  it("serviço: códigos de tributação, NBS, descrição e CNO do grupo de obra", () => {
    expect(nfse.servico).toMatchObject({
      codigoTributacaoNacional: "070201",
      nbs: "101011100",
      descricao: "Mão de obra de alvenaria e reboco — 2ª medição do contrato 15/2026, bloco B",
      localPrestacao: "São Paulo",
      obra: { codigo: "512345678901", cib: null, inscricaoImobiliaria: null },
    });
    expect(nfse.cno).toBe("512345678901");
  });

  it("custo = valor do serviço: um item SERVICO com NBS e IBS/CBS, somando o total", () => {
    expect(nfse.totalCents).toBe(1_000_000);
    expect(nfse.itens).toHaveLength(1);
    expect(nfse.itens[0]).toMatchObject({
      tipoSugerido: "SERVICO",
      codigo: "ALV-02",
      ncm: null,
      nbs: "101011100",
      qtde: 1,
      unitCents: 1_000_000,
      descontoCents: 0,
      totalCents: 1_000_000,
    });
    expect(somaItens(nfse.itens)).toBe(nfse.totalCents);
  });

  it("retenções: ISS do tomador e federais derivados do valor líquido", () => {
    expect(nfse.issqn).toMatchObject({ retido: true, tipoRetencao: "2", valorCents: 50_000, aliquota: "5" });
    expect(nfse.valores).toEqual({
      servicoCents: 1_000_000,
      descontoIncondicionadoCents: 0,
      descontoCondicionadoCents: 0,
      liquidoCents: 778_500,
      totalRetencoesXmlCents: 221_500,
    });
    expect(nfse.retencoes).toEqual({
      issCents: 50_000,
      federaisCents: 171_500,
      inssCents: 110_000,
      irrfCents: 15_000,
      contribuicoesCents: 46_500,
      totalCents: 221_500,
    });
  });

  it("parcelas: líquido ao prestador na emissão, guia do ISS no dia 10 e DARF no dia 20 do mês seguinte", () => {
    expect(nfse.aPagarPrestadorCents).toBe(778_500);
    expect(nfse.parcelas).toEqual([
      { tipo: "PRESTADOR", numero: 1, valorCents: 778_500, vencimento: "2026-10-20", rotulo: "Prestador (valor líquido)" },
      { tipo: "ISS", numero: 2, valorCents: 50_000, vencimento: "2026-11-10", rotulo: "Guia do ISS retido" },
      { tipo: "FEDERAIS", numero: 3, valorCents: 171_500, vencimento: "2026-11-20", rotulo: "DARF das retenções federais" },
    ]);
    expect(somaParcelas(nfse)).toBe(nfse.totalCents);
  });

  it("avisa que as retenções viram guia e não vão ao prestador", () => {
    expect(nfse.avisos).toHaveLength(1);
    const aviso = texto(nfse.avisos[0]);
    expect(aviso).toContain("ISS retido R$ 500,00 na parcela 2, vencendo em 10/11/2026");
    expect(aviso).toContain("INSS R$ 1.100,00");
    expect(aviso).toContain("na parcela 3, vencendo em 20/11/2026");
    expect(aviso).toContain("não pagas ao prestador");
  });

  it("IBS/CBS: classificação da DPS, valores apurados pela Sefin, no formato do item da NF-e", () => {
    expect(nfse.itens[0].ibsCbs).toEqual({
      cst: "000",
      cClassTrib: "000001",
      ibsCbsBaseCents: 950_000,
      pCbs: "0.9",
      pIbsUf: "0.1",
      pIbsMun: "0",
      pRedCbs: null,
      pRedIbs: null,
      cbsCents: 8_550,
      ibsUfCents: 950,
      ibsMunCents: 0,
      ibsCbsDiferidoCents: null,
      cCredPres: null,
      credPresCents: null,
    });
    expect(nfse.ibsCbsNfse).toMatchObject({ indicadorOperacao: "030101", localidade: "São Paulo", vTotNfCents: 778_500 });
  });

  it("observação gravada na nota lista as guias", () => {
    expect(texto(observacaoDaNfse(nfse))).toBe(
      "Importada do XML da NFS-e (competência 10/2026). Retenções a recolher em guia, não pagas ao prestador: ISS retido R$ 500,00; federais R$ 1.715,00 (INSS R$ 1.100,00, IRRF R$ 150,00, PIS/COFINS/CSLL R$ 465,00).",
    );
  });
});

describe("parseNfseXml: Simples Nacional, desconto e CNO no texto livre (sem IBS/CBS)", () => {
  const nfse = nfseOk(fixture("nfse-simples-sem-ibscbs.xml"));

  it("ME/EPP do Simples vira CRT 1", () => {
    expect(nfse.regime).toEqual({ opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" });
    expect(nfse.crtEmitente).toBe("1");
  });

  it("desconto incondicionado sai do item; sem retenção, uma parcela pelo líquido", () => {
    expect(nfse.itens[0]).toMatchObject({ unitCents: 150_000, descontoCents: 10_000, totalCents: 140_000, nbs: null });
    expect(nfse.totalCents).toBe(140_000);
    expect(nfse.retencoes.totalCents).toBe(0);
    expect(nfse.parcelas).toEqual([
      { tipo: "PRESTADOR", numero: 1, valorCents: 140_000, vencimento: "2026-09-03", rotulo: "Prestador (valor líquido)" },
    ]);
    expect(nfse.avisos).toEqual([]);
  });

  it("sem os grupos de IBS/CBS os campos ficam nulos", () => {
    expect(nfse.ibsCbsNfse).toBeNull();
    expect(nfse.itens[0].ibsCbs).toBeUndefined();
  });

  it("acha o CNO nas informações complementares", () => {
    expect(nfse.servico.obra).toBeNull();
    expect(nfse.cno).toBe("901234567812");
  });

  it("emissão = data da NFS-e (dhProc), não da DPS", () => {
    expect(nfse.dataEmissao).toBe("2026-09-03");
    expect(nfse.dps.emitidaEm).toBe("2026-09-02T17:40:00-03:00");
    expect(observacaoDaNfse(nfse)).toBe("Importada do XML da NFS-e (competência 08/2026)");
  });
});
