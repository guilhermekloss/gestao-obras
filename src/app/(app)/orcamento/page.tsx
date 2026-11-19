import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, ChartColumn } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { exigirAcessoObra, exigirPapel } from "@/lib/auth";
import { avancoPorEtapa, realizadoPorEtapa, realizadoPorMesDaObra } from "@/services/custos";
import { listarObrasParaFiltro } from "@/services/obras";
import { carregarCreditoIbsCbs } from "@/services/tributacao/custo-liquido-db";
import { aplicarCredito, avisosDoCredito, haCredito, modoDoCusto } from "@/services/tributacao/custo-liquido";
import { AvisosCreditoIbsCbs, ResumoCreditoIbsCbs } from "@/components/credito-ibs-cbs";
import { consumoBp, faixaConsumo } from "@/services/analises";
import { diaDoBanco } from "@/services/cronograma";
import {
  desembolsoMensal,
  desempenhoCusto,
  etapasDoDesembolso,
  totalDesempenho,
  type Desembolso,
} from "@/services/desempenho-custo";
import { dataParaInput, formatarData, formatarMoeda, rotuloChaveMes } from "@/lib/format";
import { carregarLinhaBaseOficial } from "@/services/linha-base-db";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { LabelAjuda } from "@/components/campo-ajuda";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrcamentoForm, type LinhaOrcamento, type TotalOrcamento } from "./orcamento-form";
import { DesembolsoChart } from "./desembolso-chart";
import { ESTILO_FAIXA } from "./faixa";
import { cn } from "@/lib/utils";
import type { ModoCusto } from "@/services/tributacao/custo-liquido";

export const metadata: Metadata = { title: "Orçamento" };

