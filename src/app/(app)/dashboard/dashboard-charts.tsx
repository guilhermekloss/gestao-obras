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

/** Paleta categórica validada (dataviz): ordem fixa por obra, nunca ciclada. */
export const CORES_SERIES = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
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
          contentStyle={{ borderRadius: 8, fontSize: 13 }}
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
            radius={i === obras.length - 1 ? [4, 4, 0, 0] : 0}
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
          contentStyle={{ borderRadius: 8, fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Orçado" fill="#2a78d6" radius={[4, 4, 0, 0]}>
          <LabelList
            dataKey="Orçado"
            position="top"
            formatter={(v) => (Number(v) > 0 ? moedaCompacta(Number(v)) : "")}
            style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </Bar>
        <Bar dataKey="Realizado" fill="#eda100" radius={[4, 4, 0, 0]}>
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

export function AvancoChart({
  data,
}: {
  data: { obra: string; avanco: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={eixoTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="obra" tick={eixoTick} tickLine={false} axisLine={false} width={70} />
        <Tooltip
          formatter={(v) => `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          contentStyle={{ borderRadius: 8, fontSize: 13 }}
        />
        <Bar dataKey="avanco" name="Avanço físico" fill="#2a78d6" radius={[0, 4, 4, 0]} barSize={20}>
          <LabelList
            dataKey="avanco"
            position="right"
            formatter={(v) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
