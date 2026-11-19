import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  dadosImportaveis,
  lancamentoDoXml,
  mensagemNotaJaImportada,
  parseDocumentoXml,
  type DocumentoXml,
  type EscolhasDoImport,
} from "../documento-xml";

const fixture = (nome: string) => readFileSync(path.join(__dirname, "fixtures", nome), "utf8");

function doc(nome: string): DocumentoXml {
  const r = parseDocumentoXml(fixture(nome));
  if (!r.ok) throw new Error(r.erro);
  return r.doc;
}

const escolhas = (n: number, extra: Partial<EscolhasDoImport> = {}): EscolhasDoImport => ({
  tipos: Array(n).fill("SERVICO"),
  materiais: Array(n).fill({ modo: "nenhum" }),
  rateios: [{ obraId: "o1", fracaoBp: 10_000 }],
  parcelas: [{ numero: 1, valorCents: 100, vencimento: "2026-10-20" }],
  ...extra,
});

describe("parseDocumentoXml: NF-e ou NFS-e pelo conteúdo", () => {
  it("NFS-e nacional", () => {
    expect(doc("nfse-ibscbs-retencoes-cno.xml").tipo).toBe("NFSE");
    expect(doc("nfse-simples-sem-ibscbs.xml").tipo).toBe("NFSE");
  });

  it("NF-e", () => {
    expect(doc("nfe-1-item.xml").tipo).toBe("NFE");
  });

  it("outro XML: mensagem que cita os dois documentos", () => {
    expect(parseDocumentoXml("<CompNfse><Nfse/></CompNfse>")).toEqual({
      ok: false,
      erro: "O arquivo não é o XML de uma NF-e nem de uma NFS-e do padrão nacional.",
    });
  });

  it("os erros próprios de cada leitor passam adiante", () => {
    const nfseSemNumero = fixture("nfse-simples-sem-ibscbs.xml").replace("<nNFSe>57</nNFSe>", "");
    expect(parseDocumentoXml(nfseSemNumero)).toEqual({ ok: false, erro: "NFS-e sem número (infNFSe/nNFSe)." });
    expect(parseDocumentoXml("")).toEqual({ ok: false, erro: "Arquivo vazio." });
  });

  it("DOCTYPE é recusado também quando o XML parece NFS-e", () => {
    const r = parseDocumentoXml(`<!DOCTYPE x [<!ENTITY e "a">]>${fixture("nfse-simples-sem-ibscbs.xml")}`);
    expect(r.ok).toBe(false);
  });
});

describe("dadosImportaveis", () => {
  it("NFS-e: tipo NFSE, chave de 50, itens com NBS, parcelas com rótulo e observação", () => {
    const d = dadosImportaveis(doc("nfse-ibscbs-retencoes-cno.xml"));
    expect(d).toMatchObject({
      tipoDocumento: "NFSE",
      rotulo: "NFS-e",
      chave: "35503082211222333000181000000000123426101234567894",
      numero: "1234",
      dataEmissao: "2026-10-20",
      emitente: { documento: "11222333000181", tipoDocumento: "CNPJ", razaoSocial: "EMPREITEIRA BOA OBRA LTDA" },
      cno: "512345678901",
      totalCents: 1_000_000,
      crtEmitente: "3",
      nomeArquivo: "NFSe35503082211222333000181000000000123426101234567894.xml",
    });
    expect(d.itens[0].nbs).toBe("101011100");
    expect(d.parcelas.map((p) => p.rotulo)).toEqual([
      "Prestador (valor líquido)",
      "Guia do ISS retido",
      "DARF das retenções federais",
    ]);
    expect(d.parcelas.reduce((a, p) => a + p.valorCents, 0)).toBe(d.totalCents);
    expect(d.obs).toMatch(/^Importada do XML da NFS-e \(competência 10\/2026\)\. Retenções a recolher em guia/);
  });

  it("NF-e: tipo NF, itens sem NBS, parcelas sem rótulo quando não há duplicata", () => {
    const d = dadosImportaveis(doc("nfe-1-item.xml"));
    expect(d.tipoDocumento).toBe("NF");
    expect(d.chave).toHaveLength(44);
    expect(d.itens.every((i) => i.nbs === null)).toBe(true);
    expect(d.obs).toMatch(/^Importada do XML da NF-e/);
  });

  it("NF-e com duplicatas: o rótulo traz o número da duplicata", () => {
    const d = dadosImportaveis(doc("nfe-varios-itens.xml"));
    const nfe = (doc("nfe-varios-itens.xml") as Extract<DocumentoXml, { tipo: "NFE" }>).nfe;
    expect(d.parcelas.map((p) => p.rotulo)).toEqual(
      nfe.duplicatas.length > 0 ? nfe.duplicatas.map((x) => `Duplicata ${x.numero}`) : [null],
    );
  });
});

