import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge, type Estado } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import type { Alerta, Severidade } from "@/services/analises";

const SEVERIDADE: Record<Severidade, { estado: Estado; rotulo: string; faixa: string }> = {
  CRITICA: { estado: "vencido", rotulo: "Crítico", faixa: "border-l-estado-vencido-borda" },
  ATENCAO: { estado: "atencao", rotulo: "Atenção", faixa: "border-l-estado-atencao-borda" },
};

export function AlertasLista({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Nada pede ação: orçamentos, parcelas e notas em dia.
      </p>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {alertas.map((a) => {
        const { estado, rotulo, faixa } = SEVERIDADE[a.severidade];
        return (
          <li key={a.id}>
            <Link
              href={a.link}
              className={cn(
                "flex min-h-11 items-center gap-3 border-l-4 px-3 py-2 text-sm transition-colors hover:bg-accent/60",
                faixa,
              )}
            >
              <StatusBadge estado={estado} className="hidden sm:inline-flex sm:w-24 sm:justify-center">
                {rotulo}
              </StatusBadge>
              <span className="flex-1">
                <span className="sr-only sm:hidden">{rotulo}: </span>
                {a.mensagem}
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
