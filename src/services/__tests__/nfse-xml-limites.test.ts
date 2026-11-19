import { describe, expect, it } from "vitest";
import { DESCRICAO_IBS_CBS_POR_FORA, MAX_CARACTERES_XML } from "../nfe-xml";
import { crtDoRegime, diaDoMesSeguinte, pareceNfse, parseNfseXml, type Nfse } from "../nfse-xml";
import { somaItens } from "../rateio";

const CNPJ = "11222333000181";
const chave = (numero = "77", documento = CNPJ) =>
  `3550308${"22"}${documento.padStart(14, "0")}${numero.padStart(13, "0")}2610${"000000001"}0`;

type Partes = {
  id?: string;
  numero?: string;
  cStat?: string;
  dhProc?: string;
  emit?: string;
  valores?: string;
  ibscbs?: string;
  tpAmb?: string;
  dCompet?: string;
  regTrib?: string;
  toma?: string;
  serv?: string;
  valoresDps?: string;
  ibscbsDps?: string;
  semDps?: boolean;
  raiz?: (inf: string) => string;
};

const EMIT = `<emit><CNPJ>${CNPJ}</CNPJ><xNome>EMPREITEIRA LTDA</xNome><enderNac><xLgr>RUA A</xLgr><nro>1</nro><xBairro>CENTRO</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac></emit>`;
const VALORES = "<valores><vLiq>1000.00</vLiq></valores>";
const SERV = (desc = "Pintura da fachada", extra = "") =>
  `<serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest><cServ><cTribNac>070201</cTribNac><xDescServ>${desc}</xDescServ><cNBS>101011100</cNBS></cServ>${extra}</serv>`;
const VALORES_DPS = (vServ = "1000.00", trib = "<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>", desc = "") =>
  `<valores><vServPrest><vServ>${vServ}</vServ></vServPrest>${desc}<trib>${trib}<totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>`;

function xml(p: Partes = {}): string {
  const numero = p.numero ?? "77";
  const dps = p.semDps
    ? ""
    : `<DPS versao="1.01"><infDPS Id="DPS1"><tpAmb>${p.tpAmb ?? "1"}</tpAmb><dhEmi>2026-10-01T09:00:00-03:00</dhEmi><serie>1</serie><nDPS>10</nDPS><dCompet>${p.dCompet ?? "2026-10-01"}</dCompet><tpEmit>1</tpEmit><cLocEmi>3550308</cLocEmi><prest><CNPJ>${CNPJ}</CNPJ><regTrib>${p.regTrib ?? "<opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib>"}</regTrib></prest>${p.toma ?? ""}${p.serv ?? SERV()}${p.valoresDps ?? VALORES_DPS()}${p.ibscbsDps ?? ""}</infDPS></DPS>`;
  const inf = `<infNFSe Id="${p.id ?? `NFS${chave(numero)}`}"><xLocEmi>São Paulo</xLocEmi><xLocPrestacao>São Paulo</xLocPrestacao><nNFSe>${numero}</nNFSe><xTribNac>Obras</xTribNac><cStat>${p.cStat ?? "100"}</cStat><dhProc>${p.dhProc ?? "2026-10-02T11:00:00-03:00"}</dhProc>${p.emit ?? EMIT}${p.valores ?? VALORES}${p.ibscbs ?? ""}${dps}</infNFSe>`;
  return p.raiz ? p.raiz(inf) : `<?xml version="1.0" encoding="UTF-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">${inf}</NFSe>`;
}

function ok(p: Partes | string = {}): Nfse {
  const r = parseNfseXml(typeof p === "string" ? p : xml(p));
  if (!r.ok) throw new Error(`esperava NFS-e válida, veio: ${r.erro}`);
  return r.nfse;
}

const erro = (p: Partes | string) => {
  const r = parseNfseXml(typeof p === "string" ? p : xml(p));
  if (r.ok) throw new Error("esperava erro");
  return r.erro;
};

const NAO_E = "O arquivo não é o XML de uma NFS-e do padrão nacional (esperado <NFSe> com <infNFSe>).";

