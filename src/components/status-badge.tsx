import {
  CircleCheck,
  CircleDashed,
  Check,
  Clock,
  Hammer,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado = fundo claro + borda + ícone + palavra. A cor nunca vai sozinha
 * (sol forte, daltonismo) e o preenchimento sólido fica reservado para ação.
 */
export type Estado =
  | "no-prazo"
  | "atencao"
  | "atrasado"
  | "vencido"
  | "pago"
  | "andamento"
  | "neutro";

export const ESTADO: Record<Estado, { Icone: LucideIcon; classe: string }> = {
  "no-prazo": {
    Icone: CircleCheck,
    classe: "border-estado-no-prazo-borda bg-estado-no-prazo text-estado-no-prazo-fg",
  },
  atencao: {
    Icone: TriangleAlert,
    classe: "border-estado-atencao-borda bg-estado-atencao text-estado-atencao-fg",
  },
  atrasado: {
    Icone: Clock,
    classe: "border-estado-atrasado-borda bg-estado-atrasado text-estado-atrasado-fg",
  },
  vencido: {
    Icone: OctagonAlert,
    classe: "border-estado-vencido-borda bg-estado-vencido font-bold text-estado-vencido-fg",
  },
  pago: {
    Icone: Check,
    classe: "border-estado-pago-borda bg-estado-pago text-estado-pago-fg",
  },
  andamento: {
    Icone: Hammer,
    classe: "border-estado-andamento-borda bg-estado-andamento text-estado-andamento-fg",
  },
  neutro: {
    Icone: CircleDashed,
    classe: "border-estado-neutro-borda bg-estado-neutro text-estado-neutro-fg",
  },
};

export function StatusBadge({
  estado,
  children,
  className,
}: {
  estado: Estado;
  children: React.ReactNode;
  className?: string;
}) {
  const { Icone, classe } = ESTADO[estado];
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-sm border-2 px-1.5 text-xs font-medium whitespace-nowrap [print-color-adjust:exact]",
        classe,
        className,
      )}
    >
      <Icone aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
