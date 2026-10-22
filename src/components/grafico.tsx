"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Peças comuns dos gráficos (Recharts). Cores vêm só dos tokens da Prancheta (`--chart-*`),
 * então tema escuro e claro funcionam sem código extra.
 *
 * Acessibilidade: o Recharts já foca o gráfico (Tab), troca de ponto com as setas e
 * fecha o balão com Esc. Aqui o balão ganha leitura de valores e cada gráfico oferece
 * a mesma informação em tabela (`TabelaDoGrafico`), que é o caminho para leitor de tela.
 */

export const eixoTick = { fontSize: 12, fill: "var(--muted-foreground)" };

/** Corta o nome para caber ao lado do gráfico; o nome inteiro continua no balão e na tabela. */
export function nomeCurto(nome: string, max = 14): string {
  return nome.length > max ? `${nome.slice(0, max - 1).trimEnd()}…` : nome;
}

/** Vale para gráficos com rótulo direto: abaixo disso falta largura e o rótulo vira lista. */
export function useLargura(limite: number) {
  const [largura, setLargura] = useState<number | null>(null);
  return {
    // enquanto não mediu, assume largo: no servidor o gráfico nem renderiza (ResponsiveContainer)
    largo: largura === null || largura >= limite,
    aoMedir: (w: number) => setLargura((atual) => (atual === w ? atual : w)),
  };
}

type ItemDoBalao = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
};

/** Balão: título, uma linha por série (amostra de cor + nome + valor) e total opcional. */
export function TooltipGrafico({
  active,
  payload,
  label,
  formatar,
  total = false,
  ocultarZeros = false,
}: {
  active?: boolean;
  payload?: readonly ItemDoBalao[];
  label?: string | number;
  formatar: (valor: number) => string;
  total?: boolean;
  /** Em barras empilhadas, obra sem gasto no mês só polui o balão. */
  ocultarZeros?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const linhas = payload
    .filter((p) => p.value !== null && p.value !== undefined && !(ocultarZeros && Number(p.value) === 0))
    .sort((a, b) => Number(b.value) - Number(a.value));
  if (linhas.length === 0) return null;
  const soma = linhas.reduce((a, p) => a + Number(p.value), 0);
  return (
    <div className="min-w-40 max-w-64 rounded-lg bg-popover px-3 py-2 text-sm text-popover-foreground shadow-none ring-1 ring-foreground/30">
      {label !== undefined && label !== "" && <p className="mb-1 font-semibold">{label}</p>}
      <ul className="space-y-0.5">
        {linhas.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: p.color }}
            />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="num shrink-0">{formatar(Number(p.value))}</span>
          </li>
        ))}
      </ul>
      {total && linhas.length > 1 && (
        <p className="mt-1 flex justify-between gap-2 border-t pt-1 font-semibold">
          <span>Total</span>
          <span className="num">{formatar(soma)}</span>
        </p>
      )}
    </div>
  );
}

/** Lista de séries com amostra de cor. Só entra onde o rótulo direto não cabe. */
export function ChavesDeSerie({
  series,
  className,
}: {
  series: { nome: string; cor: string }[];
  className?: string;
}) {
  if (series.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {series.map((s) => (
        <li key={s.nome} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: s.cor }} />
          {s.nome}
        </li>
      ))}
    </ul>
  );
}

/** Os mesmos números do gráfico em tabela, recolhida. Alvo de toque de 44 px no título. */
export function TabelaDoGrafico({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: string[];
  linhas: string[][];
}) {
  return (
    <details className="group mt-3 border-t pt-1 print:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm text-sm text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        Ver valores em tabela
      </summary>
      {/* região rolável por teclado: a tabela de 12 meses passa da largura do celular */}
      <Table
        container={{
          role: "region",
          "aria-label": `Valores: ${titulo}`,
          tabIndex: 0,
          className: "mt-1 max-h-80 overflow-auto rounded-sm",
        }}
      >
        <TableHeader>
          <TableRow>
            {colunas.map((c, i) => (
              <TableHead key={c} className={i > 0 ? "text-right" : undefined}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l[0]}>
              {l.map((v, i) => (
                <TableCell key={`${l[0]}-${colunas[i]}`} className={i > 0 ? "num text-right" : undefined}>
                  {v}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  );
}
