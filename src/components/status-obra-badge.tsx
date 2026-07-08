import type { StatusObra } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONFIG: Record<StatusObra, { label: string; className: string }> = {
  PLANEJAMENTO: { label: "Planejamento", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  ANDAMENTO: { label: "Em andamento", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  CONCLUIDA: { label: "Concluída", className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400" },
  PAUSADA: { label: "Pausada", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

export function StatusObraBadge({ status }: { status: StatusObra }) {
  const cfg = CONFIG[status];
  return <Badge className={cn("border-0", cfg.className)}>{cfg.label}</Badge>;
}
