import { BP_TOTAL } from "./rateio";
import { dataParaInput, formatarData, inputParaData, formatarPercentBp } from "@/lib/format";

// Ponderado pelo orçamento; etapa sem orçamento não pesa, salvo se nenhuma tiver (aí média simples).
export function avancoPonderado(
  etapas: { orcamentoCents: number; percentBp: number }[],
): number {
  if (etapas.length === 0) return 0;

  const pesoTotal = etapas.reduce((acc, e) => acc + e.orcamentoCents, 0);
  if (pesoTotal === 0) {
    const soma = etapas.reduce((acc, e) => acc + e.percentBp, 0);
    return Math.round(soma / etapas.length);
  }

  const somaPonderada = etapas.reduce(
    (acc, e) => acc + e.percentBp * e.orcamentoCents,
    0,
  );
  return Math.round(somaPonderada / pesoTotal);
}

export function validarAvanco(
  novoPercentBp: number,
  atualPercentBp: number,
): { ok: boolean; erro?: string } {
  if (novoPercentBp < 0 || novoPercentBp > BP_TOTAL) {
    return { ok: false, erro: "Avanço deve estar entre 0% e 100%" };
  }
  if (novoPercentBp < atualPercentBp) {
    return {
      ok: false,
      erro: `Avanço não pode regredir (atual: ${formatarPercentBp(atualPercentBp)})`,
    };
  }
  return { ok: true };
}

export function orcamentoTotal(etapas: { orcamentoCents: number }[]): number {
  return etapas.reduce((acc, e) => acc + e.orcamentoCents, 0);
}

// Avanço da obra a partir do último avanço de cada etapa (etapa sem medição conta 0%).
export function avancoDaObra(
  etapas: { id: string; orcamentoCents: number }[],
  avancos: Map<string, number>,
): number {
  return avancoPonderado(etapas.map((e) => ({ orcamentoCents: e.orcamentoCents, percentBp: avancos.get(e.id) ?? 0 })));
}

export type DirecaoEtapa = "cima" | "baixo";

// Nova ordem com a etapa trocada de lugar com a vizinha; null se ela não existe ou já está na ponta.
export function trocarComVizinha(ids: string[], id: string, direcao: DirecaoEtapa): string[] | null {
  const i = ids.indexOf(id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const nova = [...ids];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

export type MedicaoExistente ={ id: string; data: Date | string; percentBp: number };

// Valida um novo avanço acumulado contra a série da etapa, por dia civil (medições ficam
// gravadas ao meio-dia local). Na mesma data a última lançada vale, então o novo avanço
// conta como posterior às medições do próprio dia.
// `ignorarId`: na edição, a própria medição sai da série (o novo valor a substitui) e mantém o
// lugar dela no dia: as lançadas depois dela na mesma data continuam valendo depois.
export function validarAvancoNaSerie(
  novo: { data: string; percentBp: number },
  existentes: MedicaoExistente[],
  hoje: Date = new Date(),
  ignorarId?: string,
): { ok: boolean; erro?: string } {
  if (!Number.isInteger(novo.percentBp) || novo.percentBp < 0 || novo.percentBp > BP_TOTAL) {
    return { ok: false, erro: "Avanço deve estar entre 0% e 100%" };
  }
  if (novo.data > dataParaInput(hoje)) {
    return { ok: false, erro: "A data do avanço não pode ser futura." };
  }

  const serie = existentes
    .filter((m) => ignorarId === undefined || m.id !== ignorarId)
    .map((m) => ({ ...m, dia: dataParaInput(m.data) }))
    .sort((a, b) => (a.dia === b.dia ? (a.id < b.id ? -1 : 1) : a.dia < b.dia ? -1 : 1));

  // mesma ordem do banco: dia e, no mesmo dia, id
  const depoisDoNovo = (m: { dia: string; id: string }) =>
    m.dia > novo.data || (m.dia === novo.data && ignorarId !== undefined && m.id > ignorarId);

  const anterior = serie.filter((m) => !depoisDoNovo(m)).at(-1);
  if (anterior && novo.percentBp < anterior.percentBp) {
    return {
      ok: false,
      erro: `O avanço não pode ser menor que o já registrado (${formatarPercentBp(anterior.percentBp)} em ${formatarData(anterior.data)}).`,
    };
  }
  const posterior = serie.find(depoisDoNovo);
  if (posterior && novo.percentBp > posterior.percentBp) {
    return {
      ok: false,
      erro: `Em ${formatarData(posterior.data)} já consta ${formatarPercentBp(posterior.percentBp)}. O avanço de ${formatarData(inputParaData(novo.data))} não pode ser maior que isso.`,
    };
  }
  return { ok: true };
}
