import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { Prisma, TipoDocumento } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { idsDeNotasDivergentes } from "@/services/analises";
import { StatusBadge } from "@/components/status-badge";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { Input } from "@/components/ui/input";
import { SelectNativo } from "@/components/select-nativo";
import { formatarMoeda, formatarData } from "@/lib/format";
import { listarObrasParaFiltro } from "@/services/obras";
import {
  FORMA_PAGTO_LABELS,
  TIPO_DOCUMENTO_BADGE,
  TIPO_DOCUMENTO_LABELS,
  TIPOS_DOCUMENTO,
  parseTipoDocumento,
} from "@/services/financeiro";
import { FileCode2, Paperclip, Plus } from "lucide-react";

export const metadata: Metadata = { title: "Lançamentos" };

type Nota = {
  id: string;
  dataCompra: Date;
  numero: string;
  tipoDocumento: TipoDocumento;
  formaPagto: keyof typeof FORMA_PAGTO_LABELS;
  anexoUrl: string | null;
  totalCents: number;
  fornecedor: { nome: string };
  parcelas: { status: string }[];
  _count: { itens: number };
  divergente?: boolean;
};

const COLUNAS: ColunaDados<Nota>[] = [
  { id: "data", titulo: "Data", celula: (n) => formatarData(n.dataCompra) },
  {
    id: "fornecedor",
    titulo: "Fornecedor",
    papel: "titulo",
    classe: "tabela:font-medium",
    celula: (n) => (
      <Link href={`/notas/${n.id}`} className={LINK_DA_LINHA}>
        {n.fornecedor.nome}
      </Link>
    ),
  },
  {
    id: "documento",
    titulo: "Documento",
    celula: (n) => (
      <span className="inline-flex items-center gap-1.5">
        <Badge
          variant={n.tipoDocumento === "NF" ? "outline" : "secondary"}
          title={TIPO_DOCUMENTO_LABELS[n.tipoDocumento]}
        >
          {TIPO_DOCUMENTO_BADGE[n.tipoDocumento]}
        </Badge>
        {n.numero}
        {n.divergente && <StatusBadge estado="atencao">Itens ≠ total</StatusBadge>}
        {n.anexoUrl && (
          <a
            href={n.anexoUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver anexo"
            aria-label={`Ver anexo do documento ${n.numero}`}
            className="-m-3 p-3 tabela:m-0 tabela:p-0"
          >
            <Paperclip className="size-4 text-muted-foreground hover:text-foreground" />
          </a>
        )}
      </span>
    ),
  },
  { id: "forma", titulo: "Forma", semCartao: true, celula: (n) => FORMA_PAGTO_LABELS[n.formaPagto] },
  { id: "itens", titulo: "Itens", semCartao: true, celula: (n) => n._count.itens },
  {
    id: "parcelas",
    titulo: "Parcelas",
    papel: "estado",
    celula: (n) => {
      const pagas = n.parcelas.filter((p) => p.status === "PAGA").length;
      return (
        <StatusBadge estado={n.parcelas.length > 0 && pagas === n.parcelas.length ? "pago" : "neutro"}>
          {pagas}/{n.parcelas.length} pagas
        </StatusBadge>
      );
    },
  },
  {
    id: "total",
    titulo: "Total",
    papel: "valor",
    numerica: true,
    celula: (n) => formatarMoeda(n.totalCents),
  },
];

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{
    fornecedor?: string;
    obra?: string;
    de?: string;
    ate?: string;
    tipo?: string;
    divergentes?: string;
  }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { fornecedor, obra, de, ate, tipo: tipoParam, divergentes } = await searchParams;
  const soDivergentes = divergentes === "1";
  const tipo = parseTipoDocumento(tipoParam);

  const where: Prisma.NotaFiscalWhereInput = {};
  if (fornecedor) where.fornecedorId = fornecedor;
  if (tipo) where.tipoDocumento = tipo;
  if (obra) where.rateios = { some: { obraId: obra } };
  if (de || ate) {
    where.dataCompra = {
      ...(de ? { gte: new Date(de) } : {}),
      ...(ate ? { lte: new Date(ate + "T23:59:59") } : {}),
    };
  }

  // Mesma regra do alerta do dashboard (itens somam ≠ total), sem carregar os itens: só id/total e a soma por nota.
  if (soDivergentes) {
    const [candidatas, somas] = await Promise.all([
      prisma.notaFiscal.findMany({
        where,
        orderBy: { dataCompra: "desc" },
        select: { id: true, totalCents: true },
      }),
      prisma.itemNota.groupBy({ by: ["notaId"], where: { nota: where }, _sum: { totalCents: true } }),
    ]);
    const ids = idsDeNotasDivergentes(
      candidatas,
      new Map(somas.map((s) => [s.notaId, s._sum.totalCents ?? 0])),
    );
    where.id = { in: ids.slice(0, 200) };
  }

  const [notasDb, fornecedores, obras] = await Promise.all([
    prisma.notaFiscal.findMany({
      where,
      orderBy: { dataCompra: "desc" },
      take: 200,
      include: {
        fornecedor: { select: { nome: true } },
        parcelas: { select: { status: true } },
        _count: { select: { itens: true } },
      },
    }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listarObrasParaFiltro(),
  ]);

  const notas: Nota[] = notasDb.map((n) => ({ ...n, divergente: soDivergentes }));
  const totalPeriodo = notas.reduce((acc, n) => acc + n.totalCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl">Lançamentos</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/notas/importar-xml" />}>
            <FileCode2 className="size-4" /> Importar XML
          </Button>
          <Button render={<Link href="/notas/nova" />}>
            <Plus className="size-4" /> Novo lançamento
          </Button>
        </div>
      </div>

      {soDivergentes && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-estado-atencao-borda bg-estado-atencao p-3 text-estado-atencao-fg"
        >
          <p className="min-w-0 flex-[1_1_16rem]">
            <span className="font-bold">Itens ≠ total.</span> Mostrando só os lançamentos em que a soma dos itens
            difere do valor total da nota.
          </p>
          <Button variant="outline" className="bg-card" render={<Link href="/notas" />}>
            Ver todos os lançamentos
          </Button>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-2">
        {soDivergentes && <input type="hidden" name="divergentes" value="1" />}
        <div className="grid gap-1">
          <label htmlFor="filtro-fornecedor" className="text-xs text-muted-foreground">Fornecedor</label>
          <ComboboxFiltro
            id="filtro-fornecedor"
            name="fornecedor"
            defaultValue={fornecedor ?? ""}
            todosLabel="Todos"
            placeholder="Todos"
            className="w-48"
            options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="filtro-obra" className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            id="filtro-obra"
            name="obra"
            defaultValue={obra ?? ""}
            todosLabel="Todas"
            placeholder="Todas"
            className="w-40"
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
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
        <div className="grid gap-1">
          <label htmlFor="filtro-de" className="text-xs text-muted-foreground">De</label>
          <Input type="date" id="filtro-de" name="de" defaultValue={de ?? ""} className="w-36" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="filtro-ate" className="text-xs text-muted-foreground">Até</label>
          <Input type="date" id="filtro-ate" name="ate" defaultValue={ate ?? ""} className="w-36" />
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {notas.length} {notas.length === 1 ? "lançamento" : "lançamentos"} · total {formatarMoeda(totalPeriodo)}
      </p>

      <ListaDeDados
        legenda="Lançamentos"
        linhas={notas}
        chave={(n) => n.id}
        colunas={COLUNAS}
        vazio="Nenhum lançamento encontrado."
      />
    </div>
  );
}
