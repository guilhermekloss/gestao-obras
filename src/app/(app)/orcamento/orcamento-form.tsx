"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda, formatarPercentBp, centsParaEditavel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FaixaConsumo } from "@/services/analises";
import type { Desempenho } from "@/services/desempenho-custo";
import type { ModoCusto } from "@/services/tributacao/custo-liquido";
import { salvarOrcamentos } from "./actions";
import { ESTILO_FAIXA } from "./faixa";

export type LinhaOrcamento = {
  etapaId: string | null; // null = itens sem etapa
  nome: string;
  previstoCents: number;
  /** O número principal: líquido do crédito de IBS/CBS no modo líquido, bruto no outro. */
  realizadoCents: number;
  /** Só com crédito a recuperar na linha: o que aparece embaixo do realizado. */
  brutoCents?: number;
  creditoCents?: number;
  consumoBp: number | null;
  faixa: FaixaConsumo;
  desempenho: Desempenho;
};

export type TotalOrcamento = Omit<LinhaOrcamento, "etapaId" | "nome">;

// Largo (contêiner ≥ 61rem, ~1100 px com a fonte de 18 px): uma linha por etapa, como tabela. Abaixo: um cartão por etapa, com rótulos.
const COLUNAS =
  "@min-[61rem]:grid-cols-[minmax(7rem,1fr)_7rem_repeat(2,6rem)_4rem_4rem_6rem_3.5rem_repeat(2,6rem)]";

function centsParaStr(cents: number): string {
  return cents ? centsParaEditavel(cents) : "";
}

