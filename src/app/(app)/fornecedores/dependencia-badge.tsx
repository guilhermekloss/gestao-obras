import { Badge } from "@/components/ui/badge";
import type { NivelDependencia } from "@/services/dependencia";

const CONFIG: Record<
  NivelDependencia,
  { label: string; variant: "destructive" | "default" | "secondary" }
> = {
  ALTA: { label: "Alta", variant: "destructive" },
  MEDIA: { label: "Média", variant: "default" },
  BAIXA: { label: "Baixa", variant: "secondary" },
};

export function DependenciaBadge({
  nivel,
  score,
  className,
}: {
  nivel: NivelDependencia;
  score: number;
  className?: string;
}) {
  const cfg = CONFIG[nivel];
  return (
    <Badge variant={cfg.variant} className={className}>
      {cfg.label} · {score}
    </Badge>
  );
}
