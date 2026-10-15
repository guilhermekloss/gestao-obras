import type { CondicaoTrabalho } from "@prisma/client";
import { cn } from "@/lib/utils";
import { rotuloCondicao } from "@/services/rdo";

const ESTILO: Record<CondicaoTrabalho, string> = {
  PRATICAVEL: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  PARCIAL: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IMPRATICAVEL: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function CondicaoBadge({
  condicao,
  curto = false,
  className,
}: {
  condicao: CondicaoTrabalho | null;
  curto?: boolean;
  className?: string;
}) {
  if (!condicao) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [print-color-adjust:exact]",
        ESTILO[condicao],
        className,
      )}
    >
      {curto && condicao === "PARCIAL" ? "Parcial" : rotuloCondicao(condicao)}
    </span>
  );
}
