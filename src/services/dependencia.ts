import { prisma } from "@/lib/prisma";
import type { TipoItem } from "@prisma/client";

/**
 * "Dependência" mede o quão preso a empresa está a um fornecedor. Combina
 * quatro fatores explicáveis, cada um com um peso em pontos (total 100):
 *
 *  - Concentração (40): fatia do gasto total da empresa que vai para ele.
 *  - Exclusividade (30): fatia do gasto com ele em itens que só ele fornece
 *    (fonte única — o risco mais difícil de substituir).
 *  - Recência (15): comprou recentemente? Fornecedor dormente pesa menos.
 *  - Alcance (15): em quantas obras a empresa depende dele.
 */
export const PESOS = {
  concentracao: 40,
  exclusividade: 30,
  recencia: 15,
  alcance: 15,
} as const;

/** Gasto (fração 0..1) a partir do qual a concentração já vale nota cheia. */
const CONCENTRACAO_TETO = 0.4;
/** Dias até quando uma compra ainda conta como "recente" (nota cheia). */
const RECENCIA_DIAS_CHEIO = 90;
/** Dias a partir dos quais a recência zera. */
const RECENCIA_DIAS_ZERO = 365;

export type NivelDependencia = "ALTA" | "MEDIA" | "BAIXA";

type FatoresDependencia = {
  /** Fatia (0..1) do gasto total da empresa. */
  shareGasto: number;
  /** Fatia (0..1) do gasto com o fornecedor em itens de fonte única. */
  exclusividade: number;
  /** 0..1 conforme a última compra é recente. */
  recencia: number;
  /** Fatia (0..1) das obras da empresa atendidas pelo fornecedor. */
  alcance: number;
};

type Pontuacao = {
  score: number; // 0..100
  nivel: NivelDependencia;
  /** Contribuição de cada fator, em pontos, para explicar o score. */
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

/** Converte "dias desde a última compra" numa nota 0..1 de recência. */
export function recenciaDeDias(dias: number): number {
  if (dias <= RECENCIA_DIAS_CHEIO) return 1;
  if (dias >= RECENCIA_DIAS_ZERO) return 0;
  return 1 - (dias - RECENCIA_DIAS_CHEIO) / (RECENCIA_DIAS_ZERO - RECENCIA_DIAS_CHEIO);
}

/** Função pura: transforma os quatro fatores no score final. */
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
  /** Descrições (normalizadas) que só este fornecedor fornece. */
  descricoesExclusivas: Set<string>;
};

function normalizar(descricao: string): string {
  return descricao.trim().toLowerCase().replace(/\s+/g, " ");
}

type Acc = {
  gastoCents: number;
  numNotas: number;
  ultimaCompra: Date | null;
  obras: Set<string>;
  tipos: Set<TipoItem>;
  /** descrição normalizada -> gasto do fornecedor nela (em centavos). */
  gastoPorDescricao: Map<string, number>;
};

function novoAcc(): Acc {
  return {
    gastoCents: 0,
    numNotas: 0,
    ultimaCompra: null,
    obras: new Set(),
    tipos: new Set(),
    gastoPorDescricao: new Map(),
  };
}

/**
 * Calcula as métricas de dependência de todos os fornecedores numa passada.
 * Uma descrição é considerada "exclusiva" quando apenas um fornecedor já a
 * vendeu — daí sai a exclusividade (fonte única) de cada um.
 */
export async function calcularDependencia(
  agora: Date = new Date(),
): Promise<Map<string, MetricasDependencia>> {
  const [notas, totalObras] = await Promise.all([
    prisma.notaFiscal.findMany({
      select: {
        fornecedorId: true,
        dataCompra: true,
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
  // fornecedores que já venderam cada descrição normalizada
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

    for (const r of nota.rateios) acc.obras.add(r.obraId);

    for (const item of nota.itens) {
      acc.tipos.add(item.tipo);

      const chave = normalizar(item.descricao);
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
    });
  }

  return resultado;
}
