import { prisma } from "@/lib/prisma";
import { diaDoBanco } from "./cronograma";
import type { LinhaBaseOficial } from "./linha-base";

// Não confere acesso: quem chama já autorizou as obras (ObraAutorizada, whereObrasPermitidas).
// O orçamento da foto vem junto, como peso: não o mostre para quem não vê valores (CAMPO).

const SELECAO = {
  id: true,
  obraId: true,
  nome: true,
  criadaEm: true,
  etapas: {
    select: { etapaId: true, nome: true, inicio: true, fim: true, orcamentoCents: true },
    orderBy: { id: "asc" },
  },
} as const;

/** Linha de base oficial de várias obras numa consulta só (dashboard, alertas). Obra sem linha fica fora do mapa. */
export async function carregarLinhasBaseOficiais(obraIds: string[]): Promise<Map<string, LinhaBaseOficial>> {
  if (obraIds.length === 0) return new Map();
  const linhas = await prisma.linhaBase.findMany({
    where: { obraId: { in: obraIds }, oficial: true },
    // se por algum motivo houver duas oficiais, vale a mais recente
    orderBy: [{ criadaEm: "desc" }, { id: "desc" }],
    select: SELECAO,
  });
  const mapa = new Map<string, LinhaBaseOficial>();
  for (const l of linhas) {
    if (mapa.has(l.obraId)) continue;
    mapa.set(l.obraId, {
      id: l.id,
      obraId: l.obraId,
      nome: l.nome,
      criadaEm: l.criadaEm,
      etapas: l.etapas.map((e) => ({
        etapaId: e.etapaId,
        nome: e.nome,
        inicio: e.inicio ? diaDoBanco(e.inicio) : null,
        fim: e.fim ? diaDoBanco(e.fim) : null,
        orcamentoCents: e.orcamentoCents,
      })),
    });
  }
  return mapa;
}

/** Linha de base oficial da obra, ou null se ainda não houver. */
export async function carregarLinhaBaseOficial(obraId: string): Promise<LinhaBaseOficial | null> {
  return (await carregarLinhasBaseOficiais([obraId])).get(obraId) ?? null;
}
