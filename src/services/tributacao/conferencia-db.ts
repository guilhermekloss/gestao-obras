import type { ClassificacaoNomenclatura, Prisma, RegimeIbsCbs } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataParaInput } from "@/lib/format";
import { carregarClassificacoes, memoDaTabela, type ClassificacaoTributariaRef } from "./classificacao-db";
import { conferirTributacao, itemDaNota, type AchadoConferencia, type NomenclaturaRef } from "./conferencia";
import { classificacaoVigente, creditoDaNota, indexarClassificacoes, type CreditoDoItem } from "./credito";
import { diaUtc, temGrupoIbsCbs } from "./ibs-cbs";

type Db = Prisma.TransactionClient | typeof prisma;

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
  const temDados = nota.itens.some(temGrupoIbsCbs);
  const dataEmissao = dataParaInput(nota.dataCompra);
  const { classificacoes, nomenclaturas } = await carregarReferenciasConferencia(
    nota.itens.map((i) => i.cClassTrib),
    db,
  );
  const indice = indexarClassificacoes(classificacoes);
  const achados = conferirTributacao(nota.itens.map(itemDaNota), {
    dataEmissao,
    crtEmitente: nota.crtEmitente,
    classificacoes: indice,
    nomenclaturas,
  });
  const credito = creditoDaNota(nota.itens, { regimeEmpresa, dataEmissao, classificacoes: indice });
  return {
    temDados,
    achados,
    itens: credito.itens.map((c, i) => ({
      credito: c,
      classificacaoDescricao: classificacaoVigente(indice, nota.itens[i].cClassTrib, dataEmissao)?.descricao ?? null,
    })),
    creditoCents: credito.creditoCents,
    destacadoCents: credito.destacadoCents,
  };
}

function paraRef(l: ClassificacaoNomenclatura): NomenclaturaRef {
  return {
    tipo: l.tipo,
    codigo: l.codigo,
    cClassTrib: l.cClassTrib,
    excecao: l.excecao,
    inicioVigencia: diaUtc(l.inicioVigencia),
    fimVigencia: l.fimVigencia ? diaUtc(l.fimVigencia) : null,
  };
}

// ~4 mil linhas, só mudam por migration: lidas uma vez e agrupadas por cClassTrib (ver memoDaTabela).
const nomenclaturasPorClassificacao = memoDaTabela(async () =>
  Map.groupBy((await prisma.classificacaoNomenclatura.findMany({ orderBy: { id: "asc" } })).map(paraRef), (l) => l.cClassTrib),
);

/** Classificações e nomenclaturas dos códigos da nota: duas consultas em paralelo (ou o memo), nunca uma por item. */
export async function carregarReferenciasConferencia(
  codigos: readonly (string | null | undefined)[],
  db: Db = prisma,
): Promise<{ classificacoes: ClassificacaoTributariaRef[]; nomenclaturas: NomenclaturaRef[] }> {
  const lista = [...new Set(codigos.filter((c): c is string => !!c))];
  if (lista.length === 0) return { classificacoes: [], nomenclaturas: [] };
  const [classificacoes, nomenclaturas] = await Promise.all([
    carregarClassificacoes(lista, db),
    db === prisma
      ? nomenclaturasPorClassificacao.obter().then((mapa) => lista.flatMap((c) => mapa.get(c) ?? []))
      : db.classificacaoNomenclatura.findMany({ where: { cClassTrib: { in: lista } } }).then((linhas) => linhas.map(paraRef)),
  ]);
  return { classificacoes, nomenclaturas };
}
