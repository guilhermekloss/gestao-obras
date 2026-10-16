import { prisma } from "@/lib/prisma";
import { formatarPercentBp } from "@/lib/format";
import { avancoPonderado, orcamentoTotal } from "@/services/obra";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

// cada obra pesa pelo seu orçamento (mesma regra de `avancoPonderado`)
export async function CurvaSWidget() {
  const obras = await prisma.obra.findMany({
    where: { status: "ANDAMENTO", etapas: { some: { inicioPrevisto: { not: null }, fimPrevisto: { not: null } } } },
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      etapas: {
        select: {
          id: true,
          orcamentoCents: true,
          inicioPrevisto: true,
          fimPrevisto: true,
          medicoes: {
            orderBy: [{ data: "asc" }, { id: "asc" }],
            select: { etapaId: true, data: true, percentBp: true },
          },
        },
      },
    },
  });

  const hoje = hojeDia();
  const planos = obras.map((o) => {
    const { plano, pontos } = paraPlano(
      o.etapas,
      o.etapas.flatMap((e) => e.medicoes),
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
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Curva S — obras em andamento</CardTitle>
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
