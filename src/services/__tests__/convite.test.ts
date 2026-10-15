import { describe, expect, it } from "vitest";
import { gerarToken, hashToken } from "@/lib/token";
import {
  cadastroConviteSchema,
  calcularExpiracao,
  mensagemConvite,
  novoConviteSchema,
  obrasValidasDoConvite,
  statusConvite,
  tokenComFormatoValido,
} from "../convite";

describe("token do convite", () => {
  it("gera tokens únicos no formato esperado", () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).not.toBe(b);
    expect(tokenComFormatoValido(a)).toBe(true);
  });

  it("hash é determinístico e não contém o token", () => {
    const t = gerarToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it("recusa formatos inválidos antes de ir ao banco", () => {
    expect(tokenComFormatoValido("")).toBe(false);
    expect(tokenComFormatoValido("curto")).toBe(false);
    expect(tokenComFormatoValido(`${"a".repeat(42)}/`)).toBe(false);
  });
});

describe("statusConvite", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  const base = { usadoEm: null, revogadoEm: null, expiraEm: new Date("2026-10-20T12:00:00Z") };

  it("pendente dentro da validade", () => {
    expect(statusConvite(base, agora)).toBe("PENDENTE");
  });
  it("expirado no instante do vencimento", () => {
    expect(statusConvite({ ...base, expiraEm: agora }, agora)).toBe("EXPIRADO");
  });
  it("usado vence cancelado e expirado", () => {
    expect(statusConvite({ ...base, usadoEm: agora, revogadoEm: agora, expiraEm: new Date(0) }, agora)).toBe("ACEITO");
  });
  it("cancelado vence expirado", () => {
    expect(statusConvite({ ...base, revogadoEm: agora, expiraEm: new Date(0) }, agora)).toBe("REVOGADO");
  });
});

describe("novoConviteSchema", () => {
  const valido = { role: "CAMPO", todasObras: true, obraIds: [], validadeDias: "7" };

  it("aceita convite sem nome e sem e-mail", () => {
    expect(novoConviteSchema.safeParse(valido).success).toBe(true);
  });
  it("normaliza o e-mail", () => {
    const r = novoConviteSchema.safeParse({ ...valido, email: "  Joao@Obra.COM " });
    expect(r.success && r.data.email).toBe("joao@obra.com");
  });
  it("CAMPO limitado precisa de ao menos uma obra", () => {
    expect(novoConviteSchema.safeParse({ ...valido, todasObras: false }).success).toBe(false);
    expect(novoConviteSchema.safeParse({ ...valido, todasObras: false, obraIds: ["x"] }).success).toBe(true);
  });
  it("só aceita as validades oferecidas", () => {
    expect(novoConviteSchema.safeParse({ ...valido, validadeDias: "2" }).success).toBe(false);
  });
});

describe("cadastroConviteSchema", () => {
  const ok = { nome: "João Silva", email: "Joao@Obra.com", senha: "tijolo-e-cimento", confirmacao: "tijolo-e-cimento" };
  it("aceita e normaliza o e-mail", () => {
    const r = cadastroConviteSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe("joao@obra.com");
  });
  it("exige senha mínima e confirmação igual", () => {
    expect(cadastroConviteSchema.safeParse({ ...ok, senha: "curta", confirmacao: "curta" }).success).toBe(false);
    const r = cadastroConviteSchema.safeParse({ ...ok, confirmacao: "tijolo-e-areia" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].path).toEqual(["confirmacao"]);
  });
});

describe("obrasValidasDoConvite", () => {
  it("descarta obras excluídas e repetidas", () => {
    expect(obrasValidasDoConvite(["a", "b", "a", "c"], ["a", "c"])).toEqual(["a", "c"]);
  });
});

describe("calcularExpiracao e mensagemConvite", () => {
  it("soma dias corridos", () => {
    expect(calcularExpiracao(7, new Date("2026-10-14T12:00:00Z")).toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });
  it("monta a mensagem com primeiro nome, papel, validade e link", () => {
    const m = mensagemConvite({
      link: "https://app/convite/x",
      papel: "Campo",
      nome: "Maria Souza",
      expiraEm: new Date("2026-10-21T15:00:00Z"),
    });
    expect(m).toContain("Olá, Maria!");
    expect(m).toContain("como Campo");
    expect(m).toContain("21/10/2026");
    expect(m.endsWith("https://app/convite/x")).toBe(true);
  });
});
