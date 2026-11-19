import { StatusBadge } from "@/components/status-badge";
import { REGIME_FORNECEDOR_LABELS, type RegimeFornecedor } from "@/services/tributacao/custo-efetivo";

// Neutro de propósito: o regime não é bom nem ruim em si, depende de a empresa creditar IBS/CBS.
export function RegimeFornecedorBadge({ regime, className }: { regime: RegimeFornecedor; className?: string }) {
  return (
    <StatusBadge estado="neutro" className={className}>
      {REGIME_FORNECEDOR_LABELS[regime]}
    </StatusBadge>
  );
}