describe("lancamentoDoXml: o que vai para registrarLancamento", () => {
  it("NFS-e: tipo, chave, item SERVICO com NBS e IBS/CBS, CRT e observação vêm do XML", () => {
    const d = dadosImportaveis(doc("nfse-ibscbs-retencoes-cno.xml"));
    const l = lancamentoDoXml(d, escolhas(1), {
      fornecedor: { id: "forn-1" },
      anexoUrl: "/api/fotos/1700000000000-abcdef12.xml",
      criadoPor: "u1",
    });
    expect(l).toMatchObject({
      fornecedor: { id: "forn-1" },
      tipoDocumento: "NFSE",
      numero: "1234",
      dataCompra: "2026-10-20",
      totalCents: 1_000_000,
      formaPagto: "BOLETO",
      chaveNfe: "35503082211222333000181000000000123426101234567894",
      crtEmitente: "3",
      anexoNome: "NFSe35503082211222333000181000000000123426101234567894.xml",
      criadoPor: "u1",
    });
    expect(l.obs).toBe(d.obs);
    expect(l.itens).toHaveLength(1);
    expect(l.itens[0]).toMatchObject({
      tipo: "SERVICO",
      descricao: d.itens[0].descricao,
      codigoProduto: "ALV-02",
      ncm: null,
      nbs: "101011100",
      totalCents: 1_000_000,
      materialId: undefined,
      materialNovo: undefined,
    });
    expect(l.itens[0].ibsCbs).toMatchObject({ cst: "000", cClassTrib: "000001", cbsCents: 8_550 });
  });

  it("do client valem só tipo, material, rateio e parcelas", () => {
    const d = dadosImportaveis(doc("nfse-simples-sem-ibscbs.xml"));
    const l = lancamentoDoXml(
      d,
      escolhas(1, {
        tipos: ["MATERIAL"],
        materiais: [{ modo: "novo", nome: "Quadro elétrico", unidade: "UN" }],
        parcelas: [{ numero: 1, valorCents: 140_000, vencimento: "2026-09-10" }],
      }),
      { fornecedor: { novo: { nome: "ELETRICA" } }, anexoUrl: "/api/fotos/x.xml", nomeArquivo: "nota.xml", criadoPor: "u1" },
    );
    expect(l.itens[0]).toMatchObject({ tipo: "MATERIAL", materialNovo: { nome: "Quadro elétrico", unidade: "UN" }, ibsCbs: null });
    expect(l.parcelas).toEqual([{ numero: 1, valorCents: 140_000, vencimento: "2026-09-10" }]);
    expect(l.anexoNome).toBe("nota.xml");
    expect(l.totalCents).toBe(140_000);
  });

  it("NF-e continua gravando como NF", () => {
    const d = dadosImportaveis(doc("nfe-1-item.xml"));
    const l = lancamentoDoXml(d, escolhas(d.itens.length, { materiais: [{ modo: "existente", id: "m1" }] }), {
      fornecedor: { id: "f" },
      anexoUrl: "/api/fotos/x.xml",
      criadoPor: "u1",
    });
    expect(l.tipoDocumento).toBe("NF");
    expect(l.itens[0]).toMatchObject({ materialId: "m1", nbs: null });
  });
});

describe("mensagemNotaJaImportada", () => {
  it("pela chave: 50 posições é NFS-e", () => {
    expect(mensagemNotaJaImportada("1".repeat(50), "57")).toBe("Esta NFS-e já foi lançada (NFS-e 57).");
    expect(mensagemNotaJaImportada("1".repeat(44), "12")).toBe("Esta NF-e já foi lançada (NF 12).");
  });
});
