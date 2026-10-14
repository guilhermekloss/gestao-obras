import Link from "next/link";
import { notFound } from "next/navigation";
import { startOfDay, addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { realizadoPorEtapa, avancoPorEtapa } from "@/services/custos";
import { avancoPonderado } from "@/services/obra";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarEtapa, excluirEtapa } from "../../actions";
import { formatarData, formatarMoeda, formatarPercentBp } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { dataDoRdo } from "@/services/rdo";
import type { AbaObraProps } from "./tipos";

export async function AbaResumo({ obraId: id, role }: AbaObraProps) {
  const podeEditar = role !== "CAMPO";
  const veFinanceiro = role !== "CAMPO";

  const obra = await prisma.obra.findUnique({
    where: { id },
    include: { etapas: { orderBy: { ordem: "asc" } } },
  });
  if (!obra) notFound();

  const hoje = startOfDay(new Date());
  const [realizado, avancos, ultimosRdos, proximasParcelas] = await Promise.all([
    veFinanceiro ? realizadoPorEtapa(id) : Promise.resolve(new Map<string | null, number>()),
    avancoPorEtapa(id),
    prisma.diarioObra.findMany({
      where: { obraId: id },
      orderBy: { data: "desc" },
      take: 3,
      include: { autor: { select: { nome: true } } },
    }),
    veFinanceiro
      ? prisma.parcela.findMany({
          where: {
            status: "ABERTA",
            vencimento: { lte: addDays(hoje, 30) },
            nota: { rateios: { some: { obraId: id } } },
          },
          orderBy: { vencimento: "asc" },
          take: 5,
          include: { nota: { include: { fornecedor: { select: { nome: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const custoTotal = [...realizado.values()].reduce((a, b) => a + b, 0);
  const orcamentoTotal = obra.etapas.reduce((a, e) => a + e.orcamentoCents, 0);
  const avancoObra = avancoPonderado(
    obra.etapas.map((e) => ({
      orcamentoCents: e.orcamentoCents,
      percentBp: avancos.get(e.id) ?? 0,
    })),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {veFinanceiro && (
          <InfoCard titulo="Custo acumulado" valor={formatarMoeda(custoTotal)} destaque />
        )}
        {veFinanceiro && (
          <InfoCard
            titulo="Orçamento previsto"
            valor={orcamentoTotal ? formatarMoeda(orcamentoTotal) : "—"}
          />
        )}
        <InfoCard titulo="Avanço físico" valor={formatarPercentBp(avancoObra)} destaque />
        <InfoCard titulo="Código / CNO" valor={`${obra.codigo}${obra.cno ? ` · ${obra.cno}` : ""}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Etapas</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" render={<Link href={`/cronograma?obra=${obra.id}`} />}>
                Cronograma
              </Button>
              {podeEditar && (
                <FormDialog
                  titulo="Nova etapa"
                  action={criarEtapa.bind(null, obra.id)}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Plus className="size-4" /> Etapa
                    </Button>
                  }
                >
                  <Input name="nome" placeholder="Nome da etapa" required />
                </FormDialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {obra.etapas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
            ) : (
              <ul className="divide-y">
                {obra.etapas.map((etapa) => {
                  const bp = avancos.get(etapa.id) ?? 0;
                  return (
                    <li key={etapa.id} className="flex items-center gap-3 py-2">
                      <span className="flex-1 text-sm">{etapa.nome}</span>
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${bp / 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {formatarPercentBp(bp)}
                      </span>
                      {podeEditar && (
                        <ConfirmButton
                          action={excluirEtapa.bind(null, etapa.id)}
                          mensagem={`Excluir a etapa "${etapa.nome}"?`}
                          variant="ghost"
                          size="icon"
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </ConfirmButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {veFinanceiro && (
            <Card>
              <CardHeader>
                <CardTitle>Contas a vencer (30 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                {proximasParcelas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nada a vencer nos próximos 30 dias.</p>
                ) : (
                  <ul className="divide-y">
                    {proximasParcelas.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="truncate">
                          {formatarData(p.vencimento)} · {p.nota.fornecedor.nome}
                        </span>
                        <span className="font-medium">{formatarMoeda(p.valorCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Últimos RDOs</CardTitle>
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/obras/${obra.id}?aba=diario`} />}
              >
                Ver todos
              </Button>
            </CardHeader>
            <CardContent>
              {ultimosRdos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum RDO registrado.</p>
              ) : (
                <ul className="divide-y">
                  {ultimosRdos.map((rdo) => (
                    <li key={rdo.id} className="py-2 text-sm">
                      <Link href={`/diario/${rdo.id}`} className="font-medium hover:underline">
                        {formatarData(dataDoRdo(rdo.data))}
                      </Link>
                      {rdo.autor ? ` · ${rdo.autor.nome}` : ""} —{" "}
                      <span className="text-muted-foreground">
                        {rdo.atividades.length > 80
                          ? rdo.atividades.slice(0, 80) + "…"
                          : rdo.atividades}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

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
