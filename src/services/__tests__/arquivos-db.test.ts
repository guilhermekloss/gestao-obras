import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  arquivo: { create: vi.fn(), findUnique: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  foto: { findFirst: vi.fn(), findMany: vi.fn() },
  notaFiscal: { findMany: vi.fn() },
};
const storage = { salvar: vi.fn(), ler: vi.fn(), excluir: vi.fn() };

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/storage", () => ({ storage }));

const { arquivosSaoDoUsuario, descartarArquivosSemUso, guardarArquivo, usuarioPodeVerArquivo } = await import("../arquivos-db");

const NOME = "1760000000000-0123456789ab.jpg";
const URL_ARQ = `/api/fotos/${NOME}`;
const OUTRO = "1760000000001-ba9876543210.pdf";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

beforeEach(() => {
  for (const grupo of [prisma.arquivo, prisma.foto, prisma.notaFiscal, storage]) {
    for (const fn of Object.values(grupo)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  storage.salvar.mockResolvedValue(URL_ARQ);
  storage.excluir.mockResolvedValue(undefined);
  prisma.foto.findMany.mockResolvedValue([]);
  prisma.notaFiscal.findMany.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("guardarArquivo", () => {
  it("grava o conteúdo com a extensão real e registra quem enviou", async () => {
    const r = await guardarArquivo(JPEG, "u1");
    expect(r).toEqual({ ok: true, url: URL_ARQ });
    expect(storage.salvar).toHaveBeenCalledWith(JPEG, "jpg");
    expect(prisma.arquivo.create).toHaveBeenCalledWith({ data: { nome: NOME, enviadoPorId: "u1", tamanhoBytes: JPEG.length } });
  });

  it("recusa formato desconhecido sem tocar no storage", async () => {
    expect(await guardarArquivo(Buffer.from("<html></html>"), "u1")).toEqual({ ok: false, motivo: "formato" });
    expect(storage.salvar).not.toHaveBeenCalled();
  });

  it("se o registro falhar, remove o arquivo do storage e repassa o erro", async () => {
    prisma.arquivo.create.mockRejectedValue(new Error("banco fora"));
    await expect(guardarArquivo(JPEG, "u1")).rejects.toThrow("banco fora");
    expect(storage.excluir).toHaveBeenCalledWith(NOME);
  });
});

describe("usuarioPodeVerArquivo", () => {
  it("ADMIN e ESCRITORIO veem qualquer arquivo, sem consultar o banco", async () => {
    expect(await usuarioPodeVerArquivo({ id: "u1", role: "ESCRITORIO", obrasPermitidas: null }, NOME)).toBe(true);
    expect(prisma.arquivo.findUnique).not.toHaveBeenCalled();
  });

  it("CAMPO vê o que enviou", async () => {
    prisma.arquivo.findUnique.mockResolvedValue({ enviadoPorId: "u2" });
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: ["o1"] }, NOME)).toBe(true);
  });

  it("CAMPO vê foto de RDO só das obras liberadas para ele", async () => {
    prisma.arquivo.findUnique.mockResolvedValue({ enviadoPorId: "outro" });
    prisma.foto.findFirst.mockResolvedValue({ id: "f1" });
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: ["o1"] }, NOME)).toBe(true);
    expect(prisma.foto.findFirst).toHaveBeenCalledWith({
      where: { url: URL_ARQ, diario: { obraId: { in: ["o1"] } } },
      select: { id: true },
    });
  });

  it("CAMPO não vê anexo de lançamento (não está em nenhuma foto)", async () => {
    prisma.arquivo.findUnique.mockResolvedValue({ enviadoPorId: "outro" });
    prisma.foto.findFirst.mockResolvedValue(null);
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: null }, NOME)).toBe(false);
  });
});

describe("arquivosSaoDoUsuario", () => {
  it("sem arquivos nossos na lista, passa", async () => {
    expect(await arquivosSaoDoUsuario("u1", ["https://externo/x.jpg"])).toBe(true);
    expect(prisma.arquivo.count).not.toHaveBeenCalled();
  });
  it("exige que todos os arquivos tenham sido enviados pelo usuário, sem contar repetidos", async () => {
    prisma.arquivo.count.mockResolvedValue(2);
    expect(await arquivosSaoDoUsuario("u1", [URL_ARQ, `/api/fotos/${OUTRO}`, URL_ARQ])).toBe(true);
    prisma.arquivo.count.mockResolvedValue(1);
    expect(await arquivosSaoDoUsuario("u1", [URL_ARQ, `/api/fotos/${OUTRO}`])).toBe(false);
  });
});

describe("descartarArquivosSemUso", () => {
  it("apaga do storage e do registro o que nenhuma foto nem anexo usa", async () => {
    await descartarArquivosSemUso([URL_ARQ]);
    expect(storage.excluir).toHaveBeenCalledWith(NOME);
    expect(prisma.arquivo.deleteMany).toHaveBeenCalledWith({ where: { nome: NOME } });
  });

  it("preserva o que ainda é foto de outro RDO ou anexo de lançamento", async () => {
    prisma.foto.findMany.mockResolvedValue([{ url: URL_ARQ }]);
    prisma.notaFiscal.findMany.mockResolvedValue([{ anexoUrl: `/api/fotos/${OUTRO}` }]);
    await descartarArquivosSemUso([URL_ARQ, `/api/fotos/${OUTRO}`]);
    expect(storage.excluir).not.toHaveBeenCalled();
    expect(prisma.arquivo.deleteMany).not.toHaveBeenCalled();
  });

  it("ignora endereços que não são do app", async () => {
    await descartarArquivosSemUso(["https://externo/x.jpg", "/api/fotos/../segredo.jpg"]);
    expect(prisma.foto.findMany).not.toHaveBeenCalled();
    expect(storage.excluir).not.toHaveBeenCalled();
  });

  it("falha ao excluir um arquivo não impede os outros nem estoura para quem chamou", async () => {
    storage.excluir.mockRejectedValueOnce(new Error("GCS fora")).mockResolvedValue(undefined);
    await expect(descartarArquivosSemUso([URL_ARQ, `/api/fotos/${OUTRO}`])).resolves.toBeUndefined();
    expect(storage.excluir).toHaveBeenCalledTimes(2);
    expect(prisma.arquivo.deleteMany).toHaveBeenCalledTimes(1);
  });
});
