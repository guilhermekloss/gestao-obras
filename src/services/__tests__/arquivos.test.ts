import { describe, expect, it } from "vitest";
import { extensaoDoNome, nomeDaUrlArquivo, nomeDaUrlXml, tipoPeloConteudo, urlArquivoValida } from "../arquivos";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("tipoPeloConteudo", () => {
  it("reconhece JPG, PNG, WEBP e PDF pela assinatura", () => {
    expect(tipoPeloConteudo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(tipoPeloConteudo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(tipoPeloConteudo(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("webp");
    expect(tipoPeloConteudo(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
  });
  it("recusa HTML, SVG e arquivo vazio, mesmo com nome de imagem", () => {
    expect(tipoPeloConteudo(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(tipoPeloConteudo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(tipoPeloConteudo(new TextEncoder().encode("RIFF1234WAVE"))).toBeNull();
    expect(tipoPeloConteudo(bytes())).toBeNull();
  });
});

describe("nomes e URLs de arquivo", () => {
  it("aceita o formato gerado pelo storage", () => {
    expect(extensaoDoNome("1760000000000-a1b2c3d4e5f6.pdf")).toBe("pdf");
    expect(nomeDaUrlArquivo("/api/fotos/1760000000000-a1b2c3d4e5f6.jpg")).toBe("1760000000000-a1b2c3d4e5f6.jpg");
  });
  it("recusa caminhos, extensões e endereços fora do padrão", () => {
    expect(extensaoDoNome("../etc/passwd")).toBeNull();
    expect(extensaoDoNome("1760000000000-a1b2c3d4e5f6.html")).toBeNull();
    expect(urlArquivoValida("https://exemplo.com/1760000000000-a1b2c3d4e5f6.jpg")).toBe(false);
    expect(urlArquivoValida("/api/fotos/1760000000000-a1b2c3d4e5f6.jpg?x=1")).toBe(false);
    expect(urlArquivoValida("")).toBe(false);
  });
});

describe("nomeDaUrlXml", () => {
  it("só o XML guardado pelo import, no endereço do app", () => {
    expect(nomeDaUrlXml("/api/fotos/1760000000000-a1b2c3d4e5f6.xml")).toBe("1760000000000-a1b2c3d4e5f6.xml");
    expect(nomeDaUrlXml("/api/fotos/1760000000000-a1b2c3d4e5f6.pdf")).toBeNull();
    expect(nomeDaUrlXml("/api/fotos/../segredo.xml")).toBeNull();
    expect(nomeDaUrlXml("https://exemplo.com/api/fotos/1760000000000-a1b2c3d4e5f6.xml")).toBeNull();
    expect(nomeDaUrlXml("/api/fotos/1760000000000-a1b2c3d4e5f6.xml?x=1")).toBeNull();
  });

  it("XML não é servido pela rota de arquivos (renderizado no navegador poderia executar script)", () => {
    expect(nomeDaUrlArquivo("/api/fotos/1760000000000-a1b2c3d4e5f6.xml")).toBeNull();
    expect(extensaoDoNome("1760000000000-a1b2c3d4e5f6.xml")).toBeNull();
  });
});
