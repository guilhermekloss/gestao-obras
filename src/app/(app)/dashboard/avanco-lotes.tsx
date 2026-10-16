import { ReguaCota } from "@/components/regua-cota";

// avanço físico por obra como linha de cota (substitui o gráfico de barras)
export function AvancoLotes({ data }: { data: { obra: string; avanco: number }[] }) {
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.obra} className="flex items-center gap-3">
          <span className="w-16 shrink-0 truncate text-sm">{d.obra}</span>
          <ReguaCota percent={d.avanco} rotulo={`Avanço físico de ${d.obra}`} />
          <span className="w-14 shrink-0 text-right text-base num">
            {d.avanco.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
          </span>
        </li>
      ))}
    </ul>
  );
}
