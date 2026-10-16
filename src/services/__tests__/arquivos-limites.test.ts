import { describe, expect, it } from "vitest";
import { nomeDaUrlArquivo, tipoPeloConteudo, urlDoArquivo } from "../arquivos";

const bytes = (...b: number[]) => new Uint8Array(b);
const texto = (s: string) => new TextEncoder().encode(s);

describe("tipoPeloConteudo: tamanho mínimo e posições", () => {
  it("aceita arquivo com exatamente o tamanho da assinatura", () => {
    expect(tipoPeloConteudo(bytes(0xff, 0xd8, 0xff))).toBe("jpg");
    expect(tipoPeloConteudo(texto("%PDF-"))).toBe("pdf");
    expect(tipoPeloConteudo(texto("RIFF\0\0\0\0WEBP"))).toBe("webp");
  });
  it("recusa assinatura truncada", () => {
    expect(tipoPeloConteudo(bytes(0xff, 0xd8))).toBeNull();
    expect(tipoPeloConteudo(texto("%PDF"))).toBeNull();
    expect(tipoPeloConteudo(texto("RIFF\0\0\0\0WEB"))).toBeNull();
  });
  it("WEBP exige RIFF no início e WEBP na posição 8", () => {
    expect(tipoPeloConteudo(texto("XXXX\0\0\0\0WEBP"))).toBeNull();
    expect(tipoPeloConteudo(texto("RIFF\0\0\0\0WEBQ"))).toBeNull();
    expect(tipoPeloConteudo(texto("WEBP\0\0\0\0RIFF"))).toBeNull();
  });
});

describe("urlDoArquivo / nomeDaUrlArquivo", () => {
  const nome = "1760000000000-a1b2c3d4e5f6.jpg";
  it("monta a URL e volta ao nome", () => {
    expect(urlDoArquivo(nome)).toBe(`/api/fotos/${nome}`);
    expect(nomeDaUrlArquivo(urlDoArquivo(nome))).toBe(nome);
  });
  it("exige o prefixo do app mesmo quando o resto parece um nome válido", () => {
    expect(nomeDaUrlArquivo("x".repeat("/api/fotos/".length) + nome)).toBeNull();
    expect(nomeDaUrlArquivo(nome)).toBeNull();
  });
});
