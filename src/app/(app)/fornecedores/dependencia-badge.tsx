import { StatusBadge, type Estado } from "@/components/status-badge";
import type { NivelDependencia } from "@/services/dependencia";

const CONFIG: Record<NivelDependencia, { label: string; estado: Estado }> = {
  ALTA: { label: "Alta", estado: "vencido" },
  MEDIA: { label: "Média", estado: "atencao" },
  BAIXA: { label: "Baixa", estado: "no-prazo" },
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
    <StatusBadge estado={cfg.estado} className={className}>
      {cfg.label} · {score}
    </StatusBadge>
  );
}
