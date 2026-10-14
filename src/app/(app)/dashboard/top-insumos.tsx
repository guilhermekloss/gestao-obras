import { formatarMoeda, formatarPercentBp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { InsumoAbc } from "@/services/analises";

/**
 * Maiores insumos da curva ABC com barra de participação no custo total
 * (a barra cheia seria 100% do custo, para não exagerar a diferença entre eles).
 * Barras em CSS (não Recharts): são 5 linhas com rótulo longo, que caberiam
 * mal no eixo de um gráfico.
 */
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
            <span className="shrink-0 tabular-nums">{formatarMoeda(i.custoCents)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#2a78d6]"
                style={{ width: `${i.participacaoBp / 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {formatarPercentBp(i.participacaoBp)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
