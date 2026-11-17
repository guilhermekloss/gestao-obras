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
const URL_OUTRO = `/api/fotos/${OUTRO}`;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

let erroNoConsole: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const grupo of [prisma.arquivo, prisma.foto, prisma.notaFiscal, storage]) {
    for (const fn of Object.values(grupo)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  storage.excluir.mockResolvedValue(undefined);
  // padrão seguro: nenhuma foto encontrada (null, como o Prisma devolve)
  prisma.foto.findFirst.mockResolvedValue(null);
  prisma.foto.findMany.mockResolvedValue([]);
  prisma.notaFiscal.findMany.mockResolvedValue([]);
  erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("usuarioPodeVerArquivo: regras de acesso do CAMPO", () => {
  it("quem enviou vê o arquivo, sem depender de foto de RDO", async () => {
    prisma.arquivo.findUnique.mockResolvedValue({ enviadoPorId: "u2" });
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: ["o1"] }, NOME)).toBe(true);
    expect(prisma.arquivo.findUnique).toHaveBeenCalledWith({ where: { nome: NOME }, select: { enviadoPorId: true } });
    expect(prisma.foto.findFirst).not.toHaveBeenCalled();
  });

  it("arquivo sem registro de envio e fora de RDO: não vê", async () => {
    prisma.arquivo.findUnique.mockResolvedValue(null);
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: ["o1"] }, NOME)).toBe(false);
  });

  it("CAMPO com acesso a todas as obras procura a foto sem filtro de obra", async () => {
    prisma.arquivo.findUnique.mockResolvedValue({ enviadoPorId: "outro" });
    prisma.foto.findFirst.mockResolvedValue({ id: "f1" });
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: null }, NOME)).toBe(true);
    expect(prisma.foto.findFirst).toHaveBeenCalledWith({ where: { url: URL_ARQ }, select: { id: true } });
  });

  it("CAMPO sem nenhuma obra liberada filtra por lista vazia (não vê nada)", async () => {
    prisma.arquivo.findUnique.mockResolvedValue({ enviadoPorId: "outro" });
    expect(await usuarioPodeVerArquivo({ id: "u2", role: "CAMPO", obrasPermitidas: [] }, NOME)).toBe(false);
    expect(prisma.foto.findFirst).toHaveBeenCalledWith({
      where: { url: URL_ARQ, diario: { obraId: { in: [] } } },
      select: { id: true },
    });
  });
});

describe("guardarArquivo: endereço inesperado do storage", () => {
  it("recusa e não tenta apagar nem registrar um nome que não existe", async () => {
    storage.salvar.mockResolvedValue("https://externo/x.jpg");
    await expect(guardarArquivo(JPEG, "u1")).rejects.toThrow("O storage devolveu um endereço fora do padrão");
    expect(prisma.arquivo.create).not.toHaveBeenCalled();
    expect(storage.excluir).not.toHaveBeenCalled();
  });

  it("falha ao apagar o arquivo órfão não esconde o erro original", async () => {
    storage.salvar.mockResolvedValue(URL_ARQ);
    prisma.arquivo.create.mockRejectedValue(new Error("banco fora"));
    storage.excluir.mockRejectedValue(new Error("GCS fora"));
    await expect(guardarArquivo(JPEG, "u1")).rejects.toThrow("banco fora");
  });
});

describe("arquivosSaoDoUsuario: consulta", () => {
  it("conta só os arquivos da lista enviados pelo próprio usuário", async () => {
    prisma.arquivo.count.mockResolvedValue(2);
    await arquivosSaoDoUsuario("u1", [URL_ARQ, URL_OUTRO]);
    expect(prisma.arquivo.count).toHaveBeenCalledWith({ where: { nome: { in: [NOME, OUTRO] }, enviadoPorId: "u1" } });
  });
});

describe("descartarArquivosSemUso: consulta e log", () => {
  it("procura uso em fotos e anexos pelas URLs candidatas", async () => {
    await descartarArquivosSemUso([URL_ARQ, URL_OUTRO]);
    expect(prisma.foto.findMany).toHaveBeenCalledWith({ where: { url: { in: [URL_ARQ, URL_OUTRO] } }, select: { url: true } });
    expect(prisma.notaFiscal.findMany).toHaveBeenCalledWith({
      where: { anexoUrl: { in: [URL_ARQ, URL_OUTRO] } },
      select: { anexoUrl: true },
    });
  });

  it("registra no log qual arquivo falhou", async () => {
    const erro = new Error("GCS fora");
    storage.excluir.mockRejectedValue(erro);
    await descartarArquivosSemUso([URL_ARQ]);
    expect(erroNoConsole).toHaveBeenCalledWith(`Falha ao descartar o arquivo ${NOME}`, erro);
  });
});
