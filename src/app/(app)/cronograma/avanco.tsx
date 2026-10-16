import type { Role } from "@prisma/client";
import type { ObraAutorizada } from "@/lib/auth";
import { podeEditarCadastros } from "@/services/acesso";
import { prisma } from "@/lib/prisma";
import { formatarData, formatarPercentBp } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { NovaMedicaoDialog } from "./medicao-dialog";
import { excluirMedicao } from "./actions";
import { ReguaCota } from "@/components/regua-cota";
import { SituacaoBadge } from "./situacao";
import type { Cronograma } from "./dados";
import { Trash2 } from "lucide-react";

export async function SecaoAvanco({
  obra,
  role,
  cronograma,
}: {
  obra: ObraAutorizada;
  role: Role;
  cronograma: Cronograma;
}) {
  const obraId = obra.id;
  const medicoes = await prisma.medicao.findMany({
    where: { etapa: { obraId } },
    orderBy: [{ data: "desc" }, { id: "desc" }],
    take: 30,
    include: {
      etapa: { select: { nome: true } },
      autor: { select: { nome: true } },
    },
  });

  return (
    <div className="space-y-4">
      {cronograma.etapas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta obra não tem etapas cadastradas.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cronograma.etapas.map((e) => (
            <Card key={e.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="grid gap-1">
                  <CardTitle className="text-base">{e.nome}</CardTitle>
                  <SituacaoBadge situacao={e.situacao} />
                </div>
                <NovaMedicaoDialog etapaId={e.id} etapaNome={e.nome} atualPercent={e.realizadoBp / 100} />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <ReguaCota percent={e.realizadoBp / 100} rotulo={`Avanço de ${e.nome}`} />
                  <span className="w-14 text-right text-lg num">
                    {formatarPercentBp(e.realizadoBp)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {medicoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum avanço registrado.</p>
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
                  {podeEditarCadastros(role) && (
                    <ConfirmButton
                      action={excluirMedicao.bind(null, m.id)}
                      mensagem="Excluir este lançamento de avanço?"
                      rotulo="Excluir este lançamento de avanço"
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
