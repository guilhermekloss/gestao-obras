"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda, formatarPercentBp, centsParaEditavel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FaixaConsumo } from "@/services/analises";
import { salvarOrcamentos } from "./actions";
import { ESTILO_FAIXA } from "./faixa";

export type LinhaOrcamento = {
  etapaId: string | null; // null = itens sem etapa
  nome: string;
  previstoCents: number;
  realizadoCents: number;
  /** calculados no servidor (`services/analises`) a partir do previsto salvo */
  consumoBp: number | null;
  faixa: FaixaConsumo;
};

export type TotalOrcamento = Omit<LinhaOrcamento, "etapaId" | "nome">;

/** Orçamento ainda não preenchido fica em branco em vez de mostrar "0,00". */
function centsParaStr(cents: number): string {
  return cents ? centsParaEditavel(cents) : "";
}

export function OrcamentoForm({
  obraId,
  linhas,
  total,
}: {
  obraId: string;
  linhas: LinhaOrcamento[];
  total: TotalOrcamento;
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
            <Consumo consumoBp={l.consumoBp} faixa={l.faixa} />
            <Barra consumoBp={l.consumoBp} faixa={l.faixa} />
          </div>
        );
      })}

      <div className="grid grid-cols-2 items-center gap-2 border-t px-2 pt-2 text-sm font-semibold md:grid-cols-[1fr_140px_120px_120px_90px_140px]">
        <span>Total da obra</span>
        <span className="text-right">{formatarMoeda(total.previstoCents)}</span>
        <span className="text-right">{formatarMoeda(total.realizadoCents)}</span>
        <span
          className={cn(
            "text-right",
            total.previstoCents - total.realizadoCents < 0 && "text-destructive",
          )}
        >
          {formatarMoeda(total.previstoCents - total.realizadoCents)}
        </span>
        <Consumo consumoBp={total.consumoBp} faixa={total.faixa} />
        <Barra consumoBp={total.consumoBp} faixa={total.faixa} />
      </div>

      <div className="pt-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar orçamentos"}
        </Button>
      </div>
    </form>
  );
}

function Consumo({ consumoBp, faixa }: { consumoBp: number | null; faixa: FaixaConsumo }) {
  return (
    <span
      className={cn("text-right text-sm", faixa !== "OK" && "font-medium", ESTILO_FAIXA[faixa].texto)}
      title={ESTILO_FAIXA[faixa].rotulo}
    >
      {consumoBp !== null ? formatarPercentBp(consumoBp) : "—"}
    </span>
  );
}

function Barra({ consumoBp, faixa }: { consumoBp: number | null; faixa: FaixaConsumo }) {
  return (
    <div className="col-span-2 h-2 overflow-hidden rounded-full bg-muted md:col-span-1 md:self-center">
      {consumoBp !== null && (
        <div
          className={cn("h-full rounded-full", ESTILO_FAIXA[faixa].barra)}
          style={{ width: `${Math.min(100, consumoBp / 100)}%` }}
        />
      )}
    </div>
  );
}
