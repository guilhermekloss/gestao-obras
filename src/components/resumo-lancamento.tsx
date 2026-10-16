"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, CircleDashed, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Conferência fixa do lançamento: o total da nota e, ao lado, o que precisa fechar com ele
 * (itens, rateio, parcelas). Fica presa sob o cabeçalho enquanto a pessoa rola o formulário.
 * Cada linha diz a situação com ícone e palavra e leva à seção correspondente.
 *
 * No celular a tira recolhe para uma linha ("Falta conferir 2 pontos"); no desktop fica aberta.
 */
export type SituacaoConferencia = "ok" | "aviso" | "erro" | "vazio";

export type LinhaConferencia = {
  id: string;
  rotulo: string;
  /** O número que a linha mede (soma dos itens, % do rateio...). */
  valor: string;
  situacao: SituacaoConferencia;
  /** Frase curta com a diferença ("Faltam R$ 40,00"). */
  detalhe: string;
};

const ICONE: Record<SituacaoConferencia, { Icone: LucideIcon; classe: string }> = {
  ok: { Icone: CheckCircle2, classe: "text-estado-no-prazo-fg" },
  aviso: { Icone: TriangleAlert, classe: "text-estado-atencao-fg" },
  erro: { Icone: OctagonAlert, classe: "text-estado-vencido-fg" },
  vazio: { Icone: CircleDashed, classe: "text-muted-foreground" },
};

export function ResumoLancamento({
  rotuloTotal = "Total da nota",
  total,
  linhas,
  onIr,
  pendentesExtras = 0,
  className,
}: {
  rotuloTotal?: string;
  total: string;
  linhas: LinhaConferencia[];
  /** Leva à seção da linha tocada. */
  onIr?: (id: string) => void;
  /** Pendências de fora das linhas (ex.: material sem escolha na importação); contam como erro. */
  pendentesExtras?: number;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const pendentes = linhas.filter((l) => l.situacao === "aviso" || l.situacao === "erro").length + pendentesExtras;
  const vazios = linhas.filter((l) => l.situacao === "vazio").length;
  const cabecalho =
    pendentes > 0
      ? `${pendentes} ${pendentes === 1 ? "ponto" : "pontos"} para conferir`
      : vazios > 0
        ? "Falta preencher"
        : "Tudo confere";
  const grave = pendentesExtras > 0 || linhas.some((l) => l.situacao === "erro");

  return (
    <section
      aria-label="Conferência do lançamento"
      className={cn(
        "sticky top-14 z-20 rounded-xl border bg-card ring-1 ring-transparent",
        pendentes > 0 && (grave ? "border-estado-vencido-borda" : "border-estado-atencao-borda"),
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:pointer-events-none md:cursor-default"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-muted-foreground">{rotuloTotal}</span>
          <span className="num block text-xl leading-tight">{total}</span>
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            grave ? "text-estado-vencido-fg" : pendentes > 0 ? "text-estado-atencao-fg" : "text-muted-foreground",
          )}
        >
          {cabecalho}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform md:hidden", aberto && "rotate-180")}
        />
      </button>
      <ul className={cn("grid-cols-1 gap-px border-t md:grid md:grid-cols-3", aberto ? "grid" : "hidden")}>
        {linhas.map((l) => {
          const { Icone, classe } = ICONE[l.situacao];
          return (
            <li key={l.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onIr?.(l.id)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icone aria-hidden className={cn("size-5 shrink-0", classe)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                    <span className="font-medium">{l.rotulo}</span>
                    <span className="num">{l.valor}</span>
                  </span>
                  <span
                    className={cn(
                      "block text-sm",
                      l.situacao === "erro"
                        ? "font-medium text-estado-vencido-fg"
                        : l.situacao === "aviso"
                          ? "font-medium text-estado-atencao-fg"
                          : "text-muted-foreground",
                    )}
                  >
                    {l.detalhe}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
