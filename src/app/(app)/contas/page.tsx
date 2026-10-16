import Link from "next/link";
import { startOfDay, endOfDay, endOfWeek, endOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { SelectNativo } from "@/components/select-nativo";
import { formatarMoeda, formatarPercentBp } from "@/lib/format";
import { listarObrasParaFiltro } from "@/services/obras";
import { TIPO_DOCUMENTO_LABELS, TIPOS_DOCUMENTO, parseTipoDocumento, proximosDias } from "@/services/financeiro";
import { ContasTable, type ParcelaLinha } from "./contas-client";
import { cn } from "@/lib/utils";

const VISOES = [
  { key: "hoje", label: "Vence hoje" },
  { key: "7dias", label: "Próximos 7 dias" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "vencidas", label: "Vencidas" },
  { key: "todas", label: "Todas abertas" },
  { key: "pagas", label: "Pagas" },
] as const;

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; obra?: string; fornecedor?: string; tipo?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { visao = "semana", obra, fornecedor, tipo: tipoParam } = await searchParams;
  const tipo = parseTipoDocumento(tipoParam);

  const hoje = new Date();
  const where: Prisma.ParcelaWhereInput = {};

  switch (visao) {
    case "hoje":
      where.status = "ABERTA";
      where.vencimento = { gte: startOfDay(hoje), lte: endOfDay(hoje) };
      break;
    case "7dias": {
      const { de, ate } = proximosDias(hoje);
      where.status = "ABERTA";
      where.vencimento = { gte: de, lte: ate };
      break;
    }
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

  const filtroNota: Prisma.NotaFiscalWhereInput = {};
  if (fornecedor) filtroNota.fornecedorId = fornecedor;
  if (obra) filtroNota.rateios = { some: { obraId: obra } };
  if (tipo) filtroNota.tipoDocumento = tipo;
  if (Object.keys(filtroNota).length > 0) where.nota = filtroNota;

  const filtrosQuery = new URLSearchParams({
    ...(obra ? { obra } : {}),
    ...(fornecedor ? { fornecedor } : {}),
    ...(tipo ? { tipo } : {}),
  }).toString();

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
            rateios: { include: { obra: { select: { nome: true } } } },
          },
        },
      },
    }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listarObrasParaFiltro(),
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
    tipoDocumento: p.nota.tipoDocumento,
    obras: p.nota.rateios
      .map((r) =>
        r.fracaoBp === 10000 ? r.obra.nome : `${r.obra.nome} (${formatarPercentBp(r.fracaoBp)})`,
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
            href={`/contas?visao=${v.key}${filtrosQuery ? `&${filtrosQuery}` : ""}`}
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
        <div className="grid gap-1">
          <label htmlFor="filtro-tipo" className="text-xs text-muted-foreground">Tipo</label>
          <SelectNativo id="filtro-tipo" name="tipo" defaultValue={tipo ?? ""} className="w-44">
            <option value="">Todos</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>{TIPO_DOCUMENTO_LABELS[t]}</option>
            ))}
          </SelectNativo>
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
