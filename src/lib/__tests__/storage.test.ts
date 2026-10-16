import { beforeEach, describe, expect, it, vi } from "vitest";

const objetos = new Map<string, Buffer>();
const save = vi.fn<(buffer: Buffer, opcoes?: object) => Promise<void>>(async function (this: { nome: string }, buffer: Buffer) {
  objetos.set(this.nome, buffer);
});

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket(bucketName: string) {
      return {
        bucketName,
        file(nome: string) {
          return {
            nome,
            save,
            async delete() {
              objetos.delete(nome);
            },
            async download() {
              const conteudo = objetos.get(nome);
              if (!conteudo) throw new Error("No such object");
              return [conteudo];
            },
          };
        },
      };
    }
  },
}));

const { storageGcs } = await import("../storage");

describe("storageGcs", () => {
  beforeEach(() => {
    objetos.clear();
    save.mockClear();
  });

  it("grava sob uploads/ sem sobrescrever e devolve a URL servida por /api/fotos", async () => {
    const url = await storageGcs("bucket-teste").salvar(Buffer.from("abc"), "jpg");
    expect(url).toMatch(/^\/api\/fotos\/\d+-[0-9a-f]{12}\.jpg$/);
    const nome = url.replace("/api/fotos/", "");
    expect(objetos.has(`uploads/${nome}`)).toBe(true);
    expect(save.mock.calls[0][1]).toMatchObject({ preconditionOpts: { ifGenerationMatch: 0 } });
  });

  it("lê o que gravou", async () => {
    const driver = storageGcs("bucket-teste");
    const url = await driver.salvar(Buffer.from("conteúdo"), "pdf");
    const lido = await driver.ler(url.replace("/api/fotos/", ""));
    expect(lido.toString()).toBe("conteúdo");
  });

  it("exclui só o objeto pedido, sob uploads/", async () => {
    const driver = storageGcs("bucket-teste");
    const url = await driver.salvar(Buffer.from("x"), "xml");
    const nome = url.replace("/api/fotos/", "");
    objetos.set("fora.xml", Buffer.from("fora de uploads/"));
    await driver.excluir(`../${nome}`);
    expect(objetos.has(`uploads/${nome}`)).toBe(false);
    expect(objetos.has("fora.xml")).toBe(true);
  });

  it("impede path traversal na leitura", async () => {
    objetos.set("uploads/segredo.txt", Buffer.from("ok"));
    objetos.set("segredo.txt", Buffer.from("fora de uploads/"));
    const lido = await storageGcs("bucket-teste").ler("../segredo.txt");
    expect(lido.toString()).toBe("ok");
  });
});
