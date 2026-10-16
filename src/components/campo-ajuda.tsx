"use client";

import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CampoAjuda({
  children,
  titulo,
  className,
}: {
  children: React.ReactNode;
  titulo?: string;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        type="button"
        aria-label={titulo ? `Ajuda: ${titulo}` : "Ajuda sobre o campo"}
        className={cn(
          "relative inline-flex size-4 shrink-0 items-center justify-center rounded-full before:absolute before:-inset-3.5 before:content-[''] pointer-coarse:before:-inset-4 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
