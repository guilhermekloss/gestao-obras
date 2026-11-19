import type { Prisma, RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataParaInput } from "@/lib/format";
import { carregarClassificacoes, type ClassificacaoTributariaRef } from "./classificacao-db";
import { conferirTributacao, itemDaNota, type AchadoConferencia, type NomenclaturaRef } from "./conferencia";
import { classificacaoVigente, creditoDaNota, type CreditoDoItem } from "./credito";

type Db = Prisma.TransactionClient | typeof prisma;

// @db.Date chega como meia-noite UTC: a data vem do ISO, não do fuso local.
const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Item gravado da nota: as colunas de ItemNota que a conferência e o crédito leem. */
export type ItemGravadoIbsCbs = Parameters<typeof itemDaNota>[0];

export type IbsCbsDaNota = {
  temDados: boolean;
  achados: AchadoConferencia[];
  /** Um por item, na ordem recebida. */
  itens: { credito: CreditoDoItem; classificacaoDescricao: string | null }[];
  creditoCents: number;
  destacadoCents: number;
};

/** Conferência e crédito de IBS/CBS de uma nota já lançada, com uma ida ao banco para todos os itens. */
export async function analisarIbsCbsDaNota(
  nota: { dataCompra: Date | string; crtEmitente: string | null; itens: readonly ItemGravadoIbsCbs[] },
  regimeEmpresa: RegimeIbsCbs,
  db: Db = prisma,
): Promise<IbsCbsDaNota> {
  const temDados = nota.itens.some((i) => i.cst || i.cClassTrib);
  const dataEmissao = dataParaInput(nota.dataCompra);
  const { classificacoes, nomenclaturas } = await carregarReferenciasConferencia(
    nota.itens.map((i) => i.cClassTrib),
    db,
  );
  const achados = conferirTributacao(nota.itens.map(itemDaNota), {
    dataEmissao,
    crtEmitente: nota.crtEmitente,
    classificacoes,
    nomenclaturas,
  });
  const credito = creditoDaNota(nota.itens, { regimeEmpresa, dataEmissao, classificacoes });
  return {
    temDados,
    achados,
    itens: credito.itens.map((c, i) => ({
      credito: c,
      classificacaoDescricao: classificacaoVigente(classificacoes, nota.itens[i].cClassTrib, dataEmissao)?.descricao ?? null,
    })),
    creditoCents: credito.creditoCents,
    destacadoCents: credito.destacadoCents,
  };
}

/** Classificações e nomenclaturas dos códigos da nota: duas consultas em paralelo, nunca uma por item. */
export async function carregarReferenciasConferencia(
  codigos: readonly (string | null | undefined)[],
  db: Db = prisma,
): Promise<{ classificacoes: ClassificacaoTributariaRef[]; nomenclaturas: NomenclaturaRef[] }> {
  const lista = [...new Set(codigos.filter((c): c is string => !!c))];
  if (lista.length === 0) return { classificacoes: [], nomenclaturas: [] };
  const [classificacoes, linhas] = await Promise.all([
    carregarClassificacoes(lista, db),
    db.classificacaoNomenclatura.findMany({ where: { cClassTrib: { in: lista } } }),
  ]);
  return {
    classificacoes,
    nomenclaturas: linhas.map((l) => ({
      tipo: l.tipo,
      codigo: l.codigo,
      cClassTrib: l.cClassTrib,
      excecao: l.excecao,
      inicioVigencia: dia(l.inicioVigencia),
      fimVigencia: l.fimVigencia ? dia(l.fimVigencia) : null,
    })),
  };
}
