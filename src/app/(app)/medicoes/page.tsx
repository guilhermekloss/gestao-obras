import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { avancoPorEtapa } from "@/lib/custos";
import { avancoPonderado } from "@/services/obra";
import { formatarData, formatarPercentBp } from "@/lib/format";
import { SelectNativo } from "@/components/select-nativo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { NovaMedicaoDialog } from "./medicao-dialog";
import { excluirMedicao } from "./actions";
import { Trash2 } from "lucide-react";

export default async function MedicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  const user = await exigirPapel();
  const { obra: obraParam } = await searchParams;

  const obras = await prisma.obra.findMany({
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true },
  });
  const obraId = obraParam ?? obras[0]?.id;

  if (!obraId) {
    return <p className="text-muted-foreground">Cadastre uma obra primeiro.</p>;
  }

  const [etapas, avancos, medicoes] = await Promise.all([
    prisma.etapa.findMany({ where: { obraId }, orderBy: { ordem: "asc" } }),
    avancoPorEtapa(obraId),
    prisma.medicao.findMany({
      where: { etapa: { obraId } },
      orderBy: [{ data: "desc" }, { id: "desc" }],
      take: 30,
      include: {
        etapa: { select: { nome: true } },
        autor: { select: { nome: true } },
      },
    }),
  ]);

  const avancoObra = avancoPonderado(
    etapas.map((e) => ({
      orcamentoCents: e.orcamentoCents,
      percentBp: avancos.get(e.id) ?? 0,
    })),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Medições</h1>
        <span className="text-sm text-muted-foreground">
          Avanço da obra: <strong className="text-foreground">{formatarPercentBp(avancoObra)}</strong>
        </span>
      </div>

      <form method="get" className="flex items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <SelectNativo name="obra" defaultValue={obraId} className="w-48">
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </SelectNativo>
        </div>
        <Button type="submit" variant="secondary" size="sm">Ver</Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {etapas.map((e) => {
          const bp = avancos.get(e.id) ?? 0;
          return (
            <Card key={e.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{e.nome}</CardTitle>
                <NovaMedicaoDialog
                  etapaId={e.id}
                  etapaNome={e.nome}
                  atualPercent={bp / 100}
                />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${bp / 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-sm font-semibold">
                    {formatarPercentBp(bp)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {medicoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma medição registrada.</p>
          ) : (
            <ul className="divide-y">
              {medicoes.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-medium">{m.etapa.nome}</span> →{" "}
                    {formatarPercentBp(m.percentBp)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatarData(m.data)}
                      {m.autor ? ` · ${m.autor.nome}` : ""}
                      {m.obs ? ` · ${m.obs}` : ""}
                    </span>
                  </div>
                  {user.role !== "CAMPO" && (
                    <ConfirmButton
                      action={excluirMedicao.bind(null, m.id)}
                      mensagem="Excluir esta medição?"
                      variant="ghost"
                      size="icon"
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
