import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = vi.fn();
vi.mock("@/lib/storage", () => ({ storage: { ler } }));
const { nfseDoAnexo } = await import("../nfse-anexo");

const fixture = (nome: string) => readFileSync(path.join(__dirname, "fixtures", nome));
const URL_XML = "/api/fotos/1700000000000-abcdef12.xml";

describe("nfseDoAnexo", () => {
  beforeEach(() => ler.mockReset());

  it("lê e interpreta o XML de NFS-e anexado", async () => {
    ler.mockResolvedValue(fixture("nfse-ibscbs-retencoes-cno.xml"));
    const n = await nfseDoAnexo(URL_XML);
    expect(ler).toHaveBeenCalledWith("1700000000000-abcdef12.xml");
    expect(n?.numero).toBe("1234");
  });

  it("anexo que não é XML do app nem chega ao storage", async () => {
    expect(await nfseDoAnexo(null)).toBeNull();
    expect(await nfseDoAnexo("/api/fotos/1700000000000-abcdef12.pdf")).toBeNull();
    expect(await nfseDoAnexo("/api/fotos/../../etc/passwd.xml")).toBeNull();
    expect(await nfseDoAnexo("https://exemplo.com/1700000000000-abcdef12.xml")).toBeNull();
    expect(ler).not.toHaveBeenCalled();
  });

  it("XML de NF-e, inválido ou sumido do storage: nulo, sem erro", async () => {
    ler.mockResolvedValueOnce(fixture("nfe-1-item.xml"));
    expect(await nfseDoAnexo(URL_XML)).toBeNull();
    ler.mockResolvedValueOnce(Buffer.from("<!DOCTYPE x><NFSe><infNFSe/></NFSe>"));
    expect(await nfseDoAnexo(URL_XML)).toBeNull();
    ler.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await nfseDoAnexo(URL_XML)).toBeNull();
  });
});
