import { formatarData, formatarDesvioBp, formatarMesAno, formatarPercentBp, formatarVariacaoDias, inputParaData } from "@/lib/format";
import { cn } from "@/lib/utils";
import { duracaoEmDias, posicaoNoGantt, ROTULO_SITUACAO, type Dia, type SituacaoEtapa } from "@/services/cronograma";
import type { Cronograma, EtapaCronograma } from "./dados";
import { COR_SITUACAO } from "./situacao";

const ORDEM_LEGENDA: SituacaoEtapa[] = ["NAO_INICIADA", "EM_DIA", "ATENCAO", "ATRASADA", "CONCLUIDA"];

const data = (dia: Dia) => formatarData(inputParaData(dia));

function dicaDaEtapa(e: EtapaCronograma): string {
  const partes = [e.nome];
  if (e.inicioPrevisto && e.fimPrevisto && e.fimPrevisto >= e.inicioPrevisto) {
    partes.push(
      `${data(e.inicioPrevisto)} a ${data(e.fimPrevisto)} (${duracaoEmDias(e.inicioPrevisto, e.fimPrevisto)} dias)`,
      `previsto hoje ${formatarPercentBp(e.previstoHojeBp)}`,
      `realizado ${formatarPercentBp(e.realizadoBp)}`,
      `desvio ${formatarDesvioBp(e.desvioBp)}`,
      ROTULO_SITUACAO[e.situacao],
    );
  } else {
    partes.push("sem datas previstas", `realizado ${formatarPercentBp(e.realizadoBp)}`);
  }
  if (e.linhaBase?.inicio && e.linhaBase.fim) {
    partes.push(
      `linha de base ${data(e.linhaBase.inicio)} a ${data(e.linhaBase.fim)}` +
        (e.variacaoFimDias === null ? "" : ` (fim ${formatarVariacaoDias(e.variacaoFimDias)})`),
    );
  }
  if (e.pesoBp !== null) partes.push(`peso ${formatarPercentBp(e.pesoBp)} da obra`);
  return partes.join(" · ");
}

export function Gantt({ cronograma, compacto = false }: { cronograma: Cronograma; compacto?: boolean }) {
  const { escala, etapas } = cronograma;
  const comBase = cronograma.linhaBase !== null;

  if (!escala) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma etapa tem datas previstas. Defina início e fim das etapas para ver o Gantt.
      </p>
    );
  }

  const passoRotulo = Math.ceil(escala.meses.length / (compacto ? 6 : 12));
  // no celular, com a coluna de variação, sobra menos espaço para as barras: menos rótulos de mês e nome mais curto
  const passoCelular = Math.ceil(escala.meses.length / (comBase ? 2 : 3));
  const colunaNome = cn(comBase ? "w-20" : "w-24", compacto ? "sm:w-32" : "sm:w-44");
  const colunaVariacao = "w-12 shrink-0 text-right";

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
        <div className="flex">
          <div className={cn("shrink-0", colunaNome)} />
          {rotulos(passoCelular, "sm:hidden")}
          {rotulos(passoRotulo, "hidden sm:block")}
          <div className="w-12 shrink-0 text-right text-muted-foreground" title="Realizado">
            {comBase ? "Real." : ""}
          </div>
          {comBase && (
            <div className={cn(colunaVariacao, "text-muted-foreground")} title="Variação do fim em relação à linha de base">
              Var. fim
            </div>
          )}
        </div>

        <div className="relative">
          {etapas.map((e) => {
            const cor = COR_SITUACAO[e.situacao];
            const pos =
              e.inicioPrevisto && e.fimPrevisto && e.fimPrevisto >= e.inicioPrevisto
                ? posicaoNoGantt(escala, e.inicioPrevisto, e.fimPrevisto)
                : null;
            const posBase =
              e.linhaBase?.inicio && e.linhaBase.fim && e.linhaBase.fim >= e.linhaBase.inicio
                ? posicaoNoGantt(escala, e.linhaBase.inicio, e.linhaBase.fim)
                : null;

            return (
              <div key={e.id} className="flex items-center border-t py-1.5" title={dicaDaEtapa(e)}>
                <span className={cn("shrink-0 truncate pr-2 text-sm", colunaNome)}>{e.nome}</span>
                <div className={cn("relative flex-1", comBase ? "h-6" : "h-5")}>
                  {escala.meses.map((m) => (
                    <div
                      key={m.mes}
                      className="absolute inset-y-0 border-l border-border/70"
                      style={{ left: `${m.esquerdaPct}%` }}
                    />
                  ))}
                  {pos ? (
                    <div
                      className={cn(
                        "absolute overflow-hidden rounded-sm [print-color-adjust:exact]",
                        comBase ? "top-0.5 h-4" : "inset-y-0.5",
                        cor.trilho,
                      )}
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
                  {posBase && (
                    <div
                      data-linha-base=""
                      className="absolute bottom-0 h-1 rounded-sm bg-muted-foreground [print-color-adjust:exact]"
                      style={{ left: `${posBase.esquerdaPct}%`, width: `max(${posBase.larguraPct}%, 4px)` }}
                    />
                  )}
                </div>
                <span className="w-12 shrink-0 text-right text-sm num text-foreground">
                  {formatarPercentBp(e.realizadoBp)}
                </span>
                {comBase && (
                  <span
                    className={cn(
                      colunaVariacao,
                      "text-sm num",
                      e.variacaoFimDias !== null && e.variacaoFimDias > 0 ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatarVariacaoDias(e.variacaoFimDias)}
                  </span>
                )}
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
              {comBase && <div className="w-12 shrink-0" />}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ORDEM_LEGENDA.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-2.5 w-4 rounded-sm [print-color-adjust:exact]", COR_SITUACAO[s].barra)} />
            {ROTULO_SITUACAO[s]}
          </span>
        ))}
        {comBase && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-4 rounded-sm bg-muted-foreground [print-color-adjust:exact]" />
            Linha de base
          </span>
        )}
        {escala.hojePct !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 bg-foreground" /> Hoje
          </span>
        )}
      </div>
      {comBase && (
        <p className="text-xs text-muted-foreground">
          Var. fim: dias entre o fim atual e o da linha de base (+ atrasou, − adiantou).
        </p>
      )}
    </div>
  );
}
