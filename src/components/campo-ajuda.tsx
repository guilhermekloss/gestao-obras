"use client";

import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Ícone "i" com explicação do campo. Abre ao passar o mouse (hover) e
 * também ao focar por teclado. No toque, um toque abre a dica.
 */
export function CampoAjuda({
  children,
  titulo,
  className,
}: {
  children: React.ReactNode;
  /** Título opcional acima da explicação (ex.: nome do campo por extenso). */
  titulo?: string;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        type="button"
        aria-label={titulo ? `Ajuda: ${titulo}` : "Ajuda sobre o campo"}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} align="start" className="z-50">
          <Tooltip.Popup className="max-w-xs rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md">
            {titulo && <p className="mb-1 font-medium text-foreground">{titulo}</p>}
            <div className="text-muted-foreground">{children}</div>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * Label com ícone de ajuda embutido. Uso:
 * <LabelAjuda htmlFor="cno" ajuda="..." titulo="Cadastro Nacional de Obras">CNO</LabelAjuda>
 */
export function LabelAjuda({
  children,
  ajuda,
  titulo,
  className,
  ...props
}: React.ComponentProps<typeof Label> & {
  ajuda: React.ReactNode;
  titulo?: string;
}) {
  return (
    <Label className={className} {...props}>
      {children}
      <CampoAjuda titulo={titulo}>{ajuda}</CampoAjuda>
    </Label>
  );
}
