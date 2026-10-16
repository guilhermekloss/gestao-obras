import type { LucideIcon } from "lucide-react";
import { ESTADO, type Estado } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/** Página inteira com um aviso: traço de cota no topo, ícone de estado, texto curto e o que fazer. */
export function AvisoDePagina({
  icone: Icone,
  tom,
  titulo,
  children,
  acoes,
}: {
  icone: LucideIcon;
  tom: Extract<Estado, "atencao" | "neutro">;
  titulo: string;
  children: React.ReactNode;
  acoes: React.ReactNode;
}) {
  return (
    <section className="relative max-w-lg border-t border-foreground/60 pt-6">
      <span aria-hidden className="absolute -top-1.5 left-0 h-3 w-px bg-foreground/60" />
      <span aria-hidden className="absolute -top-1.5 right-0 h-3 w-px bg-foreground/60" />
      <span
        className={cn("grid size-10 place-items-center rounded-md border-2", ESTADO[tom].classe)}
      >
        <Icone aria-hidden className="size-5" />
      </span>
      <h1 className="mt-4 text-2xl md:text-3xl">{titulo}</h1>
      <div className="mt-2 space-y-1 text-muted-foreground">{children}</div>
      <div className="mt-6 flex flex-wrap gap-2">{acoes}</div>
    </section>
  );
}
