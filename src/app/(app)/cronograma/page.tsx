import Link from "next/link";
import { exigirPapel } from "@/lib/auth";
import { formatarPercentBp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listarObrasParaFiltro } from "@/services/obras";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { carregarCronograma, paraGrafico, type Cronograma } from "./dados";
import { Gantt } from "./gantt";
import { CurvaSChart } from "./curva-s-chart";
import { EditarDatasDialog } from "./datas-dialog";
import { SecaoAvanco } from "./avanco";

const ABAS = [
  { key: "planejamento", label: "Planejamento" },
  { key: "avanco", label: "Avanço" },
] as const;

export default async function CronogramaPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; aba?: string }>;
}) {
  const user = await exigirPapel();
  const { obra: obraParam, aba: abaParam } = await searchParams;

  const obras = await listarObrasParaFiltro(user.obrasPermitidas);
  const obraId = obras.some((o) => o.id === obraParam) ? obraParam! : obras[0]?.id;
  const aba = ABAS.find((a) => a.key === abaParam) ?? ABAS[0];

  if (!obraId) {
    return (
      <p className="text-muted-foreground">
        {user.obrasPermitidas === null
          ? "Cadastre uma obra primeiro."
          : "Nenhuma obra liberada para você — fale com o administrador."}
      </p>
    );
  }

  const cronograma = await carregarCronograma(obraId, { comPesos: user.role !== "CAMPO" });
  const atrasadas = cronograma.etapas.filter((e) => e.situacao === "ATRASADA").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Cronograma</h1>
        <span className="text-sm text-muted-foreground">
          Previsto até hoje:{" "}
          <strong className="text-foreground">{formatarPercentBp(cronograma.previstoHojeBp)}</strong>
          {" · "}Realizado:{" "}
          <strong className="text-foreground">{formatarPercentBp(cronograma.realizadoHojeBp)}</strong>
          {atrasadas > 0 && (
            <>
              {" · "}
              <strong className="text-destructive">
                {atrasadas} etapa{atrasadas > 1 ? "s" : ""} atrasada{atrasadas > 1 ? "s" : ""}
              </strong>
            </>
          )}
        </span>
      </div>

      <form method="get" className="flex items-end gap-2">
        {aba.key !== "planejamento" && <input type="hidden" name="aba" value={aba.key} />}
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            name="obra"
            defaultValue={obraId}
            placeholder="Buscar obra..."
            className="w-56"
            autoSubmit
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">Ver</Button>
      </form>

      <nav className="flex gap-1 border-b">
        {ABAS.map((a) => (
          <Link
            key={a.key}
            href={a.key === "planejamento" ? `/cronograma?obra=${obraId}` : `/cronograma?obra=${obraId}&aba=${a.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              a.key === aba.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.label}
          </Link>
        ))}
      </nav>

      {aba.key === "avanco" ? (
        <SecaoAvanco obraId={obraId} role={user.role} cronograma={cronograma} />
      ) : (
        <SecaoPlanejamento obraId={obraId} podeEditar={user.role !== "CAMPO"} cronograma={cronograma} />
      )}
    </div>
  );
}

function SecaoPlanejamento({
  obraId,
  podeEditar,
  cronograma,
}: {
  obraId: string;
  podeEditar: boolean;
  cronograma: Cronograma;
}) {
  const semDatas = cronograma.etapas.filter((e) => !e.inicioPrevisto || !e.fimPrevisto).length;

  if (cronograma.etapas.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta obra não tem etapas cadastradas.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="grid gap-1">
            <CardTitle>Gantt</CardTitle>
            {semDatas > 0 && cronograma.escala && (
              <CardDescription>
                {semDatas} etapa{semDatas > 1 ? "s" : ""} sem datas previstas.
              </CardDescription>
            )}
          </div>
          {podeEditar && (
            <EditarDatasDialog
              obraId={obraId}
              etapas={cronograma.etapas.map((e) => ({
                id: e.id,
                nome: e.nome,
                inicioPrevisto: e.inicioPrevisto,
                fimPrevisto: e.fimPrevisto,
              }))}
            />
          )}
        </CardHeader>
        <CardContent>
          <Gantt cronograma={cronograma} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curva S — previsto × realizado</CardTitle>
          <CardDescription>
            Avanço físico acumulado por mês, com as etapas ponderadas pelo orçamento.
            {semDatas > 0 && cronograma.curva.length > 0 && " O previsto não chega a 100% enquanto houver etapas sem datas."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cronograma.curva.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Defina as datas previstas das etapas para ver a curva S.
            </p>
          ) : (
            <CurvaSChart data={paraGrafico(cronograma.curva)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
