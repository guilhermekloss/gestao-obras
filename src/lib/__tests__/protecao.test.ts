import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  infracao: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  bloqueio: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  tentativaLogin: { deleteMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma }));

process.env.IPS_CONFIAVEIS = "200.1.2.0/24";
const { aplicarBloqueio, bloqueioAtivo, consumirLimite, esquecerIpDoCache, ipForaDoSite, ipVigiado, limparRegistrosDeProtecao, registrarInfracao } =
  await import("../protecao");
const { REGRAS } = await import("@/services/protecao-ativa");

const agora = Date.now();
const recentes = (n: number) => Array.from({ length: n }, (_, i) => ({ criadoEm: new Date(agora - (i + 1) * 1000) }));

beforeEach(() => {
  for (const grupo of Object.values(prisma)) for (const fn of Object.values(grupo)) fn.mockReset();
  prisma.bloqueio.findFirst.mockResolvedValue(null);
  prisma.bloqueio.count.mockResolvedValue(0);
  prisma.bloqueio.findMany.mockResolvedValue([]);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("ipVigiado", () => {
  it("IP confiável e IP ausente ficam fora das regras por IP", () => {
    expect(ipVigiado("200.1.2.77")).toBeNull();
    expect(ipVigiado(null)).toBeNull();
    expect(ipVigiado("8.8.8.8")).toBe("8.8.8.8");
  });
});

describe("bloqueioAtivo", () => {
  it("sem chave não consulta o banco", async () => {
    expect(await bloqueioAtivo(["convite"], [])).toBeNull();
    expect(prisma.bloqueio.findFirst).not.toHaveBeenCalled();
  });

  it("procura só nas regras pedidas, ainda valendo e não liberado", async () => {
    await bloqueioAtivo(["convite"], ["8.8.8.8"]);
    const { where } = prisma.bloqueio.findFirst.mock.calls[0][0];
    expect(where).toMatchObject({ regra: { in: ["convite"] }, chave: { in: ["8.8.8.8"] }, liberadoEm: null });
    expect(where.ate.gt).toBeInstanceOf(Date);
  });
});

describe("registrarInfracao", () => {
  it("abaixo do limite só grava a ocorrência", async () => {
    prisma.infracao.findMany.mockResolvedValue(recentes(REGRAS.convite.max - 1));
    expect(await registrarInfracao("convite", "8.8.8.8")).toBeNull();
    expect(prisma.infracao.create).toHaveBeenCalledWith({ data: { regra: "convite", chave: "8.8.8.8" } });
    expect(prisma.bloqueio.create).not.toHaveBeenCalled();
  });

  it("no limite cria o bloqueio com o prazo da reincidência", async () => {
    prisma.infracao.findMany.mockResolvedValue(recentes(REGRAS.convite.max));
    prisma.bloqueio.count.mockResolvedValue(1);
    const ate = await registrarInfracao("convite", "8.8.8.8");
    expect(ate!.getTime() - Date.now()).toBeGreaterThan(REGRAS.convite.duracoesMs[1] - 5000);
    expect(ate!.getTime() - Date.now()).toBeLessThanOrEqual(REGRAS.convite.duracoesMs[1]);
    expect(prisma.bloqueio.create).toHaveBeenCalledWith({
      data: { regra: "convite", chave: "8.8.8.8", ate, motivo: REGRAS.convite.motivo },
    });
    expect(prisma.bloqueio.count.mock.calls[0][0].where).toMatchObject({ regra: "convite", chave: "8.8.8.8", liberadoEm: null });
  });

  it("ocorrências anteriores ao último bloqueio não contam", async () => {
    prisma.infracao.findMany.mockResolvedValue(recentes(REGRAS.convite.max));
    prisma.bloqueio.findFirst.mockResolvedValue({ criadoEm: new Date(agora) });
    expect(await registrarInfracao("convite", "8.8.8.8")).toBeNull();
    expect(prisma.bloqueio.create).not.toHaveBeenCalled();
  });
});

describe("consumirLimite", () => {
  it("bloqueado: recusa com a mensagem da regra e não conta o uso", async () => {
    prisma.bloqueio.findFirst.mockResolvedValueOnce({ regra: "assistente", ate: new Date(agora + 60_000) });
    await expect(consumirLimite("assistente", "u1")).rejects.toThrowError(
      expect.objectContaining({ constructor: Error, message: REGRAS.assistente.mensagem }),
    );
    expect(prisma.infracao.create).not.toHaveBeenCalled();
  });

  it("livre: conta o uso, e a chamada que fecha o limite ainda passa", async () => {
    prisma.infracao.findMany.mockResolvedValue(recentes(REGRAS.assistente.max));
    await expect(consumirLimite("assistente", "u1")).resolves.toBeUndefined();
    expect(prisma.bloqueio.create).toHaveBeenCalled();
  });
});

describe("limparRegistrosDeProtecao", () => {
  it("infrações saem antes (7 dias) que tentativas e bloqueios (90 dias)", async () => {
    const ref = new Date("2026-10-23T00:00:00Z");
    await limparRegistrosDeProtecao(ref);
    const corte = (fn: ReturnType<typeof vi.fn>) => (ref.getTime() - fn.mock.calls[0][0].where.criadoEm.lt.getTime()) / 86_400_000;
    expect(corte(prisma.infracao.deleteMany)).toBe(7);
    expect(corte(prisma.bloqueio.deleteMany)).toBe(90);
    expect(corte(prisma.tentativaLogin.deleteMany)).toBe(90);
  });
});

describe("aplicarBloqueio e recidiva", () => {
  const criados = () => prisma.bloqueio.create.mock.calls.map((c) => c[0].data.regra);

  it("regra por usuário ou e-mail não confere recidiva", async () => {
    await aplicarBloqueio("upload", "u1", new Date(agora + 1000), "m");
    await aplicarBloqueio("login-email", "a@b.c", new Date(agora + 1000), "m");
    expect(prisma.bloqueio.findMany).not.toHaveBeenCalled();
    expect(criados()).toEqual(["upload", "login-email"]);
  });

  it("terceiro bloqueio do IP em 24 h tira o IP do site por 24 h", async () => {
    prisma.bloqueio.findMany.mockResolvedValue(recentes(3));
    await aplicarBloqueio("convite", "8.8.8.8", new Date(agora + 1000), "m");
    expect(criados()).toEqual(["convite", "recidiva"]);
    const recidiva = prisma.bloqueio.create.mock.calls[1][0].data;
    expect(recidiva.chave).toBe("8.8.8.8");
    expect(recidiva.ate.getTime() - Date.now()).toBeGreaterThan(24 * 3600_000 - 5000);
    const filtro = prisma.bloqueio.findMany.mock.calls[0][0].where;
    expect(filtro).toMatchObject({ chave: "8.8.8.8", liberadoEm: null, regra: { notIn: ["recidiva", "manual"] } });
  });

  it("abaixo de 3, ou já contados numa recidiva anterior, não repete", async () => {
    prisma.bloqueio.findMany.mockResolvedValue(recentes(2));
    await aplicarBloqueio("login-ip", "8.8.8.8", new Date(agora + 1000), "m");
    prisma.bloqueio.findMany.mockResolvedValue(recentes(3));
    prisma.bloqueio.findFirst.mockResolvedValue({ criadoEm: new Date(agora) });
    await aplicarBloqueio("sefaz", "8.8.8.8", new Date(agora + 1000), "m");
    expect(criados()).toEqual(["login-ip", "sefaz"]);
  });
});

describe("ipForaDoSite", () => {
  it("consulta só as regras do site e guarda a resposta por um tempo", async () => {
    prisma.bloqueio.findFirst.mockResolvedValueOnce({ regra: "varredura", ate: new Date(agora + 60_000) });
    expect(await ipForaDoSite("9.9.9.9")).toBe(true);
    expect(await ipForaDoSite("9.9.9.9")).toBe(true);
    expect(prisma.bloqueio.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.bloqueio.findFirst.mock.calls[0][0].where.regra.in.sort()).toEqual(["manual", "recidiva", "varredura"]);

    esquecerIpDoCache("9.9.9.9");
    expect(await ipForaDoSite("9.9.9.9")).toBe(false);
    expect(prisma.bloqueio.findFirst).toHaveBeenCalledTimes(2);
  });

  it("bloqueio novo na mesma instância vale na hora, sem esperar o cache", async () => {
    expect(await ipForaDoSite("6.6.6.6")).toBe(false);
    prisma.bloqueio.findFirst.mockResolvedValue({ regra: "varredura", ate: new Date(agora + 60_000) });
    await aplicarBloqueio("varredura", "6.6.6.6", new Date(agora + 60_000), "m");
    expect(await ipForaDoSite("6.6.6.6")).toBe(true);
  });

  it("bloqueio guardado no cache vence no prazo dele", async () => {
    vi.useFakeTimers({ now: agora });
    try {
      prisma.bloqueio.findFirst.mockResolvedValueOnce({ regra: "manual", ate: new Date(agora + 1000) });
      expect(await ipForaDoSite("7.7.7.7")).toBe(true);
      vi.setSystemTime(agora + 2000);
      expect(await ipForaDoSite("7.7.7.7")).toBe(false);
      expect(prisma.bloqueio.findFirst).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
