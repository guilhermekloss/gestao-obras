import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { ConfirmButton } from "@/components/confirm-button";
import { excluirRdo } from "./actions";
import { formatarData } from "@/lib/format";
import { Plus, Trash2, Users } from "lucide-react";

type EfetivoItem = { funcao: string; qtd: number };

export default async function DiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  const user = await exigirPapel();
  const { obra } = await searchParams;

  const [rdos, obras] = await Promise.all([
    prisma.diarioObra.findMany({
      where: obra ? { obraId: obra } : undefined,
      orderBy: { data: "desc" },
      take: 60,
      include: {
        obra: { select: { nome: true } },
        autor: { select: { nome: true } },
        fotos: true,
      },
    }),
    prisma.obra.findMany({ orderBy: { codigo: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Diário de obra</h1>
        <Button render={<Link href="/diario/novo" />}>
          <Plus className="size-4" /> RDO
        </Button>
      </div>

      <form method="get" className="flex items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            name="obra"
            defaultValue={obra ?? ""}
            todosLabel="Todas"
            placeholder="Todas"
            className="w-48"
            autoSubmit
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
      </form>

      {rdos.length === 0 ? (
        <p className="text-muted-foreground">Nenhum RDO registrado ainda.</p>
      ) : (
        <div className="space-y-3">
          {rdos.map((rdo) => {
            const efetivo = (rdo.efetivo as EfetivoItem[] | null) ?? [];
            const totalEfetivo = efetivo.reduce((a, e) => a + e.qtd, 0);
            const podeExcluir = user.role !== "CAMPO" || rdo.autorId === user.id;
            return (
              <Card key={rdo.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {rdo.obra.nome} · {formatarData(rdo.data)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rdo.autor?.nome ?? "—"}
                        {rdo.clima ? ` · ${rdo.clima}` : ""}
                        {totalEfetivo > 0 && (
                          <span className="ml-1 inline-flex items-center gap-1">
                            · <Users className="size-3" /> {totalEfetivo}
                          </span>
                        )}
                      </p>
                    </div>
                    {podeExcluir && (
                      <ConfirmButton
                        action={excluirRdo.bind(null, rdo.id)}
                        mensagem={`Excluir o RDO de ${formatarData(rdo.data)}?`}
                        variant="ghost"
                        size="icon"
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </ConfirmButton>
                    )}
                  </div>

                  <p className="whitespace-pre-wrap text-sm">{rdo.atividades}</p>
                  {rdo.ocorrencias && (
                    <p className="whitespace-pre-wrap rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      ⚠ {rdo.ocorrencias}
                    </p>
                  )}
                  {efetivo.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {efetivo.map((e) => `${e.qtd} ${e.funcao.toLowerCase()}`).join(" · ")}
                    </p>
                  )}
                  {rdo.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {rdo.fotos.map((f) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                          <img
                            src={f.url}
                            alt={f.legenda ?? "Foto do RDO"}
                            className="size-24 rounded-md object-cover"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
