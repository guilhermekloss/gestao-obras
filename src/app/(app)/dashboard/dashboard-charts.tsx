"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarMoeda, formatarMoedaAbreviada } from "@/lib/format";
import {
  ChavesDeSerie,
  eixoTick,
  nomeCurto,
  TabelaDoGrafico,
  TooltipGrafico,
  useLargura,
} from "@/components/grafico";

// sem vermelho: vermelho é estado (vencido), não série
const CORES_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-6)",
  "var(--chart-5)",
];

// abaixo disso o nome ao lado do gráfico espremeria as barras: vira lista de cores
const LARGURA_ROTULO_DIRETO = 560;

type PropsRotulo = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  index?: number;
  value?: unknown;
};

const moedaTooltip = (v: number) => formatarMoeda(v);

export function GastoMensalChart({
  data,
  obras,
}: {
  data: Record<string, number | string>[];
  obras: string[];
}) {
  const { largo, aoMedir } = useLargura(LARGURA_ROTULO_DIRETO);
  const cor = (i: number) => CORES_SERIES[i % CORES_SERIES.length];
  const ultimo = data[data.length - 1] ?? {};
  const ultimoMes = String(ultimo.mes ?? "");

  const pontosDaObra = (nome: string) => data.filter((d) => d[nome] !== undefined).length;

  // rótulo direto na última coluna; obra sem gasto nesse mês não tem onde ser rotulada
  const comRotulo = largo ? new Set(obras.filter((n) => Number(ultimo[n] ?? 0) > 0)) : new Set<string>();
  const semRotulo = obras
    .map((nome, i) => ({ nome, cor: cor(i) }))
    .filter((s) => !comRotulo.has(s.nome));

  return (
    <div>
      <ResponsiveContainer width="100%" height={300} onResize={aoMedir}>
        <BarChart
          data={data}
          margin={{ top: 8, right: largo ? 112 : 8, left: 0, bottom: 0 }}
          title="Gasto mensal por obra"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatarMoedaAbreviada}
            tickCount={5}
            width={76}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={(p) => <TooltipGrafico {...p} formatar={moedaTooltip} total ocultarZeros />}
          />
          {obras.map((nome, i) => (
            <Bar
              key={nome}
              dataKey={nome}
              stackId="gasto"
              fill={cor(i)}
              stroke="var(--background)"
              strokeWidth={2}
              radius={i === obras.length - 1 ? [2, 2, 0, 0] : 0}
              isAnimationActive={false}
            >
              {comRotulo.has(nome) && (
                <LabelList
                  dataKey={nome}
                  content={(p: PropsRotulo) => {
                    // o Recharts só desenha as barras que existem: o índice conta meses com gasto da obra
                    if (p.index !== pontosDaObra(nome) - 1) return null;
                    const x = Number(p.x) + Number(p.width) + 6;
                    const y = Number(p.y) + Number(p.height) / 2;
                    return (
                      <g>
                        <rect x={x} y={y - 4} width={8} height={8} rx={1.5} fill={cor(i)} />
                        <text x={x + 13} y={y} dy="0.35em" fontSize={12} fill="var(--foreground)">
                          {nomeCurto(nome)}
                        </text>
                      </g>
                    );
                  }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {semRotulo.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {largo && <p className="text-sm text-muted-foreground">Sem gasto em {ultimoMes}:</p>}
          <ChavesDeSerie series={semRotulo} />
        </div>
      )}

      <TabelaDoGrafico
        titulo="Gasto mensal por obra"
        colunas={["Mês", ...obras]}
        linhas={data.map((d) => [
          String(d.mes),
          ...obras.map((n) => (Number(d[n] ?? 0) > 0 ? formatarMoeda(Number(d[n])) : "—")),
        ])}
      />
    </div>
  );
}

const COR_ORCADO = "var(--chart-5)";
const COR_REALIZADO = "var(--chart-1)";

export function OrcadoRealizadoChart({
  data,
}: {
  data: { obra: string; Orçado: number; Realizado: number }[];
}) {
  const { largo, aoMedir } = useLargura(LARGURA_ROTULO_DIRETO);
  const altura = Math.max(170, data.length * 72 + 36);

  // o nome da série vai só no primeiro grupo, ao lado do valor: lê-se uma vez e vale para todos
  const rotulo = (serie: "Orçado" | "Realizado") =>
    function Rotulo(p: PropsRotulo) {
      const valor = Number(p.value ?? 0);
      if (valor <= 0) return null;
      const texto = formatarMoedaAbreviada(valor);
      return (
        <text
          x={Number(p.x) + Number(p.width) + 6}
          y={Number(p.y) + Number(p.height) / 2}
          dy="0.35em"
          fontSize={12}
          fill="var(--foreground)"
        >
          {largo && p.index === 0 ? `${serie} ${texto}` : texto}
        </text>
      );
    };

  return (
    <div>
      {!largo && (
        <ChavesDeSerie
          className="mb-2"
          series={[
            { nome: "Orçado (tracejado)", cor: COR_ORCADO },
            { nome: "Realizado", cor: COR_REALIZADO },
          ]}
        />
      )}
      <ResponsiveContainer width="100%" height={altura} onResize={aoMedir}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: largo ? 120 : 64, left: 0, bottom: 0 }}
          barCategoryGap="24%"
          barGap={3}
          title="Orçado e realizado por obra"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatarMoedaAbreviada}
            tickCount={4}
          />
          <YAxis
            type="category"
            dataKey="obra"
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(n: string) => nomeCurto(n, 11)}
            width={84}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={(p) => <TooltipGrafico {...p} formatar={moedaTooltip} />}
          />
          {/* orçado vazado e tracejado, realizado cheio: a diferença não depende só da cor */}
          <Bar
            dataKey="Orçado"
            fill={COR_ORCADO}
            fillOpacity={0.16}
            stroke={COR_ORCADO}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            radius={[0, 2, 2, 0]}
            isAnimationActive={false}
          >
            <LabelList dataKey="Orçado" content={rotulo("Orçado")} />
          </Bar>
          <Bar
            dataKey="Realizado"
            fill={COR_REALIZADO}
            radius={[0, 2, 2, 0]}
            isAnimationActive={false}
          >
            <LabelList dataKey="Realizado" content={rotulo("Realizado")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <TabelaDoGrafico
        titulo="Orçado e realizado por obra"
        colunas={["Obra", "Orçado", "Realizado"]}
        linhas={data.map((d) => [d.obra, formatarMoeda(d.Orçado), formatarMoeda(d.Realizado)])}
      />
    </div>
  );
}
