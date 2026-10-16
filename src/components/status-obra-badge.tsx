import type { StatusObra } from "@prisma/client";
import { StatusBadge, type Estado } from "@/components/status-badge";

const CONFIG: Record<StatusObra, { label: string; estado: Estado }> = {
  PLANEJAMENTO: { label: "Planejamento", estado: "neutro" },
  ANDAMENTO: { label: "Em andamento", estado: "andamento" },
  CONCLUIDA: { label: "Concluída", estado: "pago" },
  PAUSADA: { label: "Pausada", estado: "atencao" },
};

export function StatusObraBadge({ status }: { status: StatusObra }) {
  const cfg = CONFIG[status];
  return <StatusBadge estado={cfg.estado}>{cfg.label}</StatusBadge>;
}
