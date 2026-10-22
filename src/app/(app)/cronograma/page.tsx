import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirPapel, obraAutorizada } from "@/lib/auth";
import { podeEditarCadastros, veFinanceiro } from "@/services/acesso";
import { formatarData, formatarDataCurta, formatarIdp, formatarPercentBp } from "@/lib/format";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Download } from "lucide-react";
import { AbasDaPagina } from "@/components/abas-da-pagina";
import { listarObrasParaFiltro } from "@/services/obras";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { carregarCronograma, paraGrafico, type Cronograma } from "./dados";
import { Gantt } from "./gantt";
import { CurvaSChart } from "./curva-s-chart";
import { EditarDatasDialog } from "./datas-dialog";
import { SecaoAvanco } from "./avanco";
import { SalvarLinhaBaseDialog } from "./linha-base-dialog";

export const metadata: Metadata = { title: "Cronograma" };

// Impressão em paisagem, só o conteúdo (sem menu, cabeçalho, avisos e botão do assistente).
// String crua (dangerouslySetInnerHTML) para o React não escapar o CSS; o tema escuro não vale no papel.
const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 landscape; margin: 10mm 12mm; }
  html, body { background: #fff !important; }
  body nav, body header, [data-sonner-toaster], [data-assistente="botao"] { display: none !important; }
  main { padding: 0 !important; }
}
`;

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

  const obra = await obraAutorizada(user, obraId);
  if (!obra) notFound();
  const cronograma = await carregarCronograma(obra, { comPesos: veFinanceiro(user.role) });
  const atrasadas = cronograma.etapas.filter((e) => e.situacao === "ATRASADA").length;
  const emAtencao = cronograma.etapas.filter((e) => e.situacao === "ATENCAO").length;

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESSAO }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl">Cronograma</h1>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            id="exportar-cronograma"
            variant="outline"
            size="sm"
            render={<a href={`/cronograma/exportar?obra=${encodeURIComponent(obraId)}`} download />}
          >
            <Download className="size-4" /> Exportar CSV
          </Button>
          <BotaoImprimir />
        </div>
      </div>
      <p className="hidden text-sm print:block">
        {obra.nome} · emitido em {formatarData(new Date())}
      </p>
      <p id="indicadores-cronograma" className="text-sm text-muted-foreground">
        Previsto até hoje:{" "}
        <strong className="text-foreground num">{formatarPercentBp(cronograma.previstoHojeBp)}</strong>
        {" · "}Realizado:{" "}
        <strong className="text-foreground num">{formatarPercentBp(cronograma.realizadoHojeBp)}</strong>
        {" · "}
        <abbr title="Índice de desempenho de prazo: realizado ÷ previsto. Abaixo de 1,00, a obra anda mais devagar que o planejado.">
          IDP
        </abbr>
        :{" "}
        <strong className="text-foreground num">{formatarIdp(cronograma.idp)}</strong>
        {atrasadas > 0 && (
          <>
            {" · "}
            <strong className="text-destructive">
              {atrasadas} etapa{atrasadas > 1 ? "s" : ""} atrasada{atrasadas > 1 ? "s" : ""}
            </strong>
          </>
        )}
        {emAtencao > 0 && (
          <>
            {" · "}
            <strong className="text-estado-atencao-fg">{emAtencao} em atenção</strong>
          </>
        )}
      </p>

      <form method="get" className="flex items-end gap-2 print:hidden">
        {aba.key !== "planejamento" && <input type="hidden" name="aba" value={aba.key} />}
        <div className="grid gap-1">
          <label htmlFor="filtro-obra" className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            id="filtro-obra"
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

      <div className="print:hidden">
        <AbasDaPagina
          rotulo="Seções do cronograma"
          ativa={aba.key}
          abas={ABAS.map((a) => ({
            key: a.key,
            label: a.label,
            href: a.key === "planejamento" ? `/cronograma?obra=${obraId}` : `/cronograma?obra=${obraId}&aba=${a.key}`,
          }))}
        />
      </div>

      {aba.key === "avanco" ? (
        <SecaoAvanco obra={obra} role={user.role} cronograma={cronograma} />
      ) : (
        <SecaoPlanejamento obraId={obraId} podeEditar={podeEditarCadastros(user.role)} cronograma={cronograma} />
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="grid gap-1">
            <CardTitle id="gantt-cronograma">Gantt</CardTitle>
            {semDatas > 0 && cronograma.escala && (
              <CardDescription>
                {semDatas} etapa{semDatas > 1 ? "s" : ""} sem datas previstas.
              </CardDescription>
            )}
            {cronograma.linhaBase && (
              <CardDescription>
                Linha de base: {cronograma.linhaBase.nome} ({formatarData(cronograma.linhaBase.criadaEm)}).
              </CardDescription>
            )}
          </div>
          {podeEditar && (
            <div className="flex flex-wrap justify-end gap-2 print:hidden">
              <EditarDatasDialog
                obraId={obraId}
                etapas={cronograma.etapas.map((e) => ({
                  id: e.id,
                  nome: e.nome,
                  inicioPrevisto: e.inicioPrevisto,
                  fimPrevisto: e.fimPrevisto,
                }))}
              />
              <SalvarLinhaBaseDialog
                obraId={obraId}
                atual={
                  cronograma.linhaBase
                    ? { nome: cronograma.linhaBase.nome, criadaEm: formatarData(cronograma.linhaBase.criadaEm) }
                    : null
                }
              />
            </div>
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
            {cronograma.linhaBase
              ? ` Previsto pela linha de base de ${formatarDataCurta(cronograma.linhaBase.criadaEm)}.`
              : semDatas > 0 &&
                cronograma.curva.length > 0 &&
                " O previsto não chega a 100% enquanto houver etapas sem datas."}
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
