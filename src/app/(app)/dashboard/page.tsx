import Link from "next/link";
import { redirect } from "next/navigation";
import { startOfMonth, subMonths } from "date-fns";
import { usuarioAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { avancoPorEtapa, realizadoPorObra, realizadoPorMes } from "@/services/custos";
import { proximosDias } from "@/services/financeiro";
import { carregarAlertas, carregarCurvaAbc } from "@/services/analises";
import { avancoDaObra, orcamentoTotal } from "@/services/obra";
import { chaveMes, formatarMoeda, rotuloChaveMes } from "@/lib/format";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GastoMensalChart,
  OrcadoRealizadoChart,
  AvancoChart,
} from "./dashboard-charts";
import { CurvaSWidget } from "./widgets/curva-s";
import { AlertasLista } from "./alertas-lista";
import { TopInsumos } from "./top-insumos";

const MAX_ALERTAS = 8;
const LINK_CARD = "text-sm text-muted-foreground hover:text-foreground hover:underline";

export default async function DashboardPage() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  if (user.role === "CAMPO") redirect("/diario");

  const hoje = new Date();
  const inicioMes = startOfMonth(hoje);
  const inicio12Meses = startOfMonth(subMonths(hoje, 11));
  const janelaAVencer = proximosDias(hoje);

  const [
    aVencer7,
    obras,
    porMes,
    realizado,
    avancos,
    alertas,
    abc,
  ] = await Promise.all([
    prisma.parcela.aggregate({
      where: {
        status: "ABERTA",
        vencimento: { gte: janelaAVencer.de, lte: janelaAVencer.ate },
      },
      _sum: { valorCents: true },
      _count: true,
    }),
    prisma.obra.findMany({
      orderBy: { codigo: "asc" },
      include: { etapas: { select: { id: true, orcamentoCents: true } } },
    }),
    realizadoPorMes(inicio12Meses),
    realizadoPorObra(),
    avancoPorEtapa(),
    carregarAlertas(hoje),
    carregarCurvaAbc(),
  ]);

  // mesma base dos gráficos (itens × rateio), não NotaFiscal.totalCents: bate com "Gasto mensal
  // por obra"; a diferença entre itens e total aparece no KPI de divergências
  const gastoNoMes = [...(porMes.get(chaveMes(inicioMes))?.values() ?? [])].reduce(
    (a, v) => a + v,
    0,
  );

  const divergencias = alertas.filter((a) => a.tipo === "NOTA_DIVERGENTE").length;

  const nomeObra = new Map(obras.map((o) => [o.id, o.nome]));
  const mesesOrdenados = [...porMes.keys()].sort();
  const obrasComGasto = obras.filter((o) => realizado.has(o.id)).map((o) => o.nome);
  const gastoMensalData = mesesOrdenados.map((chave) => {
    const porObra = porMes.get(chave) ?? new Map<string, number>();
    const linha: Record<string, string | number> = { mes: rotuloChaveMes(chave) };
    for (const [obraId, cents] of porObra) {
      const nome = nomeObra.get(obraId);
      if (nome) linha[nome] = cents;
    }
    return linha;
  });

  const orcadoRealizadoData = obras
    .map((o) => ({
      obra: o.nome,
      Orçado: orcamentoTotal(o.etapas),
      Realizado: realizado.get(o.id) ?? 0,
    }))
    .filter((d) => d.Orçado > 0 || d.Realizado > 0);

  const avancoData = obras
    .filter((o) => o.status === "ANDAMENTO" && o.etapas.length > 0)
    .map((o) => ({
      obra: o.nome,
      avanco: avancoDaObra(o.etapas, avancos) / 100,
    }));

  const obrasAtivas = obras.filter((o) => o.status === "ANDAMENTO").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardStat
          titulo="Gasto no mês"
          valor={formatarMoeda(gastoNoMes)}
          rodape="itens rateados às obras"
        />
        <CardStat
          titulo="A vencer em 7 dias"
          valor={formatarMoeda(aVencer7._sum.valorCents ?? 0)}
          rodape={`${aVencer7._count} parcela(s)`}
          href="/contas?visao=7dias"
        />
        <CardStat titulo="Obras ativas" valor={String(obrasAtivas)} href="/obras" />
        <CardStat
          titulo="Divergências itens × nota"
          valor={String(divergencias)}
          alerta={divergencias > 0}
          href="/notas"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
            {alertas.length > MAX_ALERTAS && (
              <CardAction>
                <Link href="/dashboard/alertas" className={LINK_CARD}>
                  Ver todos ({alertas.length})
                </Link>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <AlertasLista alertas={alertas.slice(0, MAX_ALERTAS)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 insumos (curva ABC)</CardTitle>
            <CardAction>
              <Link href="/orcamento/abc" className={LINK_CARD}>
                Ver curva ABC
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {abc.insumos.length === 0 ? (
              <Vazio texto="Lance notas com itens para ver os maiores insumos." />
            ) : (
              <TopInsumos insumos={abc.insumos.slice(0, 5)} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Gasto mensal por obra</CardTitle>
          </CardHeader>
          <CardContent>
            {gastoMensalData.length === 0 ? (
              <Vazio texto="Sem compras registradas nos últimos 12 meses." />
            ) : (
              <GastoMensalChart data={gastoMensalData} obras={obrasComGasto} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orçado vs. realizado</CardTitle>
          </CardHeader>
          <CardContent>
            {orcadoRealizadoData.length === 0 ? (
              <Vazio texto="Defina orçamentos em Orçamento para ver a comparação." />
            ) : (
              <OrcadoRealizadoChart data={orcadoRealizadoData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avanço físico</CardTitle>
          </CardHeader>
          <CardContent>
            {avancoData.length === 0 ? (
              <Vazio texto="Lance o avanço das etapas em Cronograma → Avanço." />
            ) : (
              <AvancoChart data={avancoData} />
            )}
          </CardContent>
        </Card>

        <CurvaSWidget />
      </div>
    </div>
  );
}

function CardStat({
  titulo,
  valor,
  rodape,
  href,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  rodape?: string;
  href?: string;
  alerta?: boolean;
}) {
  const conteudo = (
    <Card className={href ? "transition-colors hover:bg-accent/50" : undefined}>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-destructive" : ""}`}>
          {valor}
        </p>
        {rodape && <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{conteudo}</Link> : conteudo;
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{texto}</p>;
}
