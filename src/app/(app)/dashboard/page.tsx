import type { Metadata } from "next";
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
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { GastoMensalChart, OrcadoRealizadoChart } from "./dashboard-charts";
import { AvancoLotes } from "./avanco-lotes";
import { CurvaSWidget } from "./widgets/curva-s";
import { AlertasLista } from "./alertas-lista";
import { TopInsumos } from "./top-insumos";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";
import { veFinanceiro } from "@/services/acesso";
import { ChartGantt, ChartNoAxesColumn, ListOrdered, PiggyBank, ReceiptText, Scale } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

const MAX_ALERTAS = 8;
const LINK_CARD =
  "inline-flex min-h-10 items-center text-sm text-primary underline-offset-4 hover:underline";

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

  const acaoNota = veFinanceiro(user.role) && (
    <AcaoVazio href="/notas/nova" icone={ReceiptText} variante="outline">
      Lançar nota
    </AcaoVazio>
  );

  const parcelasAVencer = aVencer7._count;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl md:text-3xl">Dashboard</h1>

      {/* 1. O que exige ação hoje: dinheiro a vencer e notas divergentes em destaque, alertas logo abaixo */}
      <section aria-labelledby="pede-acao" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="pede-acao" className="text-xl">
            Pede ação hoje
          </h2>
          {alertas.length > MAX_ALERTAS && (
            <Link href="/dashboard/alertas" className={LINK_CARD}>
              Ver todos os alertas ({alertas.length})
            </Link>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Pendencia
            grande
            titulo="A vencer em 7 dias"
            pendente={parcelasAVencer > 0}
            valor={formatarMoeda(aVencer7._sum.valorCents ?? 0)}
            detalhe={
              parcelasAVencer > 0
                ? `${parcelasAVencer} ${parcelasAVencer === 1 ? "parcela" : "parcelas"} em aberto`
                : "Nenhuma parcela vence nesta semana."
            }
            acao="Ver parcelas"
            href="/contas?visao=7dias"
          />
          <Pendencia
            titulo="Notas com divergência"
            pendente={divergencias > 0}
            valor={String(divergencias)}
            detalhe={
              divergencias > 0
                ? "A soma dos itens não bate com o total da nota."
                : "Itens e total conferem em todas as notas."
            }
            acao="Conferir notas"
            href="/notas?divergentes=1"
          />
        </div>

        <AlertasLista alertas={alertas.slice(0, MAX_ALERTAS)} />
      </section>

      {/* 2. Indicadores secundários: peso menor que o bloco de ação, e o 4º indicador quase some */}
      <section aria-labelledby="panorama" className="space-y-4">
        <h2 id="panorama" className="text-xl">
          Como estão as obras
        </h2>
        <div className="grid items-start gap-x-8 gap-y-5 sm:grid-cols-[3fr_2fr]">
          <Cota
            titulo="Gasto no mês"
            valor={formatarMoeda(gastoNoMes)}
            rodape="Itens rateados às obras."
          />
          <Cota discreta titulo="Obras ativas" valor={String(obrasAtivas)} href="/obras" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle nivel={3}>Avanço físico por obra</CardTitle>
            </CardHeader>
            <CardContent>
              {avancoData.length === 0 ? (
                <Vazio
                  icone={ChartGantt}
                  titulo="Sem avanço registrado"
                  texto="Marque quanto de cada etapa já foi feito."
                  acao={
                    <AcaoVazio href="/cronograma?aba=avanco" icone={ChartGantt} variante="outline">
                      Registrar avanço
                    </AcaoVazio>
                  }
                />
              ) : (
                <AvancoLotes data={avancoData} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle nivel={3}>Top 5 insumos (curva ABC)</CardTitle>
              <CardAction>
                <Link href="/orcamento/abc" className={LINK_CARD}>
                  Ver curva ABC
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {abc.insumos.length === 0 ? (
                <Vazio
                  icone={ListOrdered}
                  titulo="Sem insumos ainda"
                  texto="Os maiores insumos aparecem a partir das notas com itens."
                  acao={acaoNota}
                />
              ) : (
                <TopInsumos insumos={abc.insumos.slice(0, 5)} />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 3. Gráficos por último: servem para comparar, não para decidir o dia */}
      <section aria-labelledby="graficos" className="space-y-4">
        <h2 id="graficos" className="text-xl">
          Gráficos
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle nivel={3}>Gasto mensal por obra</CardTitle>
            </CardHeader>
            <CardContent>
              {gastoMensalData.length === 0 ? (
                <Vazio
                  icone={ChartNoAxesColumn}
                  titulo="Sem compras em 12 meses"
                  texto="O gráfico mostra quanto cada obra gastou por mês."
                  acao={acaoNota}
                />
              ) : (
                <GastoMensalChart data={gastoMensalData} obras={obrasComGasto} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle nivel={3}>Orçado vs. realizado</CardTitle>
            </CardHeader>
            <CardContent>
              {orcadoRealizadoData.length === 0 ? (
                <Vazio
                  icone={Scale}
                  titulo="Sem orçamento definido"
                  texto="Defina o orçado de uma obra para comparar com o gasto."
                  acao={
                    veFinanceiro(user.role) && (
                      <AcaoVazio href="/orcamento" icone={PiggyBank} variante="outline">
                        Definir orçamento
                      </AcaoVazio>
                    )
                  }
                />
              ) : (
                <OrcadoRealizadoChart data={orcadoRealizadoData} />
              )}
            </CardContent>
          </Card>

          <CurvaSWidget />
        </div>
      </section>
    </div>
  );
}

// Pendência: número que alguém precisa resolver. A faixa e o selo de estado só aparecem
// quando há o que fazer; em dia, o cartão recua e some o botão.
function Pendencia({
  titulo,
  valor,
  detalhe,
  acao,
  href,
  pendente,
  grande = false,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  acao: string;
  href: string;
  pendente: boolean;
  grande?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border-l-4 bg-card p-4 ring-1 ring-border",
        pendente ? "border-l-estado-atencao-borda" : "border-l-estado-no-prazo-borda",
        grande && "sm:p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base">{titulo}</h3>
        {pendente ? (
          <StatusBadge estado="atencao">Atenção</StatusBadge>
        ) : (
          <StatusBadge estado="no-prazo">Em dia</StatusBadge>
        )}
      </div>
      <p className={cn("num", grande ? "text-4xl sm:text-5xl" : "text-3xl", !pendente && "text-muted-foreground")}>
        {valor}
      </p>
      <p className="text-pretty text-sm text-muted-foreground">{detalhe}</p>
      {pendente && (
        <Link
          href={href}
          className={cn(
            buttonVariants({ variant: grande ? "default" : "outline", size: "lg" }),
            "mt-2 self-start",
          )}
        >
          {acao}
        </Link>
      )}
    </div>
  );
}

// linha de cota: ├──── título ────┤ com o valor embaixo. `discreta` é o indicador de menor peso.
function Cota({
  titulo,
  valor,
  rodape,
  href,
  discreta = false,
}: {
  titulo: string;
  valor: string;
  rodape?: string;
  href?: string;
  discreta?: boolean;
}) {
  const conteudo = (
    <div className="relative border-t border-foreground/60 pt-2">
      <span aria-hidden className="absolute -top-1.5 left-0 h-3 w-px bg-foreground/60" />
      <span aria-hidden className="absolute -top-1.5 right-0 h-3 w-px bg-foreground/60" />
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className={cn("mt-0.5 num", discreta ? "text-xl" : "text-3xl")}>{valor}</p>
      {rodape && <p className="mt-0.5 text-sm text-muted-foreground">{rodape}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block min-h-11 rounded-sm hover:bg-accent/60">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

function Vazio(props: {
  icone: React.ComponentProps<typeof EstadoVazio>["icone"];
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  const { texto, ...resto } = props;
  return (
    <EstadoVazio compacto nivel={3} {...resto}>
      {texto}
    </EstadoVazio>
  );
}
