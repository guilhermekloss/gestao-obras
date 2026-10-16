import Link from "next/link";
import { ChevronRight, CircleAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alerta, Severidade } from "@/services/analises";

const ICONE: Record<Severidade, { Icone: typeof TriangleAlert; cor: string; rotulo: string }> = {
  CRITICA: { Icone: TriangleAlert, cor: "text-destructive", rotulo: "Crítico" },
  ATENCAO: { Icone: CircleAlert, cor: "text-amber-600 dark:text-amber-400", rotulo: "Atenção" },
};

export function AlertasLista({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhum alerta: orçamentos, parcelas e notas em dia.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {alertas.map((a) => {
        const { Icone, cor, rotulo } = ICONE[a.severidade];
        return (
          <li key={a.id}>
            <Link
              href={a.link}
              className="-mx-2 flex items-start gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/50"
            >
              <Icone className={cn("mt-0.5 size-4 shrink-0", cor)} aria-label={rotulo} />
              <span className="flex-1">{a.mensagem}</span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
