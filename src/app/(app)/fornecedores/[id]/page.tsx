import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditarFornecedorDialog } from "../fornecedor-dialogs";
import { DependenciaBadge } from "../dependencia-badge";
import { calcularDependencia, PESOS } from "@/services/dependencia";
import { custoRateado, BP_TOTAL } from "@/services/rateio";
import { formatarMoeda, formatarData, formatarPercentBp } from "@/lib/format";
import type { TipoItem } from "@prisma/client";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const TIPO_LABELS: Record<TipoItem, string> = {
  MATERIAL: "Materiais",
  SERVICO: "Serviços",
  FRETE: "Frete",
  ENCARGO: "Encargos",
};

function normalizar(descricao: string): string {
  return descricao.trim().toLowerCase().replace(/\s+/g, " ");
}

export default async function FornecedorDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { id } = await params;

  const [fornecedor, dependencia] = await Promise.all([
    prisma.fornecedor.findUnique({
      where: { id },
      include: {
        notas: {
          orderBy: { dataCompra: "desc" },
          include: {
            itens: true,
            rateios: { include: { obra: { select: { id: true, nome: true } } } },
            _count: { select: { itens: true } },
          },
        },
      },
    }),
    calcularDependencia(),
  ]);
  if (!fornecedor) notFound();

  const dep = dependencia.get(fornecedor.id) ?? null;

  // Agregações para os quadros de detalhe.
  const gastoPorTipo = new Map<TipoItem, number>();
  const gastoPorObra = new Map<string, { nome: string; cents: number }>();
  const itensExclusivos = new Map<string, { descricao: string; cents: number; qtde: number }>();

  for (const nota of fornecedor.notas) {
    for (const item of nota.itens) {
      gastoPorTipo.set(item.tipo, (gastoPorTipo.get(item.tipo) ?? 0) + item.totalCents);

      for (const r of nota.rateios) {
        const atual = gastoPorObra.get(r.obraId) ?? { nome: r.obra.nome, cents: 0 };
        atual.cents += custoRateado(item.totalCents, r.fracaoBp);
        gastoPorObra.set(r.obraId, atual);
      }

      const chave = normalizar(item.descricao);
      if (dep?.descricoesExclusivas.has(chave)) {
        const atual = itensExclusivos.get(chave) ?? {
          descricao: item.descricao,
          cents: 0,
          qtde: 0,
        };
        atual.cents += item.totalCents;
        atual.qtde += 1;
        itensExclusivos.set(chave, atual);
      }
    }
  }

  const tipos = [...gastoPorTipo.entries()].sort((a, b) => b[1] - a[1]);
  const obras = [...gastoPorObra.values()].sort((a, b) => b.cents - a.cents);
  const exclusivos = [...itensExclusivos.values()].sort((a, b) => b.cents - a.cents);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/fornecedores" aria-label="Voltar" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-2xl font-semibold">{fornecedor.nome}</h1>
          {dep && <DependenciaBadge nivel={dep.nivel} score={dep.score} />}
        </div>
        <EditarFornecedorDialog fornecedor={fornecedor} />
      </div>

      {fornecedor.cnpj || fornecedor.fone ? (
        <p className="text-sm text-muted-foreground">
          {[fornecedor.cnpj, fornecedor.fone].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {!dep ? (
        <p className="text-muted-foreground">
          Nenhuma compra registrada para este fornecedor ainda.
        </p>
      ) : (
        <>
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard titulo="Gasto total" valor={formatarMoeda(dep.gastoCents)} destaque />
            <InfoCard
              titulo="% do gasto da empresa"
              valor={formatarPercentBp(Math.round(dep.fatores.shareGasto * BP_TOTAL))}
              destaque
            />
            <InfoCard titulo="Notas fiscais" valor={String(dep.numNotas)} />
            <InfoCard
              titulo="Última compra"
              valor={dep.ultimaCompra ? formatarData(dep.ultimaCompra) : "—"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Por que a dependência é {NIVEL_TEXTO[dep.nivel]}?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FatorBarra
                titulo="Concentração de gasto"
                descricao={`${formatarPercentBp(Math.round(dep.fatores.shareGasto * BP_TOTAL))} de tudo que a empresa comprou passou por este fornecedor.`}
                pontos={dep.componentes.concentracao}
                maximo={PESOS.concentracao}
              />
              <FatorBarra
                titulo="Exclusividade (fonte única)"
                descricao={`${formatarPercentBp(Math.round(dep.fatores.exclusividade * BP_TOTAL))} do que você compra dele são itens que nenhum outro fornecedor forneceu — ${formatarMoeda(dep.gastoExclusivoCents)}.`}
                pontos={dep.componentes.exclusividade}
                maximo={PESOS.exclusividade}
              />
              <FatorBarra
                titulo="Recência"
                descricao={
                  dep.ultimaCompra
                    ? `Última compra em ${formatarData(dep.ultimaCompra)}.`
                    : "Sem compras recentes."
                }
                pontos={dep.componentes.recencia}
                maximo={PESOS.recencia}
              />
              <FatorBarra
                titulo="Alcance nas obras"
                descricao={`${dep.obrasAtendidas} obra(s) dependem de material ou serviço deste fornecedor.`}
                pontos={dep.componentes.alcance}
                maximo={PESOS.alcance}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Gasto por tipo</CardTitle>
              </CardHeader>
              <CardContent>
                {tipos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem itens.</p>
                ) : (
                  <ul className="divide-y">
                    {tipos.map(([tipo, cents]) => (
                      <li key={tipo} className="flex items-center justify-between py-2 text-sm">
                        <span>{TIPO_LABELS[tipo]}</span>
                        <span className="font-medium">{formatarMoeda(cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Obras que dependem</CardTitle>
              </CardHeader>
              <CardContent>
                {obras.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem rateio para obras.</p>
                ) : (
                  <ul className="divide-y">
                    {obras.map((o) => (
                      <li key={o.nome} className="flex items-center justify-between py-2 text-sm">
                        <span className="truncate">{o.nome}</span>
                        <span className="font-medium">{formatarMoeda(o.cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {exclusivos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" />
                  Itens de fonte única
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Itens que só este fornecedor forneceu até hoje — os que mais amarram você a ele.
                </p>
                <ul className="divide-y">
                  {exclusivos.slice(0, 15).map((item) => (
                    <li
                      key={item.descricao}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="truncate">{item.descricao}</span>
                      <span className="shrink-0 font-medium">{formatarMoeda(item.cents)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Compras ({fornecedor.notas.length})</CardTitle>
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/notas?fornecedor=${fornecedor.id}`} />}
              >
                Ver nas notas
              </Button>
            </CardHeader>
            <CardContent>
              {fornecedor.notas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma nota fiscal.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Itens</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fornecedor.notas.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell>{formatarData(n.dataCompra)}</TableCell>
                          <TableCell>
                            <Link href={`/notas/${n.id}`} className="hover:underline">
                              {n.numero}
                            </Link>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right">
                            {n._count.itens}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatarMoeda(n.totalCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const NIVEL_TEXTO = { ALTA: "alta", MEDIA: "média", BAIXA: "baixa" } as const;

function InfoCard({
  titulo,
  valor,
  destaque = false,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={destaque ? "mt-1 text-lg font-semibold" : "mt-1 font-medium"}>{valor}</p>
      </CardContent>
    </Card>
  );
}

function FatorBarra({
  titulo,
  descricao,
  pontos,
  maximo,
}: {
  titulo: string;
  descricao: string;
  pontos: number;
  maximo: number;
}) {
  const pct = maximo > 0 ? Math.round((pontos / maximo) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{titulo}</span>
        <span className="text-xs text-muted-foreground">
          {Math.round(pontos)} / {maximo} pts
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{descricao}</p>
    </div>
  );
}
