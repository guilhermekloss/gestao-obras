import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SelectNativo } from "@/components/select-nativo";
import { Input } from "@/components/ui/input";
import { formatarMoeda, formatarData } from "@/lib/format";
import { Plus } from "lucide-react";

const FORMA_LABELS: Record<string, string> = {
  PIX: "PIX",
  CARTAO: "Cartão",
  DEBITO: "Débito",
  BOLETO: "Boleto",
};

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ fornecedor?: string; obra?: string; de?: string; ate?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { fornecedor, obra, de, ate } = await searchParams;

  const where: Prisma.NotaFiscalWhereInput = {};
  if (fornecedor) where.fornecedorId = fornecedor;
  if (obra) where.itens = { some: { rateios: { some: { obraId: obra } } } };
  if (de || ate) {
    where.dataCompra = {
      ...(de ? { gte: new Date(de) } : {}),
      ...(ate ? { lte: new Date(ate + "T23:59:59") } : {}),
    };
  }

  const [notas, fornecedores, obras] = await Promise.all([
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
    prisma.obra.findMany({ orderBy: { codigo: "asc" }, select: { id: true, nome: true } }),
  ]);

  const totalPeriodo = notas.reduce((acc, n) => acc + n.totalCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notas fiscais</h1>
        <Button render={<Link href="/notas/nova" />}>
          <Plus className="size-4" /> Nova NF
        </Button>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Fornecedor</label>
          <SelectNativo name="fornecedor" defaultValue={fornecedor ?? ""} className="w-48">
            <option value="">Todos</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <SelectNativo name="obra" defaultValue={obra ?? ""} className="w-36">
            <option value="">Todas</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" name="de" defaultValue={de ?? ""} className="w-36" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" name="ate" defaultValue={ate ?? ""} className="w-36" />
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {notas.length} notas · total {formatarMoeda(totalPeriodo)}
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>NF</TableHead>
              <TableHead className="hidden md:table-cell">Forma</TableHead>
              <TableHead className="hidden md:table-cell">Itens</TableHead>
              <TableHead>Parcelas</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notas.map((n) => {
              const pagas = n.parcelas.filter((p) => p.status === "PAGA").length;
              return (
                <TableRow key={n.id}>
                  <TableCell>{formatarData(n.dataCompra)}</TableCell>
                  <TableCell className="max-w-40 truncate font-medium md:max-w-none">
                    <Link href={`/notas/${n.id}`} className="hover:underline">
                      {n.fornecedor.nome}
                    </Link>
                  </TableCell>
                  <TableCell>{n.numero}</TableCell>
                  <TableCell className="hidden md:table-cell">{FORMA_LABELS[n.formaPagto]}</TableCell>
                  <TableCell className="hidden md:table-cell">{n._count.itens}</TableCell>
                  <TableCell>
                    <Badge variant={pagas === n.parcelas.length ? "secondary" : "outline"}>
                      {pagas}/{n.parcelas.length} pagas
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatarMoeda(n.totalCents)}
                  </TableCell>
                </TableRow>
              );
            })}
            {notas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhuma nota encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
