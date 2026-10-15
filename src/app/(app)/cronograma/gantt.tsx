import { formatarData, formatarMesAno, formatarPercentBp, inputParaData } from "@/lib/format";
import { cn } from "@/lib/utils";
import { duracaoEmDias, posicaoNoGantt, ROTULO_SITUACAO, type SituacaoEtapa } from "@/services/cronograma";
import type { Cronograma } from "./dados";
import { COR_SITUACAO } from "./situacao";

const ORDEM_LEGENDA: SituacaoEtapa[] = ["NAO_INICIADA", "EM_DIA", "ATRASADA", "CONCLUIDA"];

/**
 * Gantt simples em HTML/CSS: uma linha por etapa, barra do início ao fim
 * previsto, preenchida até o % realizado e colorida pela situação, com
 * marcador vertical de hoje. Etapas sem datas aparecem sem barra.
 */
export function Gantt({ cronograma, compacto = false }: { cronograma: Cronograma; compacto?: boolean }) {
  const { escala, etapas } = cronograma;

  if (!escala) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma etapa tem datas previstas. Defina início e fim das etapas para ver o Gantt.
      </p>
    );
  }

  // com muitos meses, rotula só alguns para não encavalar (menos ainda no celular)
  const passoRotulo = Math.ceil(escala.meses.length / (compacto ? 6 : 12));
  const passoCelular = Math.ceil(escala.meses.length / 3);
  const colunaNome = compacto ? "w-24 sm:w-32" : "w-24 sm:w-44";

  const rotulos = (passo: number, className: string) => (
    <div className={cn("relative h-5 flex-1 text-muted-foreground", className)}>
      {escala.meses.map((m, i) =>
        i % passo === 0 ? (
          <span
            key={m.mes}
            className="absolute top-0 truncate pl-1"
            style={{ left: `${m.esquerdaPct}%`, width: `${m.larguraPct * passo}%` }}
          >
            {formatarMesAno(inputParaData(`${m.mes}-15`))}
          </span>
        ) : null,
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="text-xs">
        {/* eixo de meses */}
        <div className="flex">
          <div className={cn("shrink-0", colunaNome)} />
          {rotulos(passoCelular, "sm:hidden")}
          {rotulos(passoRotulo, "hidden sm:block")}
          <div className="w-12 shrink-0" />
        </div>

        <div className="relative">
          {etapas.map((e) => {
            const cor = COR_SITUACAO[e.situacao];
            const pos =
              e.inicioPrevisto && e.fimPrevisto && e.fimPrevisto >= e.inicioPrevisto
                ? posicaoNoGantt(escala, e.inicioPrevisto, e.fimPrevisto)
                : null;
            const dica = pos
              ? `${e.nome}: ${formatarData(inputParaData(e.inicioPrevisto!))} a ${formatarData(
                  inputParaData(e.fimPrevisto!),
                )} (${duracaoEmDias(e.inicioPrevisto!, e.fimPrevisto!)} dias) · realizado ${formatarPercentBp(
                  e.realizadoBp,
                )} · ${ROTULO_SITUACAO[e.situacao]}${e.pesoBp === null ? "" : ` · peso ${formatarPercentBp(e.pesoBp)} da obra`}`
              : `${e.nome}: sem datas previstas · realizado ${formatarPercentBp(e.realizadoBp)}`;

            return (
              <div key={e.id} className="flex items-center border-t py-1.5" title={dica}>
                <span className={cn("shrink-0 truncate pr-2 text-sm", colunaNome)}>{e.nome}</span>
                <div className="relative h-5 flex-1">
                  {/* linhas dos meses */}
                  {escala.meses.map((m) => (
                    <div
                      key={m.mes}
                      className="absolute inset-y-0 border-l border-border/70"
                      style={{ left: `${m.esquerdaPct}%` }}
                    />
                  ))}
                  {pos ? (
                    <div
                      className={cn("absolute inset-y-0.5 overflow-hidden rounded", cor.trilho)}
                      style={{ left: `${pos.esquerdaPct}%`, width: `max(${pos.larguraPct}%, 4px)` }}
                    >
                      <div
                        className={cn("h-full", cor.barra)}
                        style={{ width: `${Math.min(100, e.realizadoBp / 100)}%` }}
                      />
                    </div>
                  ) : (
                    <span className="absolute inset-y-0 left-1 flex items-center text-xs text-muted-foreground">
                      sem datas
                    </span>
                  )}
                </div>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {formatarPercentBp(e.realizadoBp)}
                </span>
              </div>
            );
          })}

          {escala.hojePct !== null && (
            <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
              <div className={cn("shrink-0", colunaNome)} />
              <div className="relative flex-1">
                <div
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/80"
                  style={{ left: `${escala.hojePct}%` }}
                />
              </div>
              <div className="w-12 shrink-0" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ORDEM_LEGENDA.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("inline-block size-2.5 rounded-sm", COR_SITUACAO[s].barra)} />
            {ROTULO_SITUACAO[s]}
          </span>
        ))}
        {escala.hojePct !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 bg-foreground" /> Hoje
          </span>
        )}
      </div>
    </div>
  );
}
