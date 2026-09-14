"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda, centsParaEditavel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { salvarOrcamentos } from "./actions";

export type LinhaOrcamento = {
  etapaId: string | null; // null = itens sem etapa
  nome: string;
  previstoCents: number;
  realizadoCents: number;
};

/** Orçamento ainda não preenchido fica em branco em vez de mostrar "0,00". */
function centsParaStr(cents: number): string {
  return cents ? centsParaEditavel(cents) : "";
}

export function OrcamentoForm({
  obraId,
  linhas,
}: {
  obraId: string;
  linhas: LinhaOrcamento[];
}) {
  const [pendente, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await salvarOrcamentos(obraId, formData);
      if (res.ok) toast.success("Orçamentos salvos");
      else toast.error(res.erro ?? "Erro ao salvar");
    });
  }

  const totalPrevisto = linhas.reduce((a, l) => a + l.previstoCents, 0);
  const totalRealizado = linhas.reduce((a, l) => a + l.realizadoCents, 0);

  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <div className="hidden grid-cols-[1fr_140px_120px_120px_90px_140px] gap-2 px-2 pb-1 text-xs text-muted-foreground md:grid">
        <span>Etapa</span>
        <span className="text-right">Previsto (R$)</span>
        <span className="text-right">Realizado</span>
        <span className="text-right">Saldo</span>
        <span className="text-right">Consumo</span>
        <span></span>
      </div>

      {linhas.map((l) => {
        const saldo = l.previstoCents - l.realizadoCents;
        const consumo = l.previstoCents > 0 ? l.realizadoCents / l.previstoCents : null;
        return (
          <div
            key={l.etapaId ?? "sem-etapa"}
            className="grid grid-cols-2 items-center gap-2 rounded-md border p-2 md:grid-cols-[1fr_140px_120px_120px_90px_140px] md:border-0 md:p-0 md:px-2 md:py-1"
          >
            <span className="text-sm font-medium">{l.nome}</span>
            {l.etapaId ? (
              <Input
                name={`etapa-${l.etapaId}`}
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsParaStr(l.previstoCents)}
                className="text-right"
              />
            ) : (
              <span className="text-right text-sm text-muted-foreground">—</span>
            )}
            <span className="text-right text-sm">{formatarMoeda(l.realizadoCents)}</span>
            <span
              className={cn(
                "text-right text-sm",
                l.etapaId && saldo < 0 && "font-medium text-destructive",
              )}
            >
              {l.etapaId ? formatarMoeda(saldo) : "—"}
            </span>
            <span className="text-right text-sm">
              {consumo !== null ? `${Math.round(consumo * 100)}%` : "—"}
            </span>
            <div className="col-span-2 h-2 overflow-hidden rounded-full bg-muted md:col-span-1 md:self-center">
              {consumo !== null && (
                <div
                  className={cn(
                    "h-full rounded-full",
                    consumo > 1 ? "bg-destructive" : consumo > 0.85 ? "bg-amber-500" : "bg-green-500",
                  )}
                  style={{ width: `${Math.min(100, consumo * 100)}%` }}
                />
              )}
            </div>
          </div>
        );
      })}

      <div className="grid grid-cols-2 gap-2 border-t px-2 pt-2 text-sm font-semibold md:grid-cols-[1fr_140px_120px_120px_90px_140px]">
        <span>Total</span>
        <span className="text-right">{formatarMoeda(totalPrevisto)}</span>
        <span className="text-right">{formatarMoeda(totalRealizado)}</span>
        <span className="hidden text-right md:block">
          {formatarMoeda(totalPrevisto - totalRealizado)}
        </span>
      </div>

      <div className="pt-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar orçamentos"}
        </Button>
      </div>
    </form>
  );
}
