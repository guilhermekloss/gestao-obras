import type { Dia, EtapaPlano } from "./cronograma";

// Linha de base: foto das datas, do nome e do orçamento das etapas. Regras puras; a leitura do banco fica em linha-base-db.ts.

export type EtapaLinhaBase = {
  /** null quando a etapa foi excluída depois da foto: ela continua no plano de base. */
  etapaId: string | null;
  nome: string;
  inicio: Dia | null;
  fim: Dia | null;
  orcamentoCents: number;
};

export type LinhaBaseOficial = {
  id: string;
  obraId: string;
  nome: string;
  criadaEm: Date;
  etapas: EtapaLinhaBase[];
};

/**
 * Plano da linha de base no formato das funções do cronograma (`curvaS`, `previstoNaData`).
 * O id é o da etapa atual, para casar com as medições; etapa excluída ganha um id próprio e só pesa no previsto.
 */
export function planoDaLinhaBase(linha: Pick<LinhaBaseOficial, "id" | "etapas">): EtapaPlano[] {
  return linha.etapas.map((e, i) => ({
    id: e.etapaId ?? `${linha.id}:${i}`,
    orcamentoCents: e.orcamentoCents,
    inicioPrevisto: e.inicio,
    fimPrevisto: e.fim,
  }));
}

/** Uma linha de base sem nenhuma etapa datada não serve de referência para nada. */
export function validarFotoDaLinhaBase(
  etapas: { inicioPrevisto: Date | string | null; fimPrevisto: Date | string | null }[],
): { ok: boolean; erro?: string } {
  if (etapas.length === 0) return { ok: false, erro: "A obra não tem etapas para salvar na linha de base." };
  if (!etapas.some((e) => e.inicioPrevisto && e.fimPrevisto)) {
    return {
      ok: false,
      erro: "Defina início e fim de pelo menos uma etapa (em \"Editar datas\") antes de salvar a linha de base.",
    };
  }
  return { ok: true };
}
