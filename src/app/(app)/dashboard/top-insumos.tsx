import { formatarMoeda, formatarPercentBp } from "@/lib/format";
import { ReguaCota } from "@/components/regua-cota";
import { Badge } from "@/components/ui/badge";
import type { InsumoAbc } from "@/services/analises";

// barra cheia = 100% do custo total (não o maior insumo), para não exagerar a diferença
export function TopInsumos({ insumos }: { insumos: InsumoAbc[] }) {
  return (
    <ol className="space-y-3">
      {insumos.map((i) => (
        <li key={i.chave} className="space-y-1">
          <div className="flex items-baseline gap-2 text-sm">
            <Badge variant={i.classe === "A" ? "default" : i.classe === "B" ? "secondary" : "outline"}>
              {i.classe}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-medium" title={i.descricao}>
              {i.descricao}
            </span>
            <span className="shrink-0 num">{formatarMoeda(i.custoCents)}</span>
          </div>
          <div className="flex items-center gap-2">
            <ReguaCota percent={i.participacaoBp / 100} rotulo={`Participação de ${i.descricao}`} />
            <span className="w-12 shrink-0 text-right text-sm num">
              {formatarPercentBp(i.participacaoBp)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
