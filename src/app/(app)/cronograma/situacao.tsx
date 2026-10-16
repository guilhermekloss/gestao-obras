import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROTULO_SITUACAO, type SituacaoEtapa } from "@/services/cronograma";

export const COR_SITUACAO: Record<SituacaoEtapa, { trilho: string; barra: string; badge: string }> = {
  NAO_INICIADA: {
    trilho: "bg-chart-5/20",
    barra: "bg-chart-5",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  },
  EM_DIA: {
    trilho: "bg-chart-1/20",
    barra: "bg-chart-1",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  ATRASADA: {
    trilho: "bg-destructive/20",
    barra: "bg-destructive",
    badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  CONCLUIDA: {
    trilho: "bg-chart-2/20",
    barra: "bg-chart-2",
    badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  SEM_DATAS: {
    trilho: "bg-muted",
    barra: "bg-muted-foreground/40",
    badge: "bg-muted text-muted-foreground",
  },
};

export function SituacaoBadge({ situacao, className }: { situacao: SituacaoEtapa; className?: string }) {
  return (
    <Badge className={cn("border-0", COR_SITUACAO[situacao].badge, className)}>
      {ROTULO_SITUACAO[situacao]}
    </Badge>
  );
}
