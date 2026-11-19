import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ClassificacaoParaCredito } from "./credito";

type Db = Prisma.TransactionClient | typeof prisma;

/** Linha de ClassificacaoTributaria com vigências em aaaa-mm-dd e reduções em texto decimal. */
export type ClassificacaoTributariaRef = ClassificacaoParaCredito & {
  cst: string;
  descricaoCst: string;
  descricao: string;
  tipoAliquota: string;
  nomenclatura: string | null;
  pRedCbs: string | null;
  pRedIbs: string | null;
  creditoPresumidoFornecedor: boolean;
  indEstornoCredito: boolean;
  indCreditoPresumidoOperacao: boolean;
  creditoOperacaoAntecedente: string | null;
  indReducao: boolean;
  indDiferimento: boolean;
};

// @db.Date chega como meia-noite UTC: a data vem do ISO, não do fuso local (que voltaria um dia).
const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Classificações dos códigos pedidos (todas as vigências); sem `codigos`, a tabela inteira (~200 linhas). */
export async function carregarClassificacoes(codigos?: readonly (string | null | undefined)[], db: Db = prisma): Promise<ClassificacaoTributariaRef[]> {
  const lista = codigos ? [...new Set(codigos.filter((c): c is string => !!c))] : undefined;
  if (lista && lista.length === 0) return [];
  const linhas = await db.classificacaoTributaria.findMany({
    where: lista ? { codigo: { in: lista } } : undefined,
    orderBy: [{ codigo: "asc" }, { inicioVigencia: "asc" }],
  });
  return linhas.map((l) => ({
    ...l,
    inicioVigencia: dia(l.inicioVigencia),
    fimVigencia: l.fimVigencia ? dia(l.fimVigencia) : null,
    pRedCbs: l.pRedCbs?.toString() ?? null,
    pRedIbs: l.pRedIbs?.toString() ?? null,
  }));
}
