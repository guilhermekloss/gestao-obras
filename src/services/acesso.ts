import type { Prisma, Role } from "@prisma/client";

/**
 * Obras que um usuário pode ver: `null` = todas; lista = só estas (pode ser
 * vazia — CAMPO sem nenhuma obra liberada não vê obra alguma).
 */
export type RestricaoObras = string[] | null;

/**
 * Só o CAMPO tem acesso por obra. ADMIN e ESCRITORIO veem todas sempre: o
 * financeiro rateia notas entre obras e não faz sentido ver metade de uma nota.
 */
export function restricaoDeObras(usuario: {
  role: Role;
  todasObras: boolean;
  obras: { obraId: string }[];
}): RestricaoObras {
  if (usuario.role !== "CAMPO" || usuario.todasObras) return null;
  return usuario.obras.map((o) => o.obraId);
}

export function podeVerObra(restricao: RestricaoObras, obraId: string): boolean {
  return restricao === null || restricao.includes(obraId);
}

/** Filtro para consultas de `Obra`. */
export function whereObrasPermitidas(restricao: RestricaoObras): Prisma.ObraWhereInput {
  return restricao === null ? {} : { id: { in: restricao } };
}

/** Filtro para consultas de registros com `obraId` (RDO...). */
export function whereObraIdPermitido(restricao: RestricaoObras): { obraId?: { in: string[] } } {
  return restricao === null ? {} : { obraId: { in: restricao } };
}

/** "Todas as obras", "Lote 03", "Lote 03, Lote 19 e mais 2"... */
export function descreverAcessoObras(
  role: Role,
  todasObras: boolean,
  nomesObras: string[],
): string {
  if (role !== "CAMPO" || todasObras) return "Todas as obras";
  if (nomesObras.length === 0) return "Nenhuma obra";
  if (nomesObras.length <= 2) return nomesObras.join(", ");
  return `${nomesObras.slice(0, 2).join(", ")} e mais ${nomesObras.length - 2}`;
}

/** Intervalo mínimo entre gravações de "último acesso" — evita um UPDATE por requisição. */
export const INTERVALO_ULTIMO_ACESSO_MS = 5 * 60 * 1000;

export function ultimoAcessoDesatualizado(ultimo: Date | null, agora: Date = new Date()): boolean {
  return !ultimo || agora.getTime() - ultimo.getTime() >= INTERVALO_ULTIMO_ACESSO_MS;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  ESCRITORIO: "Escritório",
  CAMPO: "Campo",
};

export const ROLE_DESCRICOES: Record<Role, string> = {
  ADMIN: "Acesso total, inclusive gestão de usuários e convites.",
  ESCRITORIO: "Lança notas, obras, orçamento e financeiro. Vê todas as obras.",
  CAMPO: "Diário de obra, fotos e avanço físico — sem valores financeiros.",
};
