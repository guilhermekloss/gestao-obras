import { z } from "zod";
import { SENHA_MINIMA, problemaSenha } from "./senha";

export { SENHA_MINIMA } from "./senha";

export const VALIDADES_DIAS = [1, 3, 7, 15, 30] as const;
export const VALIDADE_PADRAO_DIAS = 7;

export type StatusConvite = "PENDENTE" | "ACEITO" | "EXPIRADO" | "REVOGADO";

export const STATUS_CONVITE_LABELS: Record<StatusConvite, string> = {
  PENDENTE: "Aguardando cadastro",
  ACEITO: "Cadastro feito",
  EXPIRADO: "Expirado",
  REVOGADO: "Cancelado",
};

/** Formato de um token gerado por `gerarToken` (lib/token.ts) — barra lixo antes de ir ao banco. */
export function tokenComFormatoValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function statusConvite(
  convite: { usadoEm: Date | null; revogadoEm: Date | null; expiraEm: Date },
  agora: Date = new Date(),
): StatusConvite {
  if (convite.usadoEm) return "ACEITO";
  if (convite.revogadoEm) return "REVOGADO";
  if (convite.expiraEm.getTime() <= agora.getTime()) return "EXPIRADO";
  return "PENDENTE";
}

export function calcularExpiracao(dias: number, agora: Date = new Date()): Date {
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

const papelSchema = z.enum(["ADMIN", "ESCRITORIO", "CAMPO"]);

/** O que o admin preenche ao gerar o convite. */
export const novoConviteSchema = z
  .object({
    nome: z.string().trim().max(120).optional(),
    email: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? normalizarEmail(v) : undefined))
      .pipe(z.email("E-mail inválido").optional()),
    role: papelSchema,
    todasObras: z.boolean(),
    obraIds: z.array(z.string().min(1)),
    validadeDias: z.coerce
      .number()
      .refine((d) => (VALIDADES_DIAS as readonly number[]).includes(d), "Validade inválida"),
  })
  .refine((c) => c.role !== "CAMPO" || c.todasObras || c.obraIds.length > 0, {
    message: "Escolha ao menos uma obra ou marque “Todas as obras”",
  });


/** O que o convidado preenche na página do link. */
export const cadastroConviteSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome").max(120),
    email: z.string().trim().transform(normalizarEmail).pipe(z.email("E-mail inválido")),
    senha: z.string(),
    confirmacao: z.string(),
  })
  .superRefine((c, ctx) => {
    const problema = problemaSenha(c.senha, { email: c.email, nome: c.nome });
    if (problema) ctx.addIssue({ code: "custom", message: problema, path: ["senha"] });
    else if (c.senha !== c.confirmacao) {
      ctx.addIssue({ code: "custom", message: "As senhas não conferem", path: ["confirmacao"] });
    }
  });

/**
 * Obras do convite que ainda existem: uma obra excluída entre o convite e o
 * cadastro é descartada em silêncio em vez de quebrar o cadastro.
 */
export function obrasValidasDoConvite(obraIds: string[], existentes: string[]): string[] {
  const set = new Set(existentes);
  return [...new Set(obraIds)].filter((id) => set.has(id));
}

/** Texto pronto para WhatsApp/e-mail. */
export function mensagemConvite(opcoes: {
  link: string;
  papel: string;
  nome?: string | null;
  expiraEm: Date;
}): string {
  const saudacao = opcoes.nome ? `Olá, ${opcoes.nome.split(" ")[0]}!` : "Olá!";
  const validade = opcoes.expiraEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    `${saudacao} Você foi convidado(a) para acessar a plataforma Gestão de Obras como ${opcoes.papel}.`,
    `Faça seu cadastro por este link (válido até ${validade}). Você vai criar uma senha de pelo menos ${SENHA_MINIMA} caracteres — pode ser uma frase fácil de lembrar:`,
    opcoes.link,
  ].join("\n");
}
