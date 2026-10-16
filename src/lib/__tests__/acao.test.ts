import { beforeEach, describe, expect, it, vi } from "vitest";

const criarAtividade = vi.fn(async (_: object) => ({}));
const revalidatePath = vi.fn();
const exigirPapel = vi.fn();
const exigirAcessoObra = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { atividade: { create: criarAtividade } } }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../auth", () => ({ exigirPapel, exigirAcessoObra }));

const { acaoDeEscrita, mensagemDeErro } = await import("../acao");
const { anotarAtividade, ignorarAtividade } = await import("../atividade");

const USUARIO = { id: "u1", role: "ADMIN", obrasPermitidas: null };

// o Next reconhece o redirect() pelo digest; é o que unstable_rethrow procura
const redirecionamento = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/notas;307;" });

beforeEach(() => {
  criarAtividade.mockClear();
  revalidatePath.mockClear();
  exigirPapel.mockReset().mockResolvedValue(USUARIO);
  exigirAcessoObra.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acaoDeEscrita", () => {
  it("exige os papéis pedidos antes de executar", async () => {
    exigirPapel.mockRejectedValue(new Error("Sem permissão"));
    const handler = vi.fn(async () => ({ ok: true }));
    await expect(acaoDeEscrita({ papeis: ["ADMIN"] }, handler)()).rejects.toThrow("Sem permissão");
    expect(exigirPapel).toHaveBeenCalledWith("ADMIN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("no sucesso registra a atividade com o detalhe anotado e revalida as rotas", async () => {
    const acao = acaoDeEscrita({ revalidar: ["/notas", "/contas"], atividade: "nota.criar" }, async () => {
      anotarAtividade({ descricao: "Lançou a NF 1", entidade: "nota", entidadeId: "n1", obraIds: ["o1", "o1"], valorCents: 500 });
      return { ok: true };
    });
    expect(await acao()).toEqual({ ok: true });
    expect(criarAtividade).toHaveBeenCalledWith({
      data: expect.objectContaining({ usuarioId: "u1", tipo: "nota.criar", descricao: "Lançou a NF 1", obraIds: ["o1"], valorCents: 500 }),
    });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/notas", "/contas"]);
  });

  it("aceita atividade e rotas calculadas a partir dos argumentos", async () => {
    const acao = acaoDeEscrita(
      {
        revalidar: (id: string) => [`/obras/${id}`],
        atividade: (id: string) => (id ? "nota.editar" : "nota.criar"),
      },
      async (_u, _id: string) => ({ ok: true }),
    );
    await acao("n1");
    expect(criarAtividade.mock.calls[0][0]).toMatchObject({ data: { tipo: "nota.editar" } });
    expect(revalidatePath).toHaveBeenCalledWith("/obras/n1");
  });

  it("resultado com ok: false não registra nem revalida", async () => {
    const acao = acaoDeEscrita({ revalidar: ["/notas"], atividade: "nota.criar" }, async () => ({ ok: false, erro: "não" }));
    expect(await acao()).toEqual({ ok: false, erro: "não" });
    expect(criarAtividade).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ignorarAtividade evita o registro mesmo com sucesso", async () => {
    const acao = acaoDeEscrita({ atividade: "nota.criar" }, async () => {
      ignorarAtividade();
      return { ok: true };
    });
    await acao();
    expect(criarAtividade).not.toHaveBeenCalled();
  });

  it("Error de regra de negócio chega ao usuário; outros viram mensagem genérica", async () => {
    const negocio = acaoDeEscrita({}, async () => {
      throw new Error("Etapa em uso");
    });
    expect(await negocio()).toEqual({ ok: false, erro: "Etapa em uso" });

    const tecnico = acaoDeEscrita({}, async (): Promise<{ ok: boolean; erro?: string }> => {
      throw Object.assign(new Error("connection refused 10.0.0.5:5432"), { code: "ECONNREFUSED" });
    });
    const r = await tecnico();
    expect(r.ok).toBe(false);
    expect(r.erro).not.toMatch(/10\.0\.0\.5/);
    expect(r.erro).toMatch(/Não foi possível concluir/);
  });

  it("redirect depois de anotar é sucesso: registra a atividade e repassa o redirect", async () => {
    const redirect = redirecionamento();
    const acao = acaoDeEscrita({ atividade: "nota.importar_xml" }, async () => {
      anotarAtividade({ descricao: "Importou" });
      throw redirect;
    });
    await expect(acao()).rejects.toBe(redirect);
    expect(criarAtividade).toHaveBeenCalledTimes(1);
  });

  it("redirect sem anotar não registra nada", async () => {
    const redirect = redirecionamento();
    const acao = acaoDeEscrita({ atividade: "nota.importar_xml" }, async () => {
      throw redirect;
    });
    await expect(acao()).rejects.toBe(redirect);
    expect(criarAtividade).not.toHaveBeenCalled();
  });

  describe("opção obra", () => {
    it("checa o acesso à obra dos argumentos antes de executar", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const acao = acaoDeEscrita({ obra: (obraId: string) => obraId }, async (_u, _obraId: string) => handler());
      await acao("o1");
      expect(exigirAcessoObra).toHaveBeenCalledWith(USUARIO, "o1");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("sem acesso responde como registro inexistente e não executa nem registra", async () => {
      exigirAcessoObra.mockImplementation(() => {
        throw new Error("Registro não encontrado");
      });
      const handler = vi.fn(async () => ({ ok: true }));
      const acao = acaoDeEscrita(
        { obra: (obraId: string) => obraId, atividade: "obra.editar", revalidar: ["/obras"] },
        async (_u, _obraId: string) => handler(),
      );
      expect(await acao("o1")).toEqual({ ok: false, erro: "Registro não encontrado" });
      expect(handler).not.toHaveBeenCalled();
      expect(criarAtividade).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("não checa quando a action não informa obra", async () => {
      await acaoDeEscrita({ obra: () => undefined }, async () => ({ ok: true }))();
      expect(exigirAcessoObra).not.toHaveBeenCalled();
    });
  });
});

describe("mensagemDeErro", () => {
  it("usa o padrão informado para erros técnicos", () => {
    expect(mensagemDeErro(new TypeError("x is undefined"), "Erro ao ler")).toBe("Erro ao ler");
  });
});
