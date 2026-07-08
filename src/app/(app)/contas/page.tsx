import Link from "next/link";
import { startOfDay, endOfDay, endOfWeek, endOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { formatarMoeda } from "@/lib/format";
import { ContasTable, type ParcelaLinha } from "./contas-client";
import { cn } from "@/lib/utils";

const VISOES = [
  { key: "hoje", label: "Vence hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "vencidas", label: "Vencidas" },
  { key: "todas", label: "Todas abertas" },
  { key: "pagas", label: "Pagas" },
] as const;

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; obra?: string; fornecedor?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { visao = "semana", obra, fornecedor } = await searchParams;

  const hoje = new Date();
  const where: Prisma.ParcelaWhereInput = {};

  switch (visao) {
    case "hoje":
      where.status = "ABERTA";
      where.vencimento = { gte: startOfDay(hoje), lte: endOfDay(hoje) };
      break;
    case "semana":
      where.status = "ABERTA";
      where.vencimento = { lte: endOfWeek(hoje, { weekStartsOn: 1 }) };
      break;
    case "mes":
      where.status = "ABERTA";
      where.vencimento = { lte: endOfMonth(hoje) };
      break;
    case "vencidas":
      where.status = "ABERTA";
      where.vencimento = { lt: startOfDay(hoje) };
      break;
    case "pagas":
      where.status = "PAGA";
      break;
    default:
      where.status = "ABERTA";
  }

  if (fornecedor) where.nota = { fornecedorId: fornecedor };
  if (obra) {
    where.nota = {
      ...(where.nota as object ?? {}),
      itens: { some: { rateios: { some: { obraId: obra } } } },
    };
  }

  const [parcelas, fornecedores, obras] = await Promise.all([
    prisma.parcela.findMany({
      where,
      orderBy: { vencimento: "asc" },
      take: 300,
      include: {
        nota: {
          include: {
            fornecedor: { select: { nome: true } },
            parcelas: { select: { id: true } },
            itens: {
              take: 1,
              include: { rateios: { include: { obra: { select: { nome: true } } } } },
            },
          },
        },
      },
    }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.obra.findMany({ orderBy: { codigo: "asc" }, select: { id: true, nome: true } }),
  ]);

  const linhas: ParcelaLinha[] = parcelas.map((p) => ({
    id: p.id,
    vencimento: p.vencimento.toISOString(),
    valorCents: p.valorCents,
    numero: p.numero,
    totalParcelas: p.nota.parcelas.length,
    status: p.status,
    pagaEm: p.pagaEm?.toISOString() ?? null,
    vencida: p.status === "ABERTA" && p.vencimento < startOfDay(hoje),
    fornecedor: p.nota.fornecedor.nome,
    notaId: p.notaId,
    notaNumero: p.nota.numero,
    obras: (p.nota.itens[0]?.rateios ?? [])
      .map((r) =>
        r.fracaoBp === 10000
          ? r.obra.nome
          : `${r.obra.nome} (${(r.fracaoBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
      )
      .join(", "),
  }));

  const total = linhas.reduce((acc, l) => acc + l.valorCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Contas a pagar</h1>
        <Button variant="outline" render={<Link href="/contas/fluxo" />}>
          Fluxo mensal
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {VISOES.map((v) => (
          <Link
            key={v.key}
            href={`/contas?visao=${v.key}${obra ? `&obra=${obra}` : ""}${fornecedor ? `&fornecedor=${fornecedor}` : ""}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              visao === v.key
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="visao" value={visao} />
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            name="obra"
            defaultValue={obra ?? ""}
            todosLabel="Todas"
            placeholder="Todas"
            className="w-40"
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Fornecedor</label>
          <ComboboxFiltro
            name="fornecedor"
            defaultValue={fornecedor ?? ""}
            todosLabel="Todos"
            placeholder="Todos"
            className="w-48"
            options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {linhas.length} parcela(s) · total {formatarMoeda(total)}
      </p>

      <ContasTable parcelas={linhas} />
    </div>
  );
}
