"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

/** Abre o diálogo de impressão do navegador — "Salvar como PDF" sai dali, sem dependência. */
export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" /> Imprimir / salvar PDF
    </Button>
  );
}
