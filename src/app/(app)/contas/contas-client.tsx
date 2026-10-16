"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  return (
    <div className="space-y-3">
      {selecionadas.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-accent/50 p-2">
          <span className="text-sm">
            {selecionadas.size} selecionada(s) · {formatarMoeda(totalSelecionado)}
          </span>
          <Button size="sm" onClick={pagarSelecionadas} disabled={pendente}>
            <CheckCheck className="size-4" />
            {pendente ? "Salvando..." : "Marcar como pagas"}
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <label className="-m-2 flex size-10 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas"
                    className="size-4 pointer-coarse:size-6"
                    checked={todasSelecionadas}
                    onChange={() =>
                      setSelecionadas(
                        todasSelecionadas ? new Set() : new Set(abertas.map((p) => p.id)),
                      )
                    }
                  />
                </label>
              </TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="hidden md:table-cell">Documento</TableHead>
              <TableHead className="hidden lg:table-cell">Obras</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parcelas.map((p) => (
              <TableRow key={p.id} className={p.vencida ? "bg-estado-vencido/40 shadow-[inset_4px_0_0_var(--estado-vencido-borda)]" : ""}>
                <TableCell>
                  {p.status === "ABERTA" && (
                    <label className="-m-2 flex size-10 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar parcela ${p.numero}/${p.totalParcelas} de ${p.fornecedor}`}
                        className="size-4 pointer-coarse:size-6"
                        checked={selecionadas.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                    </label>
                  )}
                </TableCell>
                <TableCell className={p.vencida ? "font-bold text-estado-vencido-fg" : ""}>
                  {formatarData(p.vencimento)}
                </TableCell>
                <TableCell className="max-w-36 truncate font-medium md:max-w-none">
                  <Link
                    href={`/notas/${p.notaId}`}
                    className="hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
                  >
                    {p.fornecedor}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={p.tipoDocumento === "NF" ? "outline" : "secondary"}
                      title={TIPO_DOCUMENTO_LABELS[p.tipoDocumento]}
                    >
                      {TIPO_DOCUMENTO_BADGE[p.tipoDocumento]}
                    </Badge>
                    {p.notaNumero}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-48 truncate lg:table-cell">{p.obras}</TableCell>
                <TableCell>
                  {p.numero}/{p.totalParcelas}
                </TableCell>
                <TableCell>
                  <StatusBadge estado={p.status === "PAGA" ? "pago" : p.vencida ? "vencido" : "neutro"}>
                    {p.status === "PAGA" ? "Paga" : p.vencida ? "Vencida" : "Aberta"}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-right num text-base">
                  {formatarMoeda(p.valorCents)}
                </TableCell>
                <TableCell>
                  {p.status === "PAGA" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Reabrir parcela"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await reabrirParcela(p.id);
                          if (!res.ok) toast.error(res.erro ?? "Erro");
                        })
                      }
                    >
                      <Undo2 className="size-4 text-muted-foreground" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {parcelas.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Nenhuma parcela nesta visão.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