function formatarIdc(bp: number | null): string {
  return bp === null ? "—" : (bp / 10_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OrcamentoForm({
  obraId,
  linhas,
  total,
  modo = "BRUTO",
}: {
  obraId: string;
  linhas: LinhaOrcamento[];
  total: TotalOrcamento;
  modo?: ModoCusto;
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
    <form id="tabela-orcamento" onSubmit={onSubmit} className="@container">
      <div className="space-y-2 @min-[61rem]:space-y-1">
        {/* cabeçalho só no desenho de tabela; cada célula já leva o próprio rótulo (sr-only nesse desenho) */}
        <div
          aria-hidden
          className={cn("hidden gap-2 px-2 pb-1 text-xs text-muted-foreground @min-[61rem]:grid", COLUNAS)}
        >
          <span>Etapa</span>
          <span className="text-right">Previsto (R$)</span>
          <span className="text-right">{rotuloRealizado(modo)}</span>
          <span className="text-right">Saldo</span>
          <span className="text-right">Consumo</span>
          <span className="text-right">Avanço físico</span>
          <span className="text-right">Valor agregado</span>
          <span className="text-right">IDC</span>
          <span className="text-right">Tendência</span>
          <span className="text-right">Variação</span>
        </div>

        {linhas.map((l) => (
          <Linha key={l.etapaId ?? "sem-etapa"} linha={l} modo={modo} />
        ))}

        <Linha total modo={modo} linha={{ etapaId: null, nome: "Total da obra", ...total }} />
      </div>

      <div className="pt-4">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar orçamentos"}
        </Button>
      </div>
    </form>
  );
}

function rotuloRealizado(modo: ModoCusto): string {
  return modo === "LIQUIDO" ? "Realizado líquido" : "Realizado";
}

function Linha({ linha: l, total = false, modo }: { linha: LinhaOrcamento; total?: boolean; modo: ModoCusto }) {
  const d = l.desempenho;
  // "Sem etapa definida" não tem orçado nem avanço: só o realizado e a tendência (= realizado) valem
  const semEtapa = !total && l.etapaId === null;
  const saldo = l.previstoCents - l.realizadoCents;
  const campoId = l.etapaId ? `previsto-${l.etapaId}` : undefined;

  return (
    <div
      className={cn(
        "grid gap-2",
        total
          ? "rounded-md border-2 p-3 font-semibold @min-[61rem]:rounded-none @min-[61rem]:border-0 @min-[61rem]:border-t @min-[61rem]:px-2 @min-[61rem]:pt-2 @min-[61rem]:pb-0"
          : "rounded-md border p-3 @min-[61rem]:border-0 @min-[61rem]:p-0 @min-[61rem]:px-2 @min-[61rem]:py-1",
        "@min-[61rem]:items-center",
        COLUNAS,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className={cn("text-sm", !total && "font-medium")}>{l.nome}</p>
        <Barra consumoBp={l.consumoBp} faixa={l.faixa} />
      </div>

      {/* no cartão, as células viram pares "rótulo: valor"; na tabela, `contents` as põe direto no grid */}
      <div className="grid gap-x-6 gap-y-1.5 @min-[28rem]:grid-cols-2 @min-[44rem]:grid-cols-3 @min-[61rem]:contents">
        {l.etapaId ? (
          <div className="flex items-center justify-between gap-3 @min-[61rem]:block">
            <label htmlFor={campoId} className="text-sm text-muted-foreground @min-[61rem]:sr-only">
              Previsto (R$)
            </label>
            <Input
              id={campoId}
              name={`etapa-${l.etapaId}`}
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={centsParaStr(l.previstoCents)}
              className="w-36 text-right num @min-[61rem]:w-full"
            />
          </div>
        ) : (
          <Celula rotulo="Previsto">{total ? formatarMoeda(l.previstoCents) : "—"}</Celula>
        )}
        <Celula rotulo={rotuloRealizado(modo)}>
          {formatarMoeda(l.realizadoCents)}
          {l.creditoCents ? (
            <span className="block text-xs font-normal text-muted-foreground">
              {modo === "LIQUIDO"
                ? `bruto ${formatarMoeda(l.brutoCents ?? 0)}`
                : `crédito IBS/CBS ${formatarMoeda(l.creditoCents)}`}
            </span>
          ) : null}
        </Celula>
        <Celula rotulo="Saldo" className={cn(!semEtapa && saldo < 0 && "font-medium text-destructive")}>
          {semEtapa ? "—" : formatarMoeda(saldo)}
        </Celula>
        <Celula
          rotulo="Consumo"
          className={cn(l.faixa !== "OK" && "font-medium", ESTILO_FAIXA[l.faixa].texto)}
          titulo={ESTILO_FAIXA[l.faixa].rotulo}
        >
          {l.consumoBp !== null ? formatarPercentBp(l.consumoBp) : "—"}
        </Celula>
        <Celula rotulo="Avanço físico">{semEtapa ? "—" : formatarPercentBp(d.fisicoBp)}</Celula>
        <Celula rotulo="Valor agregado">{semEtapa ? "—" : formatarMoeda(d.valorAgregadoCents)}</Celula>
        <Celula
          rotulo="IDC"
          className={cn(d.idcBp !== null && d.idcBp < 10_000 && cn("font-medium", ESTILO_FAIXA.ATENCAO.texto))}
        >
          {semEtapa ? "—" : formatarIdc(d.idcBp)}
        </Celula>
        <Celula rotulo="Tendência">{formatarMoeda(d.tendenciaCents)}</Celula>
        <Celula rotulo="Variação" className={cn(!semEtapa && d.variacaoCents < 0 && "font-medium text-destructive")}>
          {semEtapa ? "—" : formatarMoeda(d.variacaoCents)}
        </Celula>
      </div>
    </div>
  );
}

function Celula({
  rotulo,
  titulo,
  className,
  children,
}: {
  rotulo: string;
  titulo?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm @min-[61rem]:block @min-[61rem]:text-right">
      <span className="font-normal text-muted-foreground @min-[61rem]:sr-only">{rotulo}</span>
      <span className={cn("num whitespace-nowrap", className)} title={titulo}>
        {children}
      </span>
    </div>
  );
}

function Barra({ consumoBp, faixa }: { consumoBp: number | null; faixa: FaixaConsumo }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      {consumoBp !== null && (
        <div
          className={cn("h-full rounded-full", ESTILO_FAIXA[faixa].barra)}
          style={{ width: `${Math.min(100, consumoBp / 100)}%` }}
        />
      )}
    </div>
  );
}
