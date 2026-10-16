import type { CondicaoTrabalho } from "@prisma/client";
import { StatusBadge, type Estado } from "@/components/status-badge";
import { rotuloCondicao } from "@/services/rdo";

const ESTADO: Record<CondicaoTrabalho, Estado> = {
  PRATICAVEL: "no-prazo",
  PARCIAL: "atencao",
  IMPRATICAVEL: "vencido",
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
    <StatusBadge estado={ESTADO[condicao]} className={className}>
      {curto && condicao === "PARCIAL" ? "Parcial" : rotuloCondicao(condicao)}
    </StatusBadge>
  );
}
