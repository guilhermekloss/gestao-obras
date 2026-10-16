"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { formatarMoeda } from "@/lib/format";

// sem vermelho: vermelho é estado (vencido), não série
const CORES_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-6)",
  "var(--chart-5)",
];

const eixoTick = { fontSize: 12, fill: "var(--muted-foreground)" };

function moedaCompacta(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  }
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export function GastoMensalChart({
  data,
  obras,
}: {
  data: Record<string, number | string>[];
  obras: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
        <YAxis tick={eixoTick} tickLine={false} axisLine={false} tickFormatter={moedaCompacta} width={72} />
        <Tooltip
          formatter={(v) => formatarMoeda(Number(v ?? 0))}
          contentStyle={{ borderRadius: 6, fontSize: 13, borderColor: "var(--border)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {obras.map((nome, i) => (
          <Bar
            key={nome}
            dataKey={nome}
            stackId="gasto"
            fill={CORES_SERIES[i % CORES_SERIES.length]}
            stroke="var(--background)"
            strokeWidth={2}
            radius={i === obras.length - 1 ? [2, 2, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OrcadoRealizadoChart({
  data,
}: {
  data: { obra: string; Orçado: number; Realizado: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="obra" tick={eixoTick} tickLine={false} axisLine={false} />
        <YAxis tick={eixoTick} tickLine={false} axisLine={false} tickFormatter={moedaCompacta} width={72} />
        <Tooltip
          formatter={(v) => formatarMoeda(Number(v ?? 0))}
          contentStyle={{ borderRadius: 6, fontSize: 13, borderColor: "var(--border)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Orçado" fill="var(--chart-5)" radius={[2, 2, 0, 0]}>
          <LabelList
            dataKey="Orçado"
            position="top"
            formatter={(v) => (Number(v) > 0 ? moedaCompacta(Number(v)) : "")}
            style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </Bar>
        <Bar dataKey="Realizado" fill="var(--chart-1)" radius={[2, 2, 0, 0]}>
          <LabelList
            dataKey="Realizado"
            position="top"
            formatter={(v) => (Number(v) > 0 ? moedaCompacta(Number(v)) : "")}
            style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
