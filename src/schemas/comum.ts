import { z } from "zod";

/**
 * Limites de entrada compartilhados. Sem eles, um valor fora da faixa estoura
 * a coluna Int do banco (a mensagem do erro iria para a tela) e textos enormes
 * incham o banco e as telas.
 */

/** Maior valor em centavos aceito num campo (R$ 20 milhões) — abaixo do teto do Int do PostgreSQL. */
export const MAX_CENTS = 2_000_000_000;

export const centavos = z.number().int().min(0).max(MAX_CENTS, "Valor acima do limite permitido");

/** `yyyy-mm-dd` que existe no calendário, entre 1900 e 2200. */
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

/** Ids gerados pelo banco (cuid) — barra lixo grande antes de ir à consulta. */
export const id = (obrigatorio = "Campo obrigatório") => z.string().min(1, obrigatorio).max(64);
