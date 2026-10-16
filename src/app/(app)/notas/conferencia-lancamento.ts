// Texto da conferência fixa (total x itens x rateio x parcelas). Só compara os números que as telas
// já calculam com as funções de services/; não decide o que bloqueia o salvamento.
import { formatarMoeda, percentBpParaEditavel } from "@/lib/format";
import { BP_TOTAL } from "@/services/rateio";
import type { LinhaConferencia } from "@/components/resumo-lancamento";

export type EntradaConferencia = {
  totalCents: number;
  somaItensCents: number;
  somaRateioBp: number;
  /** Quantas parcelas existem hoje (0 = ainda não geradas). */
  parcelas: number;
  somaParcelasCents: number;
};

function diferencaEmReais(dif: number, falta: string, passa: string): string {
  return dif < 0 ? `${falta} ${formatarMoeda(-dif)}` : `${passa} ${formatarMoeda(dif)}`;
}

/** Itens diferentes do total é aviso (o servidor pergunta "salvar mesmo assim"); rateio e parcelas fora são erro. */
export function linhasDeConferencia(e: EntradaConferencia): LinhaConferencia[] {
  const semTotal = e.totalCents <= 0;

  const difItens = e.somaItensCents - e.totalCents;
  const itens: LinhaConferencia = {
    id: "itens",
    rotulo: "Itens",
    valor: formatarMoeda(e.somaItensCents),
    ...(semTotal
      ? { situacao: "vazio", detalhe: "Informe o valor total" }
      : e.somaItensCents === 0
        ? { situacao: "vazio", detalhe: "Preencha os itens" }
        : difItens === 0
          ? { situacao: "ok", detalhe: "Fecha com o total" }
          : {
              situacao: "aviso",
              detalhe: `${diferencaEmReais(difItens, "Faltam", "Passam")} do total`,
            }),
  };

  const difBp = e.somaRateioBp - BP_TOTAL;
  const rateio: LinhaConferencia = {
    id: "rateio",
    rotulo: "Rateio",
    valor: `${percentBpParaEditavel(e.somaRateioBp)}%`,
    ...(difBp === 0
      ? { situacao: "ok", detalhe: "Fecha 100%" }
      : {
          situacao: "erro",
          detalhe: `${difBp < 0 ? "Faltam" : "Passam"} ${percentBpParaEditavel(Math.abs(difBp))}% para 100%`,
        }),
  };

  const difParcelas = e.somaParcelasCents - e.totalCents;
  const parcelas: LinhaConferencia = {
    id: "parcelas",
    rotulo: "Parcelas",
    valor: formatarMoeda(e.somaParcelasCents),
    ...(e.parcelas === 0
      ? { situacao: "vazio", detalhe: "Gere as parcelas" }
      : difParcelas === 0
        ? { situacao: "ok", detalhe: `${e.parcelas === 1 ? "1 parcela fecha" : `${e.parcelas} parcelas fecham`} com o total` }
        : {
            situacao: "erro",
            detalhe: `${diferencaEmReais(difParcelas, "Faltam", "Passam")} do total`,
          }),
  };

  return [itens, rateio, parcelas];
}

/** Frase do aviso dentro da seção de itens. `null` quando fecha (ou ainda não há o que comparar). */
export function avisoItensDiferemDoTotal(e: Pick<EntradaConferencia, "totalCents" | "somaItensCents">): string | null {
  if (e.totalCents <= 0 || e.somaItensCents === 0 || e.somaItensCents === e.totalCents) return null;
  return `A soma dos itens (${formatarMoeda(e.somaItensCents)}) é diferente do valor total (${formatarMoeda(e.totalCents)}). Ajuste os itens ou o total. Se estiver certo, você pode salvar mesmo assim.`;
}
