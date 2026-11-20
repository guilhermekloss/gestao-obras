import { prisma } from "@/lib/prisma";
import type { TipoItem } from "@prisma/client";
import { normalizarDescricao } from "./materiais";
import { crtMaisRecente, type NotaComCrt } from "./tributacao/custo-efetivo";
import type { CrtEmitente } from "./tributacao/ibs-cbs";

export const PESOS = {
  concentracao: 40,
  exclusividade: 30,
  recencia: 15,
  alcance: 15,
} as const;

const CONCENTRACAO_TETO = 0.4;
const RECENCIA_DIAS_CHEIO = 90;
const RECENCIA_DIAS_ZERO = 365;

export type NivelDependencia = "ALTA" | "MEDIA" | "BAIXA";

type FatoresDependencia = {
  shareGasto: number;
  exclusividade: number;
  recencia: number;
  alcance: number;
};

type Pontuacao = {
  score: number;
  nivel: NivelDependencia;
  componentes: {
    concentracao: number;
    exclusividade: number;
    recencia: number;
    alcance: number;
  };
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function nivelDe(score: number): NivelDependencia {
  if (score >= 66) return "ALTA";
  if (score >= 33) return "MEDIA";
  return "BAIXA";
}

export function recenciaDeDias(dias: number): number {
  if (dias <= RECENCIA_DIAS_CHEIO) return 1;
  if (dias >= RECENCIA_DIAS_ZERO) return 0;
  return 1 - (dias - RECENCIA_DIAS_CHEIO) / (RECENCIA_DIAS_ZERO - RECENCIA_DIAS_CHEIO);
}

export function pontuar(f: FatoresDependencia): Pontuacao {
  const componentes = {
    concentracao: PESOS.concentracao * clamp01(f.shareGasto / CONCENTRACAO_TETO),
    exclusividade: PESOS.exclusividade * clamp01(f.exclusividade),
    recencia: PESOS.recencia * clamp01(f.recencia),
    alcance: PESOS.alcance * clamp01(f.alcance),
  };
  const score = Math.round(
    componentes.concentracao +
      componentes.exclusividade +
      componentes.recencia +
      componentes.alcance,
  );
  return { score, nivel: nivelDe(score), componentes };
}

type MetricasDependencia = Pontuacao & {
  fornecedorId: string;
  gastoCents: number;
  gastoExclusivoCents: number;
  numNotas: number;
  ultimaCompra: Date | null;
  obrasAtendidas: number;
  tipos: TipoItem[];
  fatores: FatoresDependencia;
  descricoesExclusivas: Set<string>;
  /** CRT da nota mais recente que tem CRT (o regime exibido do fornecedor); nulo se nenhuma tem. */
  crt: CrtEmitente | null;
};

type Acc = {
  gastoCents: number;
  numNotas: number;
  ultimaCompra: Date | null;
  obras: Set<string>;
  tipos: Set<TipoItem>;
  gastoPorDescricao: Map<string, number>;
  notasComCrt: NotaComCrt[];
};

function novoAcc(): Acc {
  return {
    gastoCents: 0,
    numNotas: 0,
    ultimaCompra: null,
    obras: new Set(),
    tipos: new Set(),
    gastoPorDescricao: new Map(),
    notasComCrt: [],
  };
}

// Descrição "exclusiva" = só um fornecedor já a vendeu (fonte única). A mesma leitura de notas dá o CRT de cada
// fornecedor (a lista de fornecedores não precisa de outra consulta para o regime).
export async function calcularDependencia(
  agora: Date = new Date(),
): Promise<Map<string, MetricasDependencia>> {
  const [notas, totalObras] = await Promise.all([
    prisma.notaFiscal.findMany({
      select: {
        fornecedorId: true,
        dataCompra: true,
        createdAt: true,
        crtEmitente: true,
        totalCents: true,
        rateios: { select: { obraId: true } },
        itens: {
          select: {
            descricao: true,
            tipo: true,
            totalCents: true,
          },
        },
      },
    }),
    prisma.obra.count(),
  ]);

  const accs = new Map<string, Acc>();
  const fornecedoresPorDescricao = new Map<string, Set<string>>();
  let gastoGlobal = 0;

  for (const nota of notas) {
    gastoGlobal += nota.totalCents;
    let acc = accs.get(nota.fornecedorId);
    if (!acc) accs.set(nota.fornecedorId, (acc = novoAcc()));

    acc.gastoCents += nota.totalCents;
    acc.numNotas += 1;
    if (!acc.ultimaCompra || nota.dataCompra > acc.ultimaCompra) {
      acc.ultimaCompra = nota.dataCompra;
    }

    if (nota.crtEmitente) acc.notasComCrt.push({ dataEmissao: nota.dataCompra, crtEmitente: nota.crtEmitente, createdAt: nota.createdAt });

    for (const r of nota.rateios) acc.obras.add(r.obraId);

    for (const item of nota.itens) {
      acc.tipos.add(item.tipo);

      const chave = normalizarDescricao(item.descricao);
      acc.gastoPorDescricao.set(
        chave,
        (acc.gastoPorDescricao.get(chave) ?? 0) + item.totalCents,
      );
      let fornecedores = fornecedoresPorDescricao.get(chave);
      if (!fornecedores) fornecedoresPorDescricao.set(chave, (fornecedores = new Set()));
      fornecedores.add(nota.fornecedorId);
    }
  }

  const resultado = new Map<string, MetricasDependencia>();
  for (const [fornecedorId, acc] of accs) {
    const descricoesExclusivas = new Set<string>();
    let gastoExclusivoCents = 0;
    for (const [descricao, gasto] of acc.gastoPorDescricao) {
      if (fornecedoresPorDescricao.get(descricao)?.size === 1) {
        descricoesExclusivas.add(descricao);
        gastoExclusivoCents += gasto;
      }
    }

    const dias = acc.ultimaCompra
      ? Math.floor((agora.getTime() - acc.ultimaCompra.getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;

    const fatores: FatoresDependencia = {
      shareGasto: gastoGlobal > 0 ? acc.gastoCents / gastoGlobal : 0,
      exclusividade: acc.gastoCents > 0 ? gastoExclusivoCents / acc.gastoCents : 0,
      recencia: recenciaDeDias(dias),
      alcance: totalObras > 0 ? acc.obras.size / totalObras : 0,
    };

    resultado.set(fornecedorId, {
      ...pontuar(fatores),
      fornecedorId,
      gastoCents: acc.gastoCents,
      gastoExclusivoCents,
      numNotas: acc.numNotas,
      ultimaCompra: acc.ultimaCompra,
      obrasAtendidas: acc.obras.size,
      tipos: [...acc.tipos],
      fatores,
      descricoesExclusivas,
      crt: crtMaisRecente(acc.notasComCrt),
    });
  }

  return resultado;
}
