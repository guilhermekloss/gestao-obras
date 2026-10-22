import { prisma } from "@/lib/prisma";
import { formatarPercentBp } from "@/lib/format";
import { avancoPonderado, orcamentoTotal } from "@/services/obra";
import { medicoesTodas } from "@/services/custos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";
import { CalendarRange } from "lucide-react";
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
import { carregarLinhasBaseOficiais } from "@/services/linha-base-db";
import { planoDaLinhaBase } from "@/services/linha-base";
import { CurvaSChart } from "@/app/(app)/cronograma/curva-s-chart";

const TITULO = "Curva S — obras em andamento";
const TITULO_OBRA = "Curva S da obra";

// Com obra filtrada, vale qualquer situação da obra (o acesso já foi conferido na página).
// As linhas de base vêm numa consulta só, depois das obras (precisa dos ids).
async function carregar(obraId?: string) {
  const [obras, medicoes] = await Promise.all([
    prisma.obra.findMany({
      where: {
        ...(obraId ? { id: obraId } : { status: "ANDAMENTO" }),
        etapas: { some: { inicioPrevisto: { not: null }, fimPrevisto: { not: null } } },
      },
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        etapas: { select: { id: true, orcamentoCents: true, inicioPrevisto: true, fimPrevisto: true } },
      },
    }),
    medicoesTodas(),
  ]);
  const linhasBase = await carregarLinhasBaseOficiais(obras.map((o) => o.id));
  return [obras, medicoes, linhasBase] as const;
}

// No lugar do widget enquanto ele carrega (vai num <Suspense> próprio: o resto do dashboard não espera por ele)
export function CurvaSWidgetCarregando({ obraId }: { obraId?: string } = {}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle nivel={3}>{obraId ? TITULO_OBRA : TITULO}</CardTitle>
        <Skeleton className="h-5 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  );
}

// cada obra pesa pelo seu orçamento (mesma regra de `avancoPonderado`)
export async function CurvaSWidget({ obraId }: { obraId?: string } = {}) {
  const titulo = obraId ? TITULO_OBRA : TITULO;
  let dados: Awaited<ReturnType<typeof carregar>>;
  try {
    dados = await carregar(obraId);
  } catch (erro) {
    // banco lento (statement_timeout) ou fora: o widget sai, o dashboard fica
    console.error("Curva S do dashboard indisponível", erro);
    return (
      <Card>
        <CardHeader>
          <CardTitle nivel={3}>{titulo}</CardTitle>
          <CardDescription>Não foi possível carregar a curva agora. Recarregue a página em instantes.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const [obras, medicoes, linhasBase] = dados;

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
    // com linha de base oficial, o previsto vem dela (como no Cronograma); o realizado, das etapas atuais
    const linha = linhasBase.get(o.id);
    const base = linha ? planoDaLinhaBase(linha) : null;
    const faixa = unirFaixas([faixaDaCurvaS(plano, pontos, hoje), base ? faixaDaCurvaS(base, pontos, hoje) : null]);
    return { plano, pontos, base, faixa };
  });
  const comCurva = planos.filter((p) => p.faixa !== null);
  const faixa = unirFaixas(comCurva.map((p) => p.faixa));
  if (!faixa) {
    // a curva só existe com início e fim nas etapas: o vazio diz isso e leva ao cronograma
    return (
      <Card>
        <CardHeader>
          <CardTitle nivel={3}>{titulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <EstadoVazio
            compacto
            nivel={3}
            icone={CalendarRange}
            titulo="Defina as datas das etapas"
            acao={
              <AcaoVazio
                href={obraId ? `/cronograma?obra=${obraId}` : "/cronograma"}
                icone={CalendarRange}
                variante="outline"
              >
                Abrir o cronograma
              </AcaoVazio>
            }
          >
            {obraId
              ? "A curva S compara o previsto e o realizado, e o previsto sai do início e do fim de cada etapa."
              : "Nenhuma obra em andamento tem etapas com início e fim. Sem datas não há previsto para a curva S."}
          </EstadoVazio>
        </CardContent>
      </Card>
    );
  }

  const comBase = comCurva.filter((p) => p.base).length;

  // previsto e realizado na mesma data (hoje) — o ponto do mês corrente compara fim do mês × hoje
  const pesos = comCurva.map((p) => orcamentoTotal(p.plano));
  const previstoHoje = avancoPonderado(
    comCurva.map((p, i) => ({ orcamentoCents: pesos[i], percentBp: previstoNaData(p.base ?? p.plano, hoje) })),
  );
  const realizadoHoje = avancoPonderado(
    comCurva.map((p, i) => ({ orcamentoCents: pesos[i], percentBp: realizadoNaData(p.plano, p.pontos, hoje) })),
  );

  const curva: PontoCurvaS[] = agregarCurvasS(
    comCurva.map((p, i) => ({
      orcamentoCents: pesos[i],
      curva: curvaS(p.plano, p.pontos, hoje, faixa, p.base),
    })),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle nivel={3}>{titulo}</CardTitle>
        <CardDescription>
          {comCurva.length} obra{comCurva.length > 1 ? "s" : ""} com cronograma
          {comBase > 0 && (obraId ? " · previsto pela linha de base" : ` (${comBase} pela linha de base)`)}
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
