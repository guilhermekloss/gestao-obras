import { z } from "zod";

// Abaixo do teto do Int do PostgreSQL: o estouro levaria o erro do banco para a tela.
export const MAX_CENTS = 2_000_000_000;

export const centavos = z.number().int().min(0).max(MAX_CENTS, "Valor acima do limite permitido");

function dataIsoValida(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1900 || ano > 2200) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export const dataIso = (obrigatoria = "Data é obrigatória") =>
  z.string().min(1, obrigatoria).refine(dataIsoValida, "Data inválida");

export const texto = (max: number, rotulo = "Texto") =>
  z.string().max(max, `${rotulo} pode ter no máximo ${max} caracteres`);

export const id = (obrigatorio = "Campo obrigatório") => z.string().min(1, obrigatorio).max(64);
