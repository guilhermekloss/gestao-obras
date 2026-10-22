import Link from "next/link";
import { ReguaCota } from "@/components/regua-cota";
import { formatarIdp, formatarPercentBp } from "@/lib/format";
import type { SituacaoEtapa } from "@/services/cronograma";
import { COR_SITUACAO, SituacaoBadge } from "@/app/(app)/cronograma/situacao";

export type AvancoLote = {
  obraId: string;
  obra: string;
  previstoBp: number;
  realizadoBp: number;
  idp: number | null;
  situacao: SituacaoEtapa;
};

// Avanço físico por obra como linha de cota: régua do realizado na cor da situação, traço tracejado no
// previsto até hoje e a situação em palavra (a cor nunca vai sozinha).
export function AvancoLotes({ data }: { data: AvancoLote[] }) {
  return (
    <ul className="space-y-4">
      {data.map((d) => (
        <li key={d.obraId} className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Link
              href={`/cronograma?obra=${d.obraId}`}
              className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline md:min-h-0"
            >
              {d.obra}
            </Link>
            <SituacaoBadge situacao={d.situacao} />
          </div>
          <div className="flex items-center gap-3">
            <ReguaCota
              percent={d.realizadoBp / 100}
              marca={d.situacao === "SEM_DATAS" ? undefined : d.previstoBp / 100}
              cor={COR_SITUACAO[d.situacao].barra}
              rotulo={`Avanço físico de ${d.obra}: realizado ${formatarPercentBp(d.realizadoBp)}, previsto ${formatarPercentBp(d.previstoBp)}`}
            />
            <span className="w-14 shrink-0 text-right text-base num">{formatarPercentBp(d.realizadoBp)}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {d.situacao === "SEM_DATAS" ? (
              "Sem datas no cronograma: não há previsto."
            ) : (
              <>
                Previsto <span className="num">{formatarPercentBp(d.previstoBp)}</span> · Realizado{" "}
                <span className="num">{formatarPercentBp(d.realizadoBp)}</span> · IDP{" "}
                <span className="num">{formatarIdp(d.idp)}</span>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
