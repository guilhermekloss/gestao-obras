import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { ConfirmButton } from "@/components/confirm-button";
import { excluirRdo } from "../actions";
import { CondicaoBadge } from "../condicao-badge";
import { listarObrasParaFiltro } from "@/services/obras";
import { whereObraIdPermitido } from "@/services/acesso";
import { formatarData } from "@/lib/format";
import {
  dataDoRdo,
  normalizarEfetivo,
  normalizarEquipamentos,
  podeAlterarRdo,
  resumoClima,
} from "@/services/rdo";
import { ChevronRight, Images, NotebookPen, Plus, Trash2, Users } from "lucide-react";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";

export default async function DiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  const user = await exigirPapel();
  const { obra } = await searchParams;

  const [rdos, obras] = await Promise.all([
    prisma.diarioObra.findMany({
      where: { AND: [whereObraIdPermitido(user.obrasPermitidas), obra ? { obraId: obra } : {}] },
      orderBy: { data: "desc" },
      take: 60,
      include: {
        obra: { select: { nome: true } },
        autor: { select: { nome: true } },
        fotos: true,
      },
    }),
    listarObrasParaFiltro(user.obrasPermitidas),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl">Diário de obra</h1>
        {rdos.length > 0 && (
          <Button render={<Link href={obra ? `/diario/novo?obra=${obra}` : "/diario/novo"} />}>
            <Plus className="size-4" /> Registrar RDO
          </Button>
        )}
      </div>

      <form method="get" className="flex items-end gap-2">
        <div className="grid gap-1">
          <label className="text-sm text-muted-foreground">Obra</label>
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
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      {rdos.length === 0 ? (
        obras.length === 0 ? (
          <EstadoVazio icone={NotebookPen} titulo="Nenhuma obra liberada para você">
            O diário é registrado por obra. Peça ao administrador para liberar o seu acesso.
          </EstadoVazio>
        ) : (
          <EstadoVazio
            icone={NotebookPen}
            titulo={obra ? "Nenhum RDO nesta obra" : "Nenhum RDO registrado"}
            acao={
              <AcaoVazio href={obra ? `/diario/novo?obra=${obra}` : "/diario/novo"} icone={Plus}>
                Registrar primeiro RDO
              </AcaoVazio>
            }
          >
            O RDO guarda o que aconteceu na obra no dia: atividades, equipe, clima e fotos.
          </EstadoVazio>
        )
      ) : (
        <div className="space-y-3">
          {rdos.map((rdo) => {
            const dia = dataDoRdo(rdo.data);
            const efetivo = normalizarEfetivo(rdo.efetivo);
            const equipamentos = normalizarEquipamentos(rdo.equipamentos);
            const totalEfetivo = efetivo.reduce((a, e) => a + e.qtd, 0);
            const clima = resumoClima(rdo);
            const podeExcluir = podeAlterarRdo(user, rdo);
            return (
              <Card key={rdo.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/diario/${rdo.id}`} className="group min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-semibold group-hover:underline">
                        {rdo.obra.nome} · {formatarData(dia)}
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                        <span>{rdo.autor?.nome ?? "—"}</span>
                        {clima && <span>· {clima}</span>}
                        {totalEfetivo > 0 && (
                          <span className="inline-flex items-center gap-1">
                            · <Users className="size-3" /> {totalEfetivo}
                          </span>
                        )}
                        {rdo.fotos.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            · <Images className="size-3" /> {rdo.fotos.length}
                          </span>
                        )}
                        {rdo.condicao && (
                          <CondicaoBadge condicao={rdo.condicao} curto className="ml-1" />
                        )}
                      </p>
                    </Link>
                    {podeExcluir && (
                      <ConfirmButton
                        action={excluirRdo.bind(null, rdo.id)}
                        mensagem={`Excluir o RDO de ${formatarData(dia)}?`}
                        variant="ghost"
                        size="icon"
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </ConfirmButton>
                    )}
                  </div>

                  <p className="whitespace-pre-wrap text-sm">{rdo.atividades}</p>
                  {rdo.ocorrencias && (
                    <p className="whitespace-pre-wrap rounded-md border-2 border-estado-atencao-borda bg-estado-atencao p-2 text-sm text-estado-atencao-fg">
                      <strong>Ocorrência:</strong> {rdo.ocorrencias}
                    </p>
                  )}
                  {efetivo.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {efetivo.map((e) => `${e.qtd} ${e.funcao.toLowerCase()}`).join(" · ")}
                    </p>
                  )}
                  {equipamentos.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Equipamentos: {equipamentos.map((e) => `${e.qtd} ${e.nome.toLowerCase()}`).join(" · ")}
                    </p>
                  )}
                  {rdo.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {rdo.fotos.map((f) => (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
