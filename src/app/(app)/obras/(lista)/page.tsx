import type { Metadata } from "next";
import { formatarCno } from "@/services/cno";
import { podeEditarCadastros, veFinanceiro } from "@/services/acesso";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { whereObrasPermitidas } from "@/services/acesso";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusObraBadge } from "@/components/status-obra-badge";
import { NovaObraDialog } from "../obra-dialogs";
import { formatarData, formatarMoedaAbreviada, formatarPercentBp, dataParaInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ReguaCota } from "@/components/regua-cota";
import { avancoObraHoje } from "@/services/avanco-obra";
import { realizadoPorObra } from "@/services/custos";
import { hojeDia, paraPlano } from "@/app/(app)/cronograma/dados";
import { COR_SITUACAO, SituacaoBadge } from "@/app/(app)/cronograma/situacao";
import { EstadoVazio } from "@/components/estado-vazio";
import { Building2, NotebookPen } from "lucide-react";

export const metadata: Metadata = { title: "Obras" };

// O RDO é datado por dia (sem hora): conta dias inteiros, não horas.
function quandoFoiORdo(data: Date, hoje: string): string {
  const dias = Math.round((Date.parse(hoje) - Date.parse(dataParaInput(data))) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias <= 30) return `há ${dias} dias`;
  return `em ${formatarData(data)}`;
}

export default async function ObrasPage() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  const podeEditar = podeEditarCadastros(user.role);

  const financeiro = veFinanceiro(user.role);

  const obras = await prisma.obra.findMany({
    where: whereObrasPermitidas(user.obrasPermitidas),
    orderBy: { codigo: "asc" },
    include: {
      etapas: { select: { id: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true } },
      diarios: { orderBy: { data: "desc" }, take: 1, select: { data: true } },
    },
  });
  const [medicoes, realizado] = await Promise.all([
    prisma.medicao.findMany({
      where: { etapa: { obraId: { in: obras.map((o) => o.id) } } },
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { etapaId: true, data: true, percentBp: true },
    }),
    financeiro ? realizadoPorObra() : null,
  ]);
  const hoje = hojeDia();
  const cartoes = obras.map((obra) => {
    const idsEtapas = new Set(obra.etapas.map((e) => e.id));
    const { plano, pontos } = paraPlano(obra.etapas, medicoes.filter((m) => idsEtapas.has(m.etapaId)));
    return {
      obra,
      avanco: obra.etapas.length > 0 ? avancoObraHoje(plano, pontos, hoje) : null,
      orcadoCents: obra.etapas.reduce((a, e) => a + e.orcamentoCents, 0),
      realizadoCents: realizado?.get(obra.id) ?? 0,
      ultimoRdo: obra.diarios[0]?.data ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl">Obras</h1>
        {podeEditar && obras.length > 0 && <NovaObraDialog />}
      </div>

      {obras.length === 0 ? (
        user.obrasPermitidas === null ? (
          <EstadoVazio
            icone={Building2}
            titulo="Nenhuma obra cadastrada"
            acao={podeEditar && <NovaObraDialog rotulo="Cadastrar obra" grande />}
          >
            {podeEditar
              ? "Cadastre a primeira obra para lançar notas, registrar o diário e acompanhar o avanço."
              : "Peça ao escritório para cadastrar a primeira obra."}
          </EstadoVazio>
        ) : (
          <EstadoVazio icone={Building2} titulo="Nenhuma obra liberada para você">
            Peça ao administrador para liberar o seu acesso.
          </EstadoVazio>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map(({ obra, avanco, orcadoCents, realizadoCents, ultimoRdo }) => {
            const consumoBp = orcadoCents > 0 ? Math.round((realizadoCents / orcadoCents) * 10000) : null;
            const estourou = consumoBp !== null && consumoBp > 10000;
            return (
              <Card key={obra.id} className="relative h-full transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="text-lg">
                      {/* o cartão inteiro leva à obra (::before cobre o cartão); o atalho do rodapé fica por cima */}
                      <Link href={`/obras/${obra.id}`} className="before:absolute before:inset-0 before:rounded-xl">
                        {obra.nome}
                      </Link>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {obra.codigo}
                      {obra.cno && ` · CNO ${formatarCno(obra.cno)}`}
                      {obra.inicioEm && ` · desde ${formatarData(obra.inicioEm)}`}
                    </p>
                  </div>
                  <StatusObraBadge status={obra.status} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {avanco && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Avanço físico</span>
                        <SituacaoBadge situacao={avanco.situacao} />
                      </div>
                      <div className="flex items-center gap-3">
                        <ReguaCota
                          percent={avanco.realizadoBp / 100}
                          marca={avanco.situacao === "SEM_DATAS" ? undefined : avanco.previstoBp / 100}
                          cor={COR_SITUACAO[avanco.situacao].barra}
                          rotulo={`Avanço físico de ${obra.nome}: realizado ${formatarPercentBp(avanco.realizadoBp)}, previsto ${formatarPercentBp(avanco.previstoBp)}`}
                        />
                        <span className="w-14 shrink-0 text-right text-base num">{formatarPercentBp(avanco.realizadoBp)}</span>
                      </div>
                    </div>
                  )}
                  {financeiro && (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-muted-foreground">Gasto</span>
                        <span>
                          <span className="text-base num">{formatarMoedaAbreviada(realizadoCents)}</span>
                          <span className="text-muted-foreground">
                            {orcadoCents > 0 ? ` de ${formatarMoedaAbreviada(orcadoCents)}` : " · sem orçamento"}
                          </span>
                        </span>
                      </div>
                      {consumoBp !== null && (
                        <div className="flex items-center gap-3">
                          <ReguaCota
                            percent={consumoBp / 100}
                            cor={estourou ? "bg-estado-vencido-borda" : "bg-primary"}
                            rotulo={`Orçamento consumido em ${obra.nome}: ${formatarPercentBp(consumoBp)}`}
                          />
                          <span
                            className={`w-14 shrink-0 text-right text-base num ${estourou ? "font-semibold text-estado-vencido-fg" : ""}`}
                          >
                            {formatarPercentBp(consumoBp)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <span className="text-muted-foreground">
                      {ultimoRdo ? `Último RDO ${quandoFoiORdo(ultimoRdo, hoje)}` : "Sem RDO ainda"}
                    </span>
                    {obra.status !== "CONCLUIDA" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="relative z-10"
                        aria-label={`Novo RDO de ${obra.nome}`}
                        render={<Link href={`/diario/novo?obra=${obra.id}`} />}
                      >
                        <NotebookPen className="size-4" /> Novo RDO
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
