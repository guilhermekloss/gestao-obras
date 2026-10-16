// Urgência das parcelas na tela de Contas: texto, ordem e resumo. Só apresentação; quem decide se a
// parcela está vencida é o servidor (`vencida` em page.tsx).
import type { Estado } from "@/components/status-badge";

type Parcela = {
  status: "ABERTA" | "PAGA";
  vencida: boolean;
  /** Dias de calendário até o vencimento: negativo = já venceu. */
  diasParaVencer: number;
  vencimento: string;
  valorCents: number;
};

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export function textoVencidaHa(diasAtraso: number): string {
  return diasAtraso <= 1 ? "ontem" : `há ${dias(diasAtraso)}`;
}

export function rotuloDeUrgencia(p: Pick<Parcela, "status" | "vencida" | "diasParaVencer">): {
  estado: Estado;
  texto: string;
} {
  if (p.status === "PAGA") return { estado: "pago", texto: "Paga" };
  if (p.vencida) return { estado: "vencido", texto: `Venceu ${textoVencidaHa(Math.max(1, -p.diasParaVencer))}` };
  if (p.diasParaVencer <= 0) return { estado: "atencao", texto: "Vence hoje" };
  if (p.diasParaVencer === 1) return { estado: "neutro", texto: "Vence amanhã" };
  return { estado: "neutro", texto: `Vence em ${dias(p.diasParaVencer)}` };
}

/**
 * Abertas primeiro, da mais atrasada para a mais distante; no mesmo dia, o maior valor sobe.
 * Pagas ficam por último, na ordem em que vieram.
 */
export function ordenarPorUrgencia<T extends Pick<Parcela, "status" | "vencimento" | "valorCents">>(linhas: T[]): T[] {
  const abertas = linhas
    .filter((p) => p.status === "ABERTA")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valorCents - a.valorCents);
  return [...abertas, ...linhas.filter((p) => p.status !== "ABERTA")];
}

export function resumoDeVencidas<T extends Parcela>(
  linhas: T[],
): { quantidade: number; totalCents: number; maisAntigaDias: number } | null {
  const vencidas = linhas.filter((p) => p.status === "ABERTA" && p.vencida);
  if (vencidas.length === 0) return null;
  return {
    quantidade: vencidas.length,
    totalCents: vencidas.reduce((acc, p) => acc + p.valorCents, 0),
    maisAntigaDias: Math.max(...vencidas.map((p) => Math.max(1, -p.diasParaVencer))),
  };
}
