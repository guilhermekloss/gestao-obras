import { describe, expect, it } from "vitest";
import { cadastroConviteSchema, mensagemConvite, normalizarEmail, novoConviteSchema, tokenComFormatoValido } from "../convite";

const token43 = "A".repeat(43);

describe("tokenComFormatoValido", () => {
  it("exige exatamente 43 caracteres do alfabeto base64url", () => {
    expect(tokenComFormatoValido(token43)).toBe(true);
    expect(tokenComFormatoValido("a-_9".repeat(10) + "abc")).toBe(true);
    expect(tokenComFormatoValido(token43 + "A")).toBe(false);
    expect(tokenComFormatoValido(token43.slice(1))).toBe(false);
  });
  it("recusa lixo antes ou depois", () => {
    expect(tokenComFormatoValido("!" + token43)).toBe(false);
    expect(tokenComFormatoValido(token43 + "!")).toBe(false);
    expect(tokenComFormatoValido(token43 + "\n")).toBe(false);
  });
});

describe("normalizarEmail", () => {
  it("tira espaços e põe em minúsculas", () => {
    expect(normalizarEmail("  Maria@Obra.COM ")).toBe("maria@obra.com");
  });
});

describe("novoConviteSchema: obras do perfil de campo", () => {
  const base = { role: "CAMPO", validadeDias: 7, todasObras: false, obraIds: [] as string[] };
  it("campo sem obra e sem 'todas as obras' é recusado, com a mensagem", () => {
    const r = novoConviteSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Escolha ao menos uma obra ou marque “Todas as obras”");
  });
  it("campo com 'todas as obras' ou com alguma obra passa", () => {
    expect(novoConviteSchema.safeParse({ ...base, todasObras: true }).success).toBe(true);
    expect(novoConviteSchema.safeParse({ ...base, obraIds: ["o1"] }).success).toBe(true);
  });
  it("escritório e admin passam sem obras", () => {
    expect(novoConviteSchema.safeParse({ ...base, role: "ESCRITORIO" }).success).toBe(true);
    expect(novoConviteSchema.safeParse({ ...base, role: "ADMIN" }).success).toBe(true);
  });
  it("e-mail é opcional, normalizado e validado", () => {
    expect(novoConviteSchema.parse({ ...base, role: "ADMIN", email: "  Ana@Obra.com " }).email).toBe("ana@obra.com");
    expect(novoConviteSchema.parse({ ...base, role: "ADMIN", email: "  " }).email).toBeUndefined();
    expect(novoConviteSchema.safeParse({ ...base, role: "ADMIN", email: "sem-arroba" }).success).toBe(false);
  });
});

describe("cadastroConviteSchema: onde cada erro aparece", () => {
  const ok = { nome: "Maria Souza", email: "Maria.Souza@Obra.com", senha: "tijolo azul na janela", confirmacao: "tijolo azul na janela" };
  const erros = (v: unknown) => cadastroConviteSchema.safeParse(v).error?.issues.map((i) => [i.path.join("."), i.message]);

  it("aceita e normaliza o e-mail", () => {
    expect(cadastroConviteSchema.parse(ok).email).toBe("maria.souza@obra.com");
  });
  it("problema da senha aparece no campo senha", () => {
    expect(erros({ ...ok, senha: "curta", confirmacao: "curta" })).toEqual([["senha", "A senha precisa ter no mínimo 10 caracteres"]]);
  });
  it("senha com o próprio e-mail é recusada (usa o e-mail informado)", () => {
    expect(erros({ ...ok, senha: "maria.souza-2026", confirmacao: "maria.souza-2026" })).toEqual([
      ["senha", "A senha não pode conter o seu e-mail"],
    ]);
  });
  it("senha igual ao nome é recusada (usa o nome informado)", () => {
    expect(erros({ ...ok, nome: "Maria Cavalcanti", senha: "Cavalcanti", confirmacao: "Cavalcanti" })).toEqual([
      ["senha", "A senha não pode ser o seu nome"],
    ]);
  });
  it("confirmação diferente aparece no campo confirmacao", () => {
    expect(erros({ ...ok, confirmacao: "outra frase qualquer" })).toEqual([["confirmacao", "As senhas não conferem"]]);
  });
});

describe("mensagemConvite", () => {
  const expiraEm = new Date("2026-11-01T02:00:00Z"); // 31/10 23:00 em São Paulo
  it("saúda pelo primeiro nome e mostra a validade no fuso de São Paulo", () => {
    expect(mensagemConvite({ link: "https://app/convite/x", papel: "Campo", nome: "Maria Souza", expiraEm })).toBe(
      [
        "Olá, Maria! Você foi convidado(a) para acessar a plataforma Gestão de Obras como Campo.",
        "Faça seu cadastro por este link (válido até 31/10/2026). Você vai criar uma senha de pelo menos 10 caracteres — pode ser uma frase fácil de lembrar:",
        "https://app/convite/x",
      ].join("\n"),
    );
  });
  it("sem nome, saudação genérica", () => {
    expect(mensagemConvite({ link: "l", papel: "Admin", nome: null, expiraEm }).startsWith("Olá! Você foi convidado(a)")).toBe(true);
  });
});
