import { StatusBadge, type Estado } from "@/components/status-badge";
import { ROTULO_SITUACAO, type SituacaoEtapa } from "@/services/cronograma";

const ESTADO: Record<SituacaoEtapa, Estado> = {
  NAO_INICIADA: "neutro",
  EM_DIA: "no-prazo",
  ATENCAO: "atencao",
  ATRASADA: "atrasado",
  CONCLUIDA: "pago",
  SEM_DATAS: "neutro",
};

export const COR_SITUACAO: Record<SituacaoEtapa, { trilho: string; barra: string }> = {
  NAO_INICIADA: { trilho: "bg-estado-neutro-borda/40", barra: "bg-estado-neutro-fg" },
  EM_DIA: { trilho: "bg-estado-no-prazo-borda/25", barra: "bg-estado-no-prazo-borda" },
  ATENCAO: { trilho: "bg-estado-atencao-borda/25", barra: "bg-estado-atencao-borda" },
  ATRASADA: { trilho: "bg-estado-atrasado-borda/25", barra: "bg-estado-atrasado-borda" },
  CONCLUIDA: { trilho: "bg-primary/20", barra: "bg-primary" },
  SEM_DATAS: { trilho: "bg-muted", barra: "bg-muted-foreground/40" },
};

export function SituacaoBadge({ situacao, className }: { situacao: SituacaoEtapa; className?: string }) {
  return (
    <StatusBadge estado={ESTADO[situacao]} className={className}>
      {ROTULO_SITUACAO[situacao]}
    </StatusBadge>
  );
}