function comFaixa(previstoCents: number, realizadoCents: number, fisicoBp: number) {
  return {
    previstoCents,
    realizadoCents,
    consumoBp: consumoBp(previstoCents, realizadoCents),
    faixa: faixaConsumo(previstoCents, realizadoCents),
    desempenho: desempenhoCusto({ orcamentoCents: previstoCents, realizadoCents, fisicoBp }),
  };
}

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; custo?: string }>;
}) {
  const usuario = await exigirPapel("ADMIN", "ESCRITORIO");
  const { obra: obraParam, custo: custoParam } = await searchParams;

  const obras = await listarObrasParaFiltro(usuario.obrasPermitidas);
  // obra fora da lista (inexistente ou sem acesso) cai na primeira, como no cronograma
  const obraId = obras.some((o) => o.id === obraParam) ? obraParam! : obras[0]?.id;

  let linhas: LinhaOrcamento[] = [];
  let total: TotalOrcamento = { ...comFaixa(0, 0, 0), desempenho: totalDesempenho([]) };
  let desembolso: Desembolso = { pontos: [], semDatasCents: 0 };
  let origemPrevisto: OrigemPrevisto = null;
  let credito: Awaited<ReturnType<typeof carregarCreditoIbsCbs>> | null = null;
  let modo: ModoCusto = "BRUTO";
  let resumoCredito = { brutoCents: 0, creditoCents: 0, liquidoCents: 0 };
  if (obraId) {
    exigirAcessoObra(usuario, obraId);
    const [etapas, realizadoBruto, avancos, porMes, linhaBase, creditoObra] = await Promise.all([
      prisma.etapa.findMany({
        where: { obraId },
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true },
      }),
      realizadoPorEtapa(obraId),
      // físico até hoje: medição datada no futuro não entra no valor agregado nem na tendência
      avancoPorEtapa(obraId, { ate: dataParaInput(new Date()) }),
      realizadoPorMesDaObra(obraId),
      // acesso à obra já conferido acima
      carregarLinhaBaseOficial(obraId),
      carregarCreditoIbsCbs(obraId),
    ]);
    credito = creditoObra;
    modo = modoDoCusto(credito.regime, credito.total.creditoCents, custoParam);
    // no modo líquido o realizado de cada etapa já sai sem o crédito: faixa, saldo e desempenho seguem o mesmo número
    const realizadoDe = (etapaId: string | null) => {
      const bruto = realizadoBruto.get(etapaId) ?? 0;
      const c = aplicarCredito(bruto, credito?.porEtapa.get(etapaId)?.creditoCents ?? 0);
      return {
        realizado: modo === "LIQUIDO" ? c.liquidoCents : bruto,
        ...(c.creditoCents > 0 ? { brutoCents: bruto, creditoCents: c.creditoCents } : {}),
      };
    };
    linhas = etapas.map((e) => {
      const { realizado, ...extra } = realizadoDe(e.id);
      return {
        etapaId: e.id,
        nome: e.nome,
        ...comFaixa(e.orcamentoCents, realizado, avancos.get(e.id) ?? 0),
        ...extra,
      };
    });
    // pelo bruto: um rateio sem etapa inteiro coberto pelo crédito ainda aparece
    if ((realizadoBruto.get(null) ?? 0) > 0) {
      const { realizado, ...extra } = realizadoDe(null);
      linhas.push({
        etapaId: null,
        nome: "Sem etapa definida",
        ...comFaixa(0, realizado, 0),
        ...extra,
      });
    }
    // o realizado sem etapa também consome o orçamento da obra
    const soma = (f: (l: LinhaOrcamento) => number) => linhas.reduce((a, l) => a + f(l), 0);
    const totalDes = totalDesempenho(linhas.map((l) => l.desempenho));
    const brutoDe = (l: LinhaOrcamento) => l.brutoCents ?? l.realizadoCents;
    resumoCredito = {
      brutoCents: soma(brutoDe),
      creditoCents: soma((l) => l.creditoCents ?? 0),
      liquidoCents: soma((l) => aplicarCredito(brutoDe(l), l.creditoCents ?? 0).liquidoCents),
    };
    total = {
      ...comFaixa(soma((l) => l.previstoCents), soma((l) => l.realizadoCents), totalDes.fisicoBp),
      desempenho: totalDes,
      ...(resumoCredito.creditoCents > 0 ? { brutoCents: resumoCredito.brutoCents, creditoCents: resumoCredito.creditoCents } : {}),
    };
    const entrada = etapasDoDesembolso(
      etapas.map((e) => ({
        orcamentoCents: e.orcamentoCents,
        inicio: e.inicioPrevisto ? diaDoBanco(e.inicioPrevisto) : null,
        fim: e.fimPrevisto ? diaDoBanco(e.fimPrevisto) : null,
      })),
      linhaBase,
    );
    desembolso = desembolsoMensal(entrada.etapas, porMes, dataParaInput(new Date()));
    if (linhaBase) origemPrevisto = { nome: linhaBase.nome, criadaEm: linhaBase.criadaEm };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl">Orçamento vs. realizado</h1>
        <Button variant="outline" render={<Link href="/orcamento/abc" />}>
          <ChartColumn className="size-4" /> Curva ABC de insumos
        </Button>
      </div>

      <form method="get" className="flex items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="filtro-obra" className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            id="filtro-obra"
            name="obra"
            defaultValue={obraId ?? ""}
            placeholder="Buscar obra..."
            className="w-56"
            autoSubmit
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">Ver</Button>
      </form>

      {!obraId ? (
        <p className="text-muted-foreground">Cadastre uma obra primeiro.</p>
      ) : linhas.length === 0 ? (
        <p className="text-muted-foreground">Esta obra não tem etapas cadastradas.</p>
      ) : (
        <>
          {credito && (
            <CreditoDaObra
              obraId={obraId}
              credito={credito}
              resumo={resumoCredito}
              modo={modo}
              ehAdmin={usuario.role === "ADMIN"}
            />
          )}
          <Legenda />
          <OrcamentoForm obraId={obraId} linhas={linhas} total={total} modo={modo} />
          <SecaoDesembolso obraId={obraId} desembolso={desembolso} origem={origemPrevisto} />
        </>
      )}
    </div>
  );
}

