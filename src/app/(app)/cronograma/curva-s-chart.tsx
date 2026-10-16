"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { eixoTick, TabelaDoGrafico, TooltipGrafico } from "@/components/grafico";

export type PontoCurvaSChart = { mes: string; previsto: number; realizado: number | null };

const COR_PREVISTO = "var(--chart-5)";
const COR_REALIZADO = "var(--chart-1)";

function pct(v: unknown): string {
  return `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

type PropsPonto = { x?: number | string; y?: number | string; index?: number };

// rótulo direto no fim de cada linha, no lugar da legenda; o tracejado do previsto
// segue valendo para quem não distingue as cores
export function CurvaSChart({ data, altura = 280 }: { data: PontoCurvaSChart[]; altura?: number }) {
  const ultimoPrevisto = data.length - 1;
  let ultimoRealizado = -1;
  data.forEach((d, i) => {
    if (d.realizado !== null) ultimoRealizado = i;
  });

  const rotuloPrevisto = (p: PropsPonto) => {
    if (p.index !== ultimoPrevisto) return <g />;
    return (
      <text x={Number(p.x)} y={Number(p.y) - 9} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--foreground)">
        Previsto {pct(data[ultimoPrevisto].previsto)}
      </text>
    );
  };

  const rotuloRealizado = (p: PropsPonto) => {
    if (p.index !== ultimoRealizado || ultimoRealizado < 0) return <g />;
    const atual = data[ultimoRealizado];
    // com o previsto acima, o texto vai abaixo da linha; se o realizado passou, vai acima
    const abaixo = (atual.realizado ?? 0) <= atual.previsto;
    return (
      <text
        x={Number(p.x)}
        y={Number(p.y) + (abaixo ? 20 : -10)}
        textAnchor={ultimoRealizado > data.length / 2 ? "end" : "start"}
        fontSize={12}
        fontWeight={600}
        fill="var(--foreground)"
      >
        Realizado {pct(atual.realizado)}
      </text>
    );
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={altura}>
        <LineChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }} title="Curva S: previsto e realizado">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            width={44}
          />
          <Tooltip content={(p) => <TooltipGrafico {...p} formatar={pct} />} />
          <Line
            type="monotone"
            dataKey="previsto"
            name="Previsto"
            stroke={COR_PREVISTO}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4 }}
            label={rotuloPrevisto}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="realizado"
            name="Realizado"
            stroke={COR_REALIZADO}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            label={rotuloRealizado}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <TabelaDoGrafico
        titulo="Curva S"
        colunas={["Mês", "Previsto", "Realizado"]}
        linhas={data.map((d) => [d.mes, pct(d.previsto), d.realizado === null ? "—" : pct(d.realizado)])}
      />
    </div>
  );
}
