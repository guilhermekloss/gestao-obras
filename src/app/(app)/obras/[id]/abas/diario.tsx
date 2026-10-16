import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { formatarData } from "@/lib/format";
import { dataDoRdo, resumoClima, totalPessoas } from "@/services/rdo";
import { CondicaoBadge } from "@/app/(app)/diario/condicao-badge";
import { NotebookPen, Plus } from "lucide-react";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";
import type { AbaObraProps } from "./tipos";

const LIMITE = 100;

export async function AbaDiario({ obra }: AbaObraProps) {
  const obraId = obra.id;
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

  const colunas: ColunaDados<(typeof rdos)[number]>[] = [
    {
      id: "data",
      titulo: "Data",
      papel: "titulo",
      classe: "tabela:font-medium",
      celula: (rdo) => (
        <Link href={`/diario/${rdo.id}`} className={LINK_DA_LINHA}>
          {formatarData(dataDoRdo(rdo.data))}
        </Link>
      ),
    },
    { id: "clima", titulo: "Clima", classe: "tabela:text-muted-foreground", celula: (rdo) => resumoClima(rdo) },
    {
      id: "condicao",
      titulo: "Condição",
      papel: "estado",
      celula: (rdo) => (rdo.condicao ? <CondicaoBadge condicao={rdo.condicao} curto /> : null),
    },
    { id: "efetivo", titulo: "Efetivo", numerica: true, celula: (rdo) => totalPessoas(rdo.efetivo) || null },
    { id: "fotos", titulo: "Fotos", numerica: true, celula: (rdo) => rdo._count.fotos || null },
    { id: "autor", titulo: "Autor", classe: "tabela:text-muted-foreground", celula: (rdo) => rdo.autor?.nome },
  ];

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
          <EstadoVazio
            compacto
            nivel={3}
            icone={NotebookPen}
            titulo="Nenhum RDO nesta obra"
            acao={
              <AcaoVazio href={`/diario/novo?obra=${obraId}`} icone={Plus}>
                Registrar primeiro RDO
              </AcaoVazio>
            }
          >
            Registre o dia de trabalho para formar o histórico da obra.
          </EstadoVazio>
        ) : (
          <>
            <ListaDeDados
              legenda="Diário de obra"
              linhas={rdos}
              chave={(rdo) => rdo.id}
              colunas={colunas}
            />
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
