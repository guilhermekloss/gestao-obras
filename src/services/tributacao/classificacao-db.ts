import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ClassificacaoParaCredito } from "./credito";
import { diaUtc } from "./ibs-cbs";

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

/**
 * Tabela da Receita que só muda por migration: lida uma vez por instância do servidor. Se a leitura falhar, o memo é
 * esquecido e a próxima chamada tenta de novo. As linhas são compartilhadas entre requisições: não mutar.
 */
export function memoDaTabela<T>(ler: () => Promise<T>): { obter: () => Promise<T>; esquecer: () => void } {
  let memo: Promise<T> | null = null;
  return {
    obter() {
      memo ??= ler().catch((erro) => {
        memo = null;
        throw erro;
      });
      return memo;
    },
    esquecer() {
      memo = null;
    },
  };
}

async function lerClassificacoes(db: Db, codigos?: readonly string[]): Promise<ClassificacaoTributariaRef[]> {
  const linhas = await db.classificacaoTributaria.findMany({
    where: codigos ? { codigo: { in: [...codigos] } } : undefined,
    orderBy: [{ codigo: "asc" }, { inicioVigencia: "asc" }],
  });
  return linhas.map((l) => ({
    ...l,
    inicioVigencia: diaUtc(l.inicioVigencia),
    fimVigencia: l.fimVigencia ? diaUtc(l.fimVigencia) : null,
    pRedCbs: l.pRedCbs?.toString() ?? null,
    pRedIbs: l.pRedIbs?.toString() ?? null,
  }));
}

const tabela = memoDaTabela(() => lerClassificacoes(prisma));

/** Para testes que trocam o conteúdo do banco simulado. */
export const esquecerClassificacoes = tabela.esquecer;

/**
 * Classificações dos códigos pedidos (todas as vigências, na ordem código e início); sem `codigos`, a tabela inteira
 * (~165 linhas). Com o prisma padrão vem do memo, filtrada em memória; com `db` injetado (transação, testes) consulta.
 */
export async function carregarClassificacoes(codigos?: readonly (string | null | undefined)[], db: Db = prisma): Promise<ClassificacaoTributariaRef[]> {
  const lista = codigos ? [...new Set(codigos.filter((c): c is string => !!c))] : undefined;
  if (lista && lista.length === 0) return [];
  if (db !== prisma) return lerClassificacoes(db, lista);
  const todas = await tabela.obter();
  const pedidos = lista && new Set(lista);
  return pedidos ? todas.filter((c) => pedidos.has(c.codigo)) : [...todas];
}
