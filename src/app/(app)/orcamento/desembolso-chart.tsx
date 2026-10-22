"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarMoeda, formatarMoedaAbreviada } from "@/lib/format";
import { ChavesDeSerie, eixoTick, TabelaDoGrafico, TooltipGrafico } from "@/components/grafico";

export type PontoDesembolsoChart = {
  mes: string;
  previsto: number;
  realizado: number | null;
  previstoAcum: number;
  realizadoAcum: number | null;
};

// mesmas cores do orçado × realizado do dashboard: previsto é cinza e tracejado, realizado é azul e cheio
const COR_PREVISTO = "var(--chart-5)";
const COR_REALIZADO = "var(--chart-1)";

const SERIES = [
  { nome: "Previsto no mês (barra tracejada)", cor: COR_PREVISTO },
  { nome: "Realizado no mês (barra)", cor: COR_REALIZADO },
  { nome: "Previsto acumulado (linha tracejada)", cor: COR_PREVISTO },
  { nome: "Realizado acumulado (linha)", cor: COR_REALIZADO },
];

const moeda = (v: number) => formatarMoeda(v);
const ouTraco = (v: number | null) => (v === null ? "—" : formatarMoeda(v));

// Um eixo só: barras do mês e linhas do acumulado estão na mesma unidade (R$).
export function DesembolsoChart({ data }: { data: PontoDesembolsoChart[] }) {
  return (
    <div>
      <ChavesDeSerie className="mb-2" series={SERIES} />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barGap={2}
          title="Desembolso previsto e realizado por mês"
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
            content={(p) => <TooltipGrafico {...p} formatar={moeda} />}
          />
          <Bar
            dataKey="previsto"
            name="Previsto no mês"
            fill={COR_PREVISTO}
            fillOpacity={0.16}
            stroke={COR_PREVISTO}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            radius={[2, 2, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
          <Bar
            dataKey="realizado"
            name="Realizado no mês"
            fill={COR_REALIZADO}
            radius={[2, 2, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="previstoAcum"
            name="Previsto acumulado"
            stroke={COR_PREVISTO}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="realizadoAcum"
            name="Realizado acumulado"
            stroke={COR_REALIZADO}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <TabelaDoGrafico
        titulo="Desembolso previsto × realizado"
        colunas={["Mês", "Previsto no mês", "Realizado no mês", "Previsto acumulado", "Realizado acumulado"]}
        linhas={data.map((d) => [
          d.mes,
          formatarMoeda(d.previsto),
          ouTraco(d.realizado),
          formatarMoeda(d.previstoAcum),
          ouTraco(d.realizadoAcum),
        ])}
      />
    </div>
  );
}
