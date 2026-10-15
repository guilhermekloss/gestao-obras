import type { FaixaConsumo } from "@/services/analises";

// só tipos do service: o form (client) importa daqui sem puxar o Prisma
export const ESTILO_FAIXA: Record<FaixaConsumo, { rotulo: string; texto: string; barra: string }> = {
  SEM_ORCAMENTO: { rotulo: "Sem orçamento", texto: "text-muted-foreground", barra: "bg-muted-foreground/40" },
  OK: { rotulo: "Ok (< 90%)", texto: "text-green-700 dark:text-green-400", barra: "bg-green-500" },
  ATENCAO: { rotulo: "Atenção (≥ 90%)", texto: "text-amber-700 dark:text-amber-400", barra: "bg-amber-500" },
  ESTOURO: { rotulo: "Estouro (> 100%)", texto: "text-destructive", barra: "bg-destructive" },
};
