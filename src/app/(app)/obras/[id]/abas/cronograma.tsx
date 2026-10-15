import Link from "next/link";
import { formatarPercentBp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { carregarCronograma, paraGrafico } from "@/app/(app)/cronograma/dados";
import { Gantt } from "@/app/(app)/cronograma/gantt";
import { CurvaSChart } from "@/app/(app)/cronograma/curva-s-chart";
import type { AbaObraProps } from "./tipos";

/** Aba Cronograma da obra: versão compacta do Gantt e da curva S, com link para `/cronograma`. */
export async function AbaCronograma({ obraId, role }: AbaObraProps) {
  const cronograma = await carregarCronograma(obraId, { comPesos: role !== "CAMPO" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          Previsto até hoje:{" "}
          <strong className="text-foreground">{formatarPercentBp(cronograma.previstoHojeBp)}</strong>
          {" · "}Realizado:{" "}
          <strong className="text-foreground">{formatarPercentBp(cronograma.realizadoHojeBp)}</strong>
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href={`/cronograma?obra=${obraId}&aba=avanco`} />}>
            Lançar avanço
          </Button>
          <Button variant="outline" size="sm" render={<Link href={`/cronograma?obra=${obraId}`} />}>
            Abrir cronograma
          </Button>
        </div>
      </div>

      {cronograma.etapas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Gantt</CardTitle>
            </CardHeader>
            <CardContent>
              <Gantt cronograma={cronograma} compacto />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Curva S</CardTitle>
            </CardHeader>
            <CardContent>
              {cronograma.curva.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Defina as datas previstas das etapas para ver a curva S.
                </p>
              ) : (
                <CurvaSChart data={paraGrafico(cronograma.curva)} altura={240} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