describe("parseNfseXml: entrada não confiável", () => {
  it("recusa DOCTYPE (XXE e expansão de entidades) antes de qualquer leitura", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE NFSe [<!ENTITY x SYSTEM "file:///etc/passwd">]>${xml().replace(/^<\?xml[^>]*>/, "").replace("Pintura da fachada", "&x;")}`;
    expect(erro(xxe)).toBe(NAO_E);
    const bomba = `<!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><NFSe><infNFSe>&b;</infNFSe></NFSe>`;
    expect(erro(bomba)).toBe(NAO_E);
    expect(erro(xml().replace("<?xml", "<!doctype NFSe><?xml"))).toBe(NAO_E);
  });

  it("XML malformado, vazio ou grande demais", () => {
    expect(erro(xml().replace("</nNFSe>", ""))).toMatch(/^XML inválido \(linha \d+\)/);
    expect(erro("   ")).toBe("Arquivo vazio.");
    expect(erro("﻿")).toBe("Arquivo vazio.");
    expect(erro(xml({ serv: SERV("x".repeat(MAX_CARACTERES_XML)) }))).toBe("Arquivo grande demais para importar (máximo 1 MB).");
  });

  it("entidades padrão viram texto puro (a tela escapa ao mostrar)", () => {
    const n = ok({ serv: SERV("Reparo &lt;script&gt;alert(1)&lt;/script&gt; &amp; pintura") });
    expect(n.itens[0].descricao).toBe("Reparo <script>alert(1)</script> & pintura");
  });

  it("aceita BOM, prefixo de namespace e a assinatura", () => {
    expect(ok(`﻿${xml()}`).numero).toBe("77");
    const prefixado = xml({
      raiz: (inf) =>
        `<n:NFSe xmlns:n="http://www.sped.fazenda.gov.br/nfse">${inf.replace(/<(\/?)(\w)/g, "<$1n:$2")}<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>AA</SignatureValue></Signature></n:NFSe>`,
    });
    expect(ok(prefixado).numero).toBe("77");
  });

  it("NF-e ou outro XML não é NFS-e", () => {
    expect(erro("<nfeProc><NFe><infNFe/></NFe></nfeProc>")).toBe(NAO_E);
    expect(erro("<NFSe><outro/></NFSe>")).toBe(NAO_E);
  });
});

describe("parseNfseXml: campos obrigatórios", () => {
  it("chave: 50 dígitos depois do prefixo NFS", () => {
    expect(erro({ id: `NFS${chave().slice(1)}` })).toMatch(/50 dígitos/);
    expect(erro({ id: `NFe${chave().slice(0, 44)}` })).toMatch(/50 dígitos/);
    expect(erro({ id: "" })).toMatch(/50 dígitos/);
    expect(ok({ id: chave() }).chave).toBe(chave());
  });

  it("número, DPS, data e emitente", () => {
    expect(erro({ numero: "" })).toBe("NFS-e sem número (infNFSe/nNFSe).");
    expect(erro({ semDps: true })).toBe("NFS-e sem a DPS (infNFSe/DPS/infDPS).");
    // sem dhProc válido vale a emissão da DPS; sem nenhuma das duas, erro
    expect(ok({ dhProc: "ontem" }).dataEmissao).toBe("2026-10-01");
    expect(erro(xml({ dhProc: "ontem" }).replace(/<dhEmi>[^<]*<\/dhEmi>/, ""))).toBe(
      "NFS-e sem data de emissão válida (infNFSe/dhProc).",
    );
    expect(erro({ emit: "<emit><xNome>SEM DOCUMENTO</xNome></emit>" })).toMatch(/sem emitente/);
    expect(erro({ emit: `<emit><CNPJ>${CNPJ}</CNPJ></emit>` })).toMatch(/sem emitente/);
  });

  it("valor do serviço positivo e valor líquido presente", () => {
    expect(erro({ valoresDps: VALORES_DPS("0.00") })).toMatch(/sem valor do serviço/);
    expect(erro({ valoresDps: VALORES_DPS("abc") })).toMatch(/sem valor do serviço/);
    expect(erro({ valores: "<valores/>" })).toMatch(/sem valor líquido/);
  });

  it("descontos maiores que o serviço não passam", () => {
    const desc = "<vDescCondIncond><vDescIncond>800.00</vDescIncond><vDescCond>300.00</vDescCond></vDescCondIncond>";
    expect(erro({ valoresDps: VALORES_DPS("1000.00", undefined, desc) })).toMatch(/descontos/);
  });

  it("sem tomador, sem obra, sem regime: campos nulos", () => {
    const n = ok({ regTrib: "" });
    expect(n.tomador).toBeNull();
    expect(n.destinatario).toBeNull();
    expect(n.servico.obra).toBeNull();
    expect(n.crtEmitente).toBeNull();
    expect(n.cno).toBeNull();
  });

  it("emitente pessoa física (CPF) e número com zeros à esquerda", () => {
    const cpf = "52998224725";
    const n = ok({
      numero: "00077",
      id: `NFS${chave("77", cpf)}`,
      emit: `<emit><CPF>${cpf}</CPF><xNome>JOAO PEDREIRO</xNome></emit>`,
    });
    expect(n.emitente).toMatchObject({ documento: cpf, tipoDocumento: "CPF" });
    expect(n.numero).toBe("77");
    expect(n.avisos).toEqual([]);
  });
});

describe("parseNfseXml: avisos", () => {
  it("chave que não confere com emitente ou número", () => {
    expect(ok({ id: `NFS${chave("78")}` }).avisos[0]).toMatch(/chave de acesso não confere/);
    expect(ok({ id: `NFS${chave("77", "98765432000198")}` }).avisos[0]).toMatch(/chave de acesso não confere/);
  });

  it("homologação e situação cancelada/substituída", () => {
    const h = ok({ tpAmb: "2" });
    expect(h.homologacao).toBe(true);
    expect(h.avisos).toContain("NFS-e emitida em ambiente de homologação (teste): não tem validade jurídica.");
    expect(ok({ cStat: "101" }).avisos[0]).toMatch(/cancelada/);
    expect(ok({ cStat: "102" }).avisos[0]).toMatch(/substituída/);
  });

  it("descrição longa é resumida no item (limite do formulário), com aviso", () => {
    const n = ok({ serv: SERV("muro ".repeat(200)) });
    expect(n.itens[0].descricao.length).toBeLessThanOrEqual(500);
    expect(n.itens[0].descricao.endsWith("…")).toBe(true);
    expect(n.servico.descricao.length).toBeGreaterThan(500);
    expect(n.avisos.some((a) => a.includes("resumida"))).toBe(true);
  });

  it("sem descrição do serviço usa a da tributação", () => {
    const serv = `<serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest><cServ><cTribNac>070201</cTribNac></cServ></serv>`;
    expect(ok({ serv }).itens[0].descricao).toBe("Obras");
  });
});

describe("parseNfseXml: valores, retenções e parcelas", () => {
  const retencoes = (federais: string, tpRetIss = "2") =>
    `<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${tpRetIss}</tpRetISSQN></tribMun><tribFed>${federais}</tribFed>`;

  it("ISS retido pelo intermediário também é retenção", () => {
    const n = ok({
      valores: "<valores><vISSQN>50.00</vISSQN><vLiq>950.00</vLiq></valores>",
      valoresDps: VALORES_DPS("1000.00", retencoes("", "3")),
    });
    expect(n.retencoes).toMatchObject({ issCents: 5_000, federaisCents: 0, totalCents: 5_000 });
    expect(n.parcelas.map((p) => p.rotulo)).toEqual(["Prestador (valor líquido)", "Guia do ISS retido"]);
  });

  it("ISS não retido não vira guia, mesmo com vISSQN", () => {
    const n = ok({ valores: "<valores><vISSQN>50.00</vISSQN><vLiq>1000.00</vLiq></valores>" });
    expect(n.issqn.retido).toBe(false);
    expect(n.parcelas).toHaveLength(1);
  });

  it("só INSS retido (11%): uma DARF, sem guia de ISS", () => {
    const n = ok({
      valores: "<valores><vLiq>890.00</vLiq></valores>",
      valoresDps: VALORES_DPS("1000.00", retencoes("<vRetCP>110.00</vRetCP>", "1")),
    });
    expect(n.retencoes).toEqual({ issCents: 0, federaisCents: 11_000, inssCents: 11_000, irrfCents: 0, contribuicoesCents: 0, totalCents: 11_000 });
    expect(n.parcelas).toEqual([
      { numero: 1, valorCents: 89_000, vencimento: "2026-10-02", rotulo: "Prestador (valor líquido)" },
      { numero: 2, valorCents: 11_000, vencimento: "2026-11-20", rotulo: "DARF das retenções federais" },
    ]);
    expect(n.totalCents).toBe(100_000);
  });

  it("federais informados que não fecham com o líquido: vale o líquido, com aviso", () => {
    const n = ok({
      valores: "<valores><vLiq>850.00</vLiq></valores>",
      valoresDps: VALORES_DPS("1000.00", retencoes("<vRetCP>110.00</vRetCP>", "1")),
    });
    expect(n.retencoes).toMatchObject({ federaisCents: 15_000, inssCents: 11_000, contribuicoesCents: 4_000 });
    expect(n.avisos.some((a) => a.replace(/\u00a0/g, " ").startsWith("As retenções federais informadas (R$ 110,00)"))).toBe(true);
    expect(n.parcelas.reduce((a, p) => a + p.valorCents, 0)).toBe(n.totalCents);
  });

  it("tpRetPisCofins 1: o PIS/COFINS informado é retido (NT 008)", () => {
    const pis = "<piscofins><CST>01</CST><vPis>6.50</vPis><vCofins>30.00</vCofins><tpRetPisCofins>1</tpRetPisCofins></piscofins>";
    const n = ok({
      valores: "<valores><vLiq>953.50</vLiq></valores>",
      valoresDps: VALORES_DPS("1000.00", retencoes(`${pis}<vRetCSLL>10.00</vRetCSLL>`, "1")),
    });
    expect(n.retencoes.contribuicoesCents).toBe(4_650);
    expect(n.avisos.filter((a) => a.startsWith("As retenções federais"))).toEqual([]);
    expect(n.federais).toMatchObject({ pisCents: 650, cofinsCents: 3_000, csllCents: 1_000, tipoRetencaoPisCofins: "1" });
  });

  it("ISS retido maior que a diferença para o líquido: limitado, com aviso", () => {
    const n = ok({
      valores: "<valores><vISSQN>80.00</vISSQN><vLiq>950.00</vLiq></valores>",
      valoresDps: VALORES_DPS("1000.00", retencoes("", "2")),
    });
    expect(n.retencoes).toMatchObject({ issCents: 5_000, federaisCents: 0 });
    expect(n.avisos.some((a) => a.startsWith("O ISS retido é maior"))).toBe(true);
  });

  it("líquido acima do serviço: usa o serviço e avisa (nada de retenção negativa)", () => {
    const n = ok({ valores: "<valores><vLiq>1200.00</vLiq></valores>" });
    expect(n.retencoes.totalCents).toBe(0);
    expect(n.totalCents).toBe(100_000);
    expect(n.aPagarPrestadorCents).toBe(100_000);
    expect(n.avisos[0]).toMatch(/maior que o valor do serviço/);
  });

  it("desconto condicionado também reduz o custo e o que se paga", () => {
    const desc = "<vDescCondIncond><vDescCond>50.00</vDescCond></vDescCondIncond>";
    const n = ok({ valores: "<valores><vLiq>950.00</vLiq></valores>", valoresDps: VALORES_DPS("1000.00", undefined, desc) });
    expect(n.itens[0]).toMatchObject({ unitCents: 100_000, descontoCents: 5_000, totalCents: 95_000 });
    expect(n.retencoes.totalCents).toBe(0);
    expect(n.totalCents).toBe(95_000);
  });

  it("2027: vTotNF acima do líquido = IBS/CBS por fora, pago ao prestador e lançado como encargo", () => {
    const gerado = `<IBSCBS><cLocalidadeIncid>3550308</cLocalidadeIncid><xLocalidadeIncid>São Paulo</xLocalidadeIncid><valores><vBC>1000.00</vBC><uf><pIBSUF>0.05</pIBSUF><pAliqEfetUF>0.05</pAliqEfetUF></uf><mun><pIBSMun>0.05</pIBSMun><pAliqEfetMun>0.05</pAliqEfetMun></mun><fed><pCBS>8.80</pCBS><pAliqEfetCBS>8.80</pAliqEfetCBS></fed></valores><totCIBS><vTotNF>1089.00</vTotNF><gIBS><vIBSTot>1.00</vIBSTot><gIBSUFTot><vIBSUF>0.50</vIBSUF></gIBSUFTot><gIBSMunTot><vIBSMun>0.50</vIBSMun></gIBSMunTot></gIBS><gCBS><vCBS>88.00</vCBS></gCBS></totCIBS></IBSCBS>`;
    const declarado = `<IBSCBS><finNFSe>0</finNFSe><cIndOp>030101</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>`;
    const n = ok({ ibscbs: gerado, ibscbsDps: declarado, dCompet: "2027-02-10", dhProc: "2027-02-11T10:00:00-03:00" });
    expect(n.totalCents).toBe(108_900);
    expect(n.aPagarPrestadorCents).toBe(108_900);
    const porFora = n.itens.find((i) => i.descricao === DESCRICAO_IBS_CBS_POR_FORA);
    expect(porFora).toMatchObject({ totalCents: 8_900, tipoSugerido: "ENCARGO", origem: "ACESSORIO", nbs: null });
    expect(somaItens(n.itens)).toBe(n.totalCents);
    expect(n.parcelas).toEqual([{ numero: 1, valorCents: 108_900, vencimento: "2027-02-11", rotulo: "Prestador (valor líquido + IBS/CBS)" }]);
    expect(n.ibsCbs).toMatchObject({ cbsCents: 8_800, ibsUfCents: 50, ibsMunCents: 50, pCbs: "8.8" });
  });

  it("IBS/CBS sem CST ou cClassTrib na DPS: nada a conferir", () => {
    const gerado = `<IBSCBS><valores><vBC>1000.00</vBC></valores><totCIBS><vTotNF>1000.00</vTotNF></totCIBS></IBSCBS>`;
    const n = ok({ ibscbs: gerado });
    expect(n.ibsCbs).toBeNull();
    expect(n.ibsCbsNfse).toMatchObject({ vTotNfCents: 100_000 });
  });

  it("diferimento e crédito presumido somam UF, município e CBS", () => {
    const gerado = `<IBSCBS><valores><vBC>1000.00</vBC><uf><pIBSUF>0.10</pIBSUF><pRedAliqUF>60.00</pRedAliqUF><pAliqEfetUF>0.04</pAliqEfetUF></uf><mun><pIBSMun>0</pIBSMun><pAliqEfetMun>0</pAliqEfetMun></mun><fed><pCBS>0.90</pCBS><pRedAliqCBS>60.00</pRedAliqCBS><pAliqEfetCBS>0.36</pAliqEfetCBS></fed></valores><totCIBS><vTotNF>1000.00</vTotNF><gIBS><vIBSTot>0.40</vIBSTot><gIBSCredPres><pCredPresIBS>1.00</pCredPresIBS><vCredPresIBS>1.00</vCredPresIBS></gIBSCredPres><gIBSUFTot><vDifUF>0.10</vDifUF><vIBSUF>0.40</vIBSUF></gIBSUFTot><gIBSMunTot><vDifMun>0.00</vDifMun><vIBSMun>0.00</vIBSMun></gIBSMunTot></gIBS><gCBS><gCBSCredPres><pCredPresCBS>2.00</pCredPresCBS><vCredPresCBS>2.00</vCredPresCBS></gCBSCredPres><vDifCBS>0.20</vDifCBS><vCBS>3.60</vCBS></gCBS></totCIBS></IBSCBS>`;
    const declarado = `<IBSCBS><valores><trib><gIBSCBS><CST>200</CST><cClassTrib>200001</cClassTrib><cCredPres>01</cCredPres></gIBSCBS></trib></valores></IBSCBS>`;
    const t = ok({ ibscbs: gerado, ibscbsDps: declarado }).ibsCbs;
    expect(t).toMatchObject({ pRedCbs: "60", pRedIbs: "60", ibsCbsDiferidoCents: 30, cCredPres: "01", credPresCents: 300, cbsCents: 360 });
  });
});

describe("parseNfseXml: CNO da obra", () => {
  it("código da obra que não é CNO: aviso, e o CNO do texto ainda vale", () => {
    const serv = SERV("Fundação", "<obra><cObra>OBRA-XYZ</cObra></obra><infoCompl><xInfComp>CNO 90.123.45678/12</xInfComp></infoCompl>");
    const n = ok({ serv });
    expect(n.cno).toBe("901234567812");
    expect(n.avisos.some((a) => a.includes("OBRA-XYZ"))).toBe(true);
  });

  it("mais de um CNO: vale o do grupo de obra, com aviso", () => {
    const serv = SERV("Fundação", "<obra><cObra>51.234.56789/01</cObra></obra><infoCompl><xInfComp>CEI 90.123.45678/12</xInfComp></infoCompl>");
    const n = ok({ serv });
    expect(n.cno).toBe("512345678901");
    expect(n.avisos.some((a) => a.startsWith("A nota cita mais de um CNO"))).toBe(true);
  });

  it("CIB e inscrição imobiliária aparecem, sem virar CNO", () => {
    const n = ok({ serv: SERV("Reforma", "<obra><inscImobFisc>123.456</inscImobFisc><cCIB>AB12CD34</cCIB></obra>") });
    expect(n.servico.obra).toEqual({ codigo: null, cib: "AB12CD34", inscricaoImobiliaria: "123.456" });
    expect(n.cno).toBeNull();
    expect(n.avisos).toEqual([]);
  });
});

describe("regras auxiliares", () => {
  it("crtDoRegime: Simples na DPS → CRT", () => {
    expect(crtDoRegime({ opSimpNac: "1", regApTribSN: null })).toBe("3");
    expect(crtDoRegime({ opSimpNac: "2", regApTribSN: null })).toBe("4");
    expect(crtDoRegime({ opSimpNac: "3", regApTribSN: null })).toBe("1");
    expect(crtDoRegime({ opSimpNac: "3", regApTribSN: "1" })).toBe("1");
    expect(crtDoRegime({ opSimpNac: "3", regApTribSN: "2" })).toBe("2");
    expect(crtDoRegime({ opSimpNac: "3", regApTribSN: "3" })).toBe("2");
    expect(crtDoRegime({ opSimpNac: "9", regApTribSN: null })).toBeNull();
    expect(crtDoRegime({ opSimpNac: null, regApTribSN: null })).toBeNull();
  });

  it("diaDoMesSeguinte vira o ano em dezembro", () => {
    expect(diaDoMesSeguinte("2026-12-31", 20)).toBe("2027-01-20");
    expect(diaDoMesSeguinte("2026-01-31", 10)).toBe("2026-02-10");
    expect(diaDoMesSeguinte("2026-09-01", 5)).toBe("2026-10-05");
  });

  it("guias de dezembro vencem em janeiro", () => {
    const n = ok({
      dCompet: "2026-12-05",
      valores: "<valores><vLiq>890.00</vLiq></valores>",
      valoresDps: VALORES_DPS("1000.00", "<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><tribFed><vRetCP>110.00</vRetCP></tribFed>"),
    });
    expect(n.parcelas[1].vencimento).toBe("2027-01-20");
  });

  it("pareceNfse olha só a tag infNFSe", () => {
    expect(pareceNfse(xml())).toBe(true);
    expect(pareceNfse("<n:infNFSe Id='x'>")).toBe(true);
    expect(pareceNfse("<nfeProc><NFe><infNFe Id='NFe1'/></NFe></nfeProc>")).toBe(false);
    expect(pareceNfse("<infNFSeX/>")).toBe(false);
  });
});
