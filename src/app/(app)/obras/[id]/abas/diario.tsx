import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData } from "@/lib/format";
import { dataDoRdo, resumoClima, totalPessoas } from "@/services/rdo";
import { CondicaoBadge } from "@/app/(app)/diario/condicao-badge";
import { Plus } from "lucide-react";
import type { AbaObraProps } from "./tipos";

const LIMITE = 100;

export async function AbaDiario({ obraId }: AbaObraProps) {
  const [rdos, total, porCondicao] = await Promise.all([
    prisma.diarioObra.findMany({
      where: { obraId },
      orderBy: { data: "desc" },
      take: LIMITE,
      select: {
        id: true,
        data: true,
        clima: true,
        climaManha: true,
        climaTarde: true,
        condicao: true,
        efetivo: true,
        autor: { select: { nome: true } },
        _count: { select: { fotos: true } },
      },
    }),
    prisma.diarioObra.count({ where: { obraId } }),
    prisma.diarioObra.groupBy({
      by: ["condicao"],
      where: { obraId, condicao: { in: ["PARCIAL", "IMPRATICAVEL"] } },
      _count: { _all: true },
    }),
  ]);
  const dias = (c: "PARCIAL" | "IMPRATICAVEL") =>
    porCondicao.find((g) => g.condicao === c)?._count._all ?? 0;
  const impraticaveis = dias("IMPRATICAVEL");
  const parciais = dias("PARCIAL");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Diário de obra</CardTitle>
          {total > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {total} {total === 1 ? "RDO" : "RDOs"}
              {impraticaveis > 0 &&
                ` · ${impraticaveis} ${impraticaveis === 1 ? "dia impraticável" : "dias impraticáveis"}`}
              {parciais > 0 && ` · ${parciais} ${parciais === 1 ? "dia parcial" : "dias parciais"}`}
            </p>
          )}
        </div>
        <Button size="sm" render={<Link href={`/diario/novo?obra=${obraId}`} />}>
          <Plus className="size-4" /> Novo RDO
        </Button>
      </CardHeader>
      <CardContent>
        {rdos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum RDO registrado nesta obra.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Clima</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead className="text-right">Efetivo</TableHead>
                  <TableHead className="text-right">Fotos</TableHead>
                  <TableHead>Autor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rdos.map((rdo) => (
                  <TableRow key={rdo.id}>
                    <TableCell className="font-medium">
                      <Link href={`/diario/${rdo.id}`} className="hover:underline">
                        {formatarData(dataDoRdo(rdo.data))}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{resumoClima(rdo) ?? "—"}</TableCell>
                    <TableCell>
                      {rdo.condicao ? <CondicaoBadge condicao={rdo.condicao} curto /> : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{totalPessoas(rdo.efetivo) || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{rdo._count.fotos || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{rdo.autor?.nome ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {total > rdos.length && (
              <p className="mt-3 text-xs text-muted-foreground">
                Mostrando os {rdos.length} mais recentes.{" "}
                <Link href={`/diario?obra=${obraId}`} className="underline">
                  Ver no Diário
                </Link>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