function CreditoDaObra({
  obraId,
  credito,
  resumo,
  modo,
  ehAdmin,
}: {
  obraId: string;
  credito: Awaited<ReturnType<typeof carregarCreditoIbsCbs>>;
  resumo: { brutoCents: number; creditoCents: number; liquidoCents: number };
  modo: ModoCusto;
  ehAdmin: boolean;
}) {
  const avisos = avisosDoCredito(credito.regime, credito.total);
  const comCredito = haCredito(credito.regime, resumo.creditoCents);
  return (
    <div className="space-y-2">
      {comCredito && (
        <ResumoCreditoIbsCbs
          {...resumo}
          modo={modo}
          hrefAlternar={`/orcamento?obra=${obraId}&custo=${modo === "LIQUIDO" ? "bruto" : "liquido"}`}
        />
      )}
      <AvisosCreditoIbsCbs avisos={avisos} podeInformarRegime={ehAdmin} />
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["OK", "ATENCAO", "ESTOURO"] as const).map((f) => (
        <span key={f} className="flex items-center gap-1.5">
          <span className={cn("inline-block size-2.5 rounded-full", ESTILO_FAIXA[f].barra)} />
          {ESTILO_FAIXA[f].rotulo}
        </span>
      ))}
      <LabelAjuda
        id="ajuda-desempenho"
        className="text-xs font-normal text-muted-foreground"
        titulo="Desempenho de custo"
        ajuda={
          <ul className="space-y-1">
            <li><strong>Avanço físico</strong>: o último avanço registrado da etapa.</li>
            <li><strong>Valor agregado</strong> = orçado × avanço físico. É o quanto do orçado o que já foi feito vale.</li>
            <li><strong>IDC</strong> = valor agregado ÷ realizado. Acima de 1,00 a etapa gasta menos que o previsto; abaixo, mais.</li>
            <li><strong>Tendência</strong> = realizado ÷ avanço físico: quanto a etapa deve custar no fim, no ritmo atual. Sem avanço ou sem nada gasto na etapa, vale o maior entre orçado e realizado.</li>
            <li><strong>Variação</strong> = orçado − tendência. Negativa: vai faltar dinheiro.</li>
          </ul>
        }
      >
        Como ler o desempenho de custo
      </LabelAjuda>
    </div>
  );
}

type OrigemPrevisto = { nome: string; criadaEm: Date } | null;

function SecaoDesembolso({
  obraId,
  desembolso,
  origem,
}: {
  obraId: string;
  desembolso: Desembolso;
  origem: OrigemPrevisto;
}) {
  const { pontos, semDatasCents } = desembolso;
  return (
    <Card id="secao-desembolso">
      <CardHeader>
        <CardTitle>Desembolso previsto × realizado</CardTitle>
        <CardDescription>
          {origem
            ? `Previsto: a linha de base "${origem.nome}" (${formatarData(origem.criadaEm)}), com o orçado e as datas de cada etapa naquela foto, distribuídos por igual entre o início e o fim.`
            : "Previsto: o orçado de cada etapa distribuído por igual entre o início e o fim previstos."}{" "}
          Realizado: as compras rateadas para a obra, no mês da compra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {semDatasCents > 0 && (
          <p className="text-sm text-muted-foreground">
            {formatarMoeda(semDatasCents)} do orçado {origem ? "da linha de base " : ""}estão em etapas sem datas e
            ficam fora do previsto.{" "}
            <Link href={`/cronograma?obra=${obraId}`} className="text-primary underline-offset-4 hover:underline">
              Definir as datas no cronograma
            </Link>
          </p>
        )}
        {pontos.length === 0 ? (
          <EstadoVazio
            compacto
            nivel={3}
            icone={CalendarRange}
            titulo="Sem datas nem compras"
            acao={
              <AcaoVazio href={`/cronograma?obra=${obraId}`} icone={CalendarRange} variante="outline">
                Definir as datas das etapas
              </AcaoVazio>
            }
          >
            O previsto mensal sai das datas das etapas e o realizado, das compras da obra.
          </EstadoVazio>
        ) : (
          <DesembolsoChart
            data={pontos.map((p) => ({
              mes: rotuloChaveMes(p.mes),
              previsto: p.previstoCents,
              realizado: p.realizadoCents,
              previstoAcum: p.previstoAcumCents,
              realizadoAcum: p.realizadoAcumCents,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
