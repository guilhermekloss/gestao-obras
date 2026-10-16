"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { formatarMoeda, formatarData } from "@/lib/format";
import { TIPO_DOCUMENTO_BADGE, TIPO_DOCUMENTO_LABELS } from "@/services/financeiro";
import type { TipoDocumento } from "@prisma/client";
import { pagarParcelas, reabrirParcela } from "./actions";
import { CheckCheck, Undo2 } from "lucide-react";
import Link from "next/link";

export type ParcelaLinha = {
  id: string;
  vencimento: string;
  valorCents: number;
  numero: number;
  totalParcelas: number;
  status: "ABERTA" | "PAGA";
  pagaEm: string | null;
  vencida: boolean;
  fornecedor: string;
  notaId: string;
  notaNumero: string;
  tipoDocumento: TipoDocumento;
  obras: string;
};

export function ContasTable({ parcelas }: { parcelas: ParcelaLinha[] }) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [pendente, startTransition] = useTransition();

  const abertas = parcelas.filter((p) => p.status === "ABERTA");
  const todasSelecionadas = abertas.length > 0 && abertas.every((p) => selecionadas.has(p.id));

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pagarSelecionadas() {
    const ids = [...selecionadas];
    startTransition(async () => {
      const res = await pagarParcelas(ids);
      if (res.ok) {
        toast.success(`${ids.length} parcela(s) marcadas como pagas`);
        setSelecionadas(new Set());
      } else {
        toast.error(res.erro ?? "Erro");
      }
    });
  }

  const totalSelecionado = parcelas
    .filter((p) => selecionadas.has(p.id))
    .reduce((acc, p) => acc + p.valorCents, 0);

  function alternarTodas() {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(abertas.map((p) => p.id)));
  }

  const colunas: ColunaDados<ParcelaLinha>[] = [
    {
      id: "selecao",
      titulo: "Selecionar",
      papel: "selecao",
      tituloOculto: true,
      classeCabecalho: "w-10",
      cabecalho: (
        <label className="-m-2 flex size-10 cursor-pointer items-center justify-center cartao:hidden">
          <input
            type="checkbox"
            aria-label="Selecionar todas"
            className="size-4 pointer-coarse:size-6"
            checked={todasSelecionadas}
            onChange={alternarTodas}
          />
        </label>
      ),
      celula: (p) =>
        p.status === "ABERTA" ? (
          <label className="-m-2 flex size-10 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Selecionar parcela ${p.numero}/${p.totalParcelas} de ${p.fornecedor}`}
              className="size-4 pointer-coarse:size-6"
              checked={selecionadas.has(p.id)}
              onChange={() => toggle(p.id)}
            />
          </label>
        ) : (
          // mantém o recuo do título igual ao das parcelas abertas
          <span aria-hidden className="block size-6" />
        ),
    },
    {
      id: "vencimento",
      titulo: "Vencimento",
      celula: (p) => (
        <span className={p.vencida ? "font-bold text-estado-vencido-fg" : undefined}>
          {formatarData(p.vencimento)}
        </span>
      ),
    },
    {
      id: "fornecedor",
      titulo: "Fornecedor",
      papel: "titulo",
      classe: "tabela:font-medium",
      celula: (p) => (
        <Link href={`/notas/${p.notaId}`} className={LINK_DA_LINHA}>
          {p.fornecedor}
        </Link>
      ),
    },
    {
      id: "documento",
      titulo: "Documento",
      celula: (p) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge
            variant={p.tipoDocumento === "NF" ? "outline" : "secondary"}
            title={TIPO_DOCUMENTO_LABELS[p.tipoDocumento]}
          >
            {TIPO_DOCUMENTO_BADGE[p.tipoDocumento]}
          </Badge>
          {p.notaNumero}
        </span>
      ),
    },
    {
      id: "obras",
      titulo: "Obras",
      classe: "tabela:max-w-48 tabela:truncate",
      celula: (p) => p.obras || null,
    },
    { id: "parcela", titulo: "Parcela", celula: (p) => `${p.numero}/${p.totalParcelas}` },
    {
      id: "status",
      titulo: "Status",
      papel: "estado",
      celula: (p) => (
        <StatusBadge estado={p.status === "PAGA" ? "pago" : p.vencida ? "vencido" : "neutro"}>
          {p.status === "PAGA" ? "Paga" : p.vencida ? "Vencida" : "Aberta"}
        </StatusBadge>
      ),
    },
    {
      id: "valor",
      titulo: "Valor",
      papel: "valor",
      numerica: true,
      classe: "tabela:text-base",
      celula: (p) => formatarMoeda(p.valorCents),
    },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      classeCabecalho: "w-10",
      celula: (p) =>
        p.status === "PAGA" ? (
          <Button
            variant="ghost"
            title="Reabrir parcela"
            // celular: botão com texto; desktop: só o ícone, como os outros botões de ícone
            className="tabela:size-8 tabela:px-0 tabela:pointer-coarse:size-10"
            onClick={() =>
              startTransition(async () => {
                const res = await reabrirParcela(p.id);
                if (!res.ok) toast.error(res.erro ?? "Erro");
              })
            }
          >
            <Undo2 className="size-4 text-muted-foreground" />
            <span className="tabela:sr-only">Reabrir parcela</span>
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="@container space-y-3">
      {selecionadas.size > 0 && (
        // no celular a barra acompanha a rolagem, acima do menu de baixo
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-primary bg-card p-2 md:static md:border-border md:bg-accent/50">
          <span className="text-sm">
            {selecionadas.size} selecionada(s) · {formatarMoeda(totalSelecionado)}
          </span>
          <Button size="sm" onClick={pagarSelecionadas} disabled={pendente}>
            <CheckCheck className="size-4" />
            {pendente ? "Salvando..." : "Marcar como pagas"}
          </Button>
        </div>
      )}

      {abertas.length > 0 && (
        // o cabeçalho da tabela some no celular; este controle ocupa o lugar dele
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm tabela:hidden">
          <input
            type="checkbox"
            className="size-6"
            checked={todasSelecionadas}
            onChange={alternarTodas}
          />
          Selecionar todas as abertas
        </label>
      )}

      <ListaDeDados
        legenda="Parcelas"
        linhas={parcelas}
        chave={(p) => p.id}
        colunas={colunas}
        classeDaLinha={(p) =>
          p.vencida ? "bg-estado-vencido/40 shadow-[inset_4px_0_0_var(--estado-vencido-borda)]" : undefined
        }
        vazio="Nenhuma parcela nesta visão."
      />
    </div>
  );
}
