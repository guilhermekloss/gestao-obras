"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type PontoCurvaSChart = { mes: string; previsto: number; realizado: number | null };

const eixoTick = { fontSize: 12, fill: "var(--muted-foreground)" };

const COR_PREVISTO = "#2a78d6";
const COR_REALIZADO = "#eda100";

function pct(v: unknown): string {
  return `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// previsto tracejado para não depender só da cor
export function CurvaSChart({ data, altura = 280 }: { data: PontoCurvaSChart[]; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
        <Tooltip formatter={(v) => pct(v)} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="previsto"
          name="Previsto"
          stroke={COR_PREVISTO}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          activeDot={{ r: 4 }}
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
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
