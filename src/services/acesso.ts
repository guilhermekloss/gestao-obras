import type { Prisma, Role } from "@prisma/client";

export type RestricaoObras = string[] | null;

// ADMIN/ESCRITORIO veem todas: notas são rateadas entre obras e não dá para ver metade de uma.
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

export function whereObrasPermitidas(restricao: RestricaoObras): Prisma.ObraWhereInput {
  return restricao === null ? {} : { id: { in: restricao } };
}

export function whereObraIdPermitido(restricao: RestricaoObras): { obraId?: { in: string[] } } {
  return restricao === null ? {} : { obraId: { in: restricao } };
}

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
