import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { parseNfseXml, type Nfse } from "@/services/nfse-xml";
import { VisualizacaoNfse } from "../visualizacao-nfse";

const fixture = (nome: string) =>
  readFileSync(path.join(__dirname, "../../../../services/__tests__/fixtures", nome), "utf8");

function nfse(xml: string): Nfse {
  const r = parseNfseXml(xml);
  if (!r.ok) throw new Error(r.erro);
  return r.nfse;
}

const html = (n: Nfse) => renderToStaticMarkup(<VisualizacaoNfse nfse={n} />).replace(/ /g, " ");

describe("VisualizacaoNfse", () => {
  const n = nfse(fixture("nfse-ibscbs-retencoes-cno.xml"));
  const h = html(n);

  it("traz as seções do DANFSe", () => {
    for (const secao of [
      "Prestador / fornecedor",
      "Tomador / adquirente",
      "Serviço prestado",
      "Tributação municipal (ISSQN)",
      "Tributação federal (exceto CBS)",
      "Tributação IBS / CBS",
      "Valor total da NFS-e",
      "Informações complementares",
    ]) {
      expect(h).toContain(secao);
    }
  });

  it("mostra identificação, partes e códigos formatados", () => {
    expect(h).toContain('aria-label="NFS-e 1234 de EMPREITEIRA BOA OBRA LTDA"');
    expect(h).toContain("15/10/2026");
    expect(h).toContain("20/10/2026 10:15");
    expect(h).toContain("11.222.333/0001-81");
    expect(h).toContain("12.345.678/0001-95");
    expect(h).toContain("07.02.01");
    expect(h).toContain("1.0101.11.00");
    expect(h).toContain("51.234.56789/01");
    expect(h).toContain("1 — Não optante");
    expect(h).toContain("100 — NFS-e regular");
  });

  it("valores, retenções e IBS/CBS", () => {
    expect(h).toContain("R$ 10.000,00");
    expect(h).toContain("R$ 7.785,00");
    expect(h).toContain("R$ 2.215,00");
    expect(h).toContain("2 — Retido pelo tomador");
    expect(h).toContain("R$ 1.100,00");
    expect(h).toContain("000 / 000001");
    expect(h).toContain("R$ 85,50");
    expect(h).toContain("0,9%");
  });

  it("sem IBS/CBS e sem tomador: a seção some e o tomador vira aviso", () => {
    const semGrupo = nfse(fixture("nfse-simples-sem-ibscbs.xml").replace(/<toma>[\s\S]*<\/toma>/, ""));
    const s = html(semGrupo);
    expect(s).not.toContain("Tributação IBS / CBS");
    expect(s).toContain("Tomador / adquirente não identificado na NFS-e");
    expect(s).toContain("3 — Optante — ME/EPP");
  });

  it("homologação ganha o selo de sem validade jurídica", () => {
    const h2 = html(nfse(fixture("nfse-simples-sem-ibscbs.xml").replace("<tpAmb>1</tpAmb>", "<tpAmb>2</tpAmb>")));
    expect(h2).toContain("Sem validade jurídica (homologação)");
  });

  it("texto do XML é escapado, nunca vira marcação", () => {
    const xml = fixture("nfse-simples-sem-ibscbs.xml").replace(
      "Instalação do quadro",
      "&lt;img src=x onerror=alert(1)&gt; Instalação do quadro",
    );
    const s = html(nfse(xml));
    expect(s).not.toContain("<img");
    expect(s).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
