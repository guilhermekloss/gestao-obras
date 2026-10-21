import { prisma } from "@/lib/prisma";
import { formatarPercentBp } from "@/lib/format";
import { avancoPonderado, orcamentoTotal } from "@/services/obra";
import { medicoesTodas } from "@/services/custos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  agregarCurvasS,
  curvaS,
  faixaDaCurvaS,
  previstoNaData,
  realizadoNaData,
  unirFaixas,
  type PontoCurvaS,
} from "@/services/cronograma";
import { hojeDia, paraGrafico, paraPlano } from "@/app/(app)/cronograma/dados";
import { CurvaSChart } from "@/app/(app)/cronograma/curva-s-chart";

const TITULO = "Curva S — obras em andamento";

function carregar() {
  return Promise.all([
    prisma.obra.findMany({
      where: { status: "ANDAMENTO", etapas: { some: { inicioPrevisto: { not: null }, fimPrevisto: { not: null } } } },
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        etapas: { select: { id: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true } },
      },
    }),
    medicoesTodas(),
  ]);
}

// No lugar do widget enquanto ele carrega (vai num <Suspense> próprio: o resto do dashboard não espera por ele)
export function CurvaSWidgetCarregando() {
  return (
    <Card>
      <CardHeader>
        <CardTitle nivel={3}>{TITULO}</CardTitle>
        <Skeleton className="h-5 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  );
}

// cada obra pesa pelo seu orçamento (mesma regra de `avancoPonderado`)
export async function CurvaSWidget() {
  let dados: Awaited<ReturnType<typeof carregar>>;
  try {
    dados = await carregar();
  } catch (erro) {
    // banco lento (statement_timeout) ou fora: o widget sai, o dashboard fica
    console.error("Curva S do dashboard indisponível", erro);
    return (
      <Card>
        <CardHeader>
          <CardTitle nivel={3}>{TITULO}</CardTitle>
          <CardDescription>Não foi possível carregar a curva agora. Recarregue a página em instantes.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const [obras, medicoes] = dados;

  // agrupadas por etapa, na ordem das etapas; dentro do grupo segue data, id
  const porEtapa = new Map<string, typeof medicoes>();
  for (const m of medicoes) {
    const lista = porEtapa.get(m.etapaId);
    if (lista) lista.push(m);
    else porEtapa.set(m.etapaId, [m]);
  }
  const hoje = hojeDia();
  const planos = obras.map((o) => {
    const { plano, pontos } = paraPlano(
      o.etapas,
      o.etapas.flatMap((e) => porEtapa.get(e.id) ?? []),
    );
    return { plano, pontos, faixa: faixaDaCurvaS(plano, pontos, hoje) };
  });
  const comCurva = planos.filter((p) => p.faixa !== null);
  const faixa = unirFaixas(comCurva.map((p) => p.faixa));
  if (!faixa) return null;

  // previsto e realizado na mesma data (hoje) — o ponto do mês corrente compara fim do mês × hoje
  const pesos = comCurva.map((p) => orcamentoTotal(p.plano));
  const previstoHoje = avancoPonderado(
    comCurva.map((p, i) => ({ orcamentoCents: pesos[i], percentBp: previstoNaData(p.plano, hoje) })),
  );
  const realizadoHoje = avancoPonderado(
    comCurva.map((p, i) => ({ orcamentoCents: pesos[i], percentBp: realizadoNaData(p.plano, p.pontos, hoje) })),
  );

  const curva: PontoCurvaS[] = agregarCurvasS(
    comCurva.map((p, i) => ({
      orcamentoCents: pesos[i],
      curva: curvaS(p.plano, p.pontos, hoje, faixa),
    })),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle nivel={3}>{TITULO}</CardTitle>
        <CardDescription>
          {comCurva.length} obra{comCurva.length > 1 ? "s" : ""} com cronograma
          {" · "}hoje: previsto {formatarPercentBp(previstoHoje)} × realizado{" "}
          {formatarPercentBp(realizadoHoje)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CurvaSChart data={paraGrafico(curva)} />
      </CardContent>
    </Card>
  );
}
