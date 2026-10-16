import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { BarraDeAcao } from "@/components/barra-de-acao";
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
import { ChevronRight, CloudSun, Images, NotebookPen, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";

// fotos que cabem na linha do cartão (a última vira "+N" quando sobram)

export const metadata: Metadata = { title: "Diário de obra" };
const FOTOS_NA_LISTA = 4;

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

  const novoHref = obra ? `/diario/novo?obra=${obra}` : "/diario/novo";

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl">Diário de obra</h1>
        {rdos.length > 0 && (
          <Button className="hidden md:inline-flex" render={<Link href={novoHref} />}>
            <Plus className="size-4" /> Registrar RDO
          </Button>
        )}
      </div>

      <form method="get" className="grid gap-2">
        <label htmlFor="filtro-obra" className="text-base font-semibold">Obra</label>
        <div className="flex items-start gap-2">
          <ComboboxFiltro
            name="obra"
            defaultValue={obra ?? ""}
            todosLabel="Todas"
            placeholder="Todas"
            className="min-w-0 flex-1 md:max-w-xs"
            inputClassName="h-14"
            autoSubmit
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
          <Button type="submit" variant="secondary" className="h-14 px-5 pointer-coarse:h-14">
            Filtrar
          </Button>
        </div>
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
              <AcaoVazio href={novoHref} icone={Plus}>
                Registrar primeiro RDO
              </AcaoVazio>
            }
          >
            O RDO guarda o que aconteceu na obra no dia: atividades, equipe, clima e fotos.
          </EstadoVazio>
        )
      ) : (
        <ul className="space-y-3">
          {rdos.map((rdo) => {
            const dia = dataDoRdo(rdo.data);
            const efetivo = normalizarEfetivo(rdo.efetivo);
            const equipamentos = normalizarEquipamentos(rdo.equipamentos);
            const totalEfetivo = efetivo.reduce((a, e) => a + e.qtd, 0);
            const clima = resumoClima(rdo);
            const podeExcluir = podeAlterarRdo(user, rdo);
            const sobram = rdo.fotos.length > FOTOS_NA_LISTA;
            const fotosVisiveis = sobram ? rdo.fotos.slice(0, FOTOS_NA_LISTA - 1) : rdo.fotos;
            return (
              <li key={rdo.id}>
                <Card>
                  <CardContent className="grid gap-3">
                    <Link
                      href={`/diario/${rdo.id}`}
                      className="-m-2 grid gap-3 rounded-lg p-2 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xl leading-snug font-semibold [font-stretch:112%]">{formatarData(dia)}</p>
                          <p className="text-base leading-snug">{rdo.obra.nome}</p>
                          <p className="text-sm text-muted-foreground">{rdo.autor?.nome ?? "—"}</p>
                        </div>
                        <ChevronRight aria-hidden className="mt-1 size-6 shrink-0 text-muted-foreground" />
                      </div>

                      {(rdo.condicao || clima || totalEfetivo > 0 || rdo.fotos.length > 0) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
                          {rdo.condicao && <CondicaoBadge condicao={rdo.condicao} curto className="h-7 text-sm" />}
                          {clima && (
                            <span className="inline-flex items-center gap-1.5">
                              <CloudSun aria-hidden className="size-5 shrink-0" /> {clima}
                            </span>
                          )}
                          {totalEfetivo > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <Users aria-hidden className="size-5 shrink-0" />
                              {totalEfetivo} {totalEfetivo === 1 ? "pessoa" : "pessoas"}
                            </span>
                          )}
                          {rdo.fotos.length > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <Images aria-hidden className="size-5 shrink-0" />
                              {rdo.fotos.length} {rdo.fotos.length === 1 ? "foto" : "fotos"}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="line-clamp-3 text-base whitespace-pre-wrap">{rdo.atividades}</p>
                      {rdo.ocorrencias && (
                        <p className="line-clamp-3 rounded-md border-2 border-estado-atencao-borda bg-estado-atencao p-3 text-base whitespace-pre-wrap text-estado-atencao-fg">
                          <strong>Ocorrência:</strong> {rdo.ocorrencias}
                        </p>
                      )}
                      {efetivo.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {efetivo.map((e) => `${e.qtd} ${e.funcao.toLowerCase()}`).join(" · ")}
                        </p>
                      )}
                      {equipamentos.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Equipamentos: {equipamentos.map((e) => `${e.qtd} ${e.nome.toLowerCase()}`).join(" · ")}
                        </p>
                      )}
                    </Link>

                    {rdo.fotos.length > 0 && (
                      <div className="grid grid-cols-4 gap-2">
                        {fotosVisiveis.map((f) => (
                          <a
                            key={f.id}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.url}
                              alt={f.legenda ?? "Foto do RDO"}
                              className="aspect-square w-full rounded-lg object-cover"
                              loading="lazy"
                            />
                          </a>
                        ))}
                        {sobram && (
                          <Link
                            href={`/diario/${rdo.id}`}
                            aria-label={`Ver as ${rdo.fotos.length} fotos`}
                            className="num grid aspect-square place-items-center rounded-lg border-2 border-input bg-muted text-xl font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            +{rdo.fotos.length - (FOTOS_NA_LISTA - 1)}
                          </Link>
                        )}
                      </div>
                    )}

                    {podeExcluir && (
                      <div className="flex justify-end border-t pt-3">
                        <ConfirmButton
                          action={excluirRdo.bind(null, rdo.id)}
                          mensagem={`Excluir o RDO de ${formatarData(dia)}?`}
                          variant="destructive"
                          size="lg"
                        >
                          <Trash2 aria-hidden className="size-4" /> Excluir RDO
                        </ConfirmButton>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {rdos.length > 0 && (
        <BarraDeAcao className="md:hidden">
          <Link href={novoHref} className={cn(buttonVariants({ size: "lg" }), "h-14 w-full text-lg pointer-coarse:h-14")}>
            <Plus aria-hidden className="size-5" /> Registrar RDO
          </Link>
        </BarraDeAcao>
      )}
    </div>
  );
}
