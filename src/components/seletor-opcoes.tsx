"use client";

import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Opcao<V extends string> = {
  valor: V;
  rotulo: string;
  icone: LucideIcon;
  /** Cores da opção marcada (fundo, borda e texto). Sem isso, usa o azul-planta. */
  estiloMarcada?: string;
};

const MARCADA = "border-primary bg-nav-ativo text-primary";

/**
 * Escolha de uma opção por botões grandes (alvo ≥ 64 px), no lugar de `<select>`:
 * um toque escolhe, outro toque na mesma opção limpa. A marcada tem borda grossa, ícone de visto
 * e texto em negrito, então a seleção não depende só da cor (sol forte, tela com brilho).
 */
export function SeletorOpcoes<V extends string>({
  rotulo,
  valor,
  onChange,
  opcoes,
  colunas = 2,
  className,
}: {
  /** Nome do grupo para leitor de tela. */
  rotulo: string;
  valor: V | "";
  onChange: (valor: V | "") => void;
  opcoes: Opcao<V>[];
  colunas?: 1 | 2;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn("grid gap-2", colunas === 2 ? "grid-cols-2" : "grid-cols-1", className)}
    >
      {opcoes.map(({ valor: v, rotulo: texto, icone: Icone, estiloMarcada }) => {
        const marcada = valor === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={marcada}
            onClick={() => onChange(marcada ? "" : v)}
            className={cn(
              "relative flex min-h-16 items-center justify-center gap-2.5 rounded-lg border-2 px-3 py-2 text-base leading-tight outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px",
              colunas === 1 ? "justify-start" : "flex-col gap-1",
              marcada
                ? cn("font-semibold", estiloMarcada ?? MARCADA)
                : "border-input bg-card font-medium text-foreground hover:bg-muted",
            )}
          >
            <Icone aria-hidden className="size-6 shrink-0" />
            <span>{texto}</span>
            {marcada && (
              <Check
                aria-hidden
                className={cn("size-5 shrink-0", colunas === 1 ? "ml-auto" : "absolute top-1.5 right-1.5")}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
