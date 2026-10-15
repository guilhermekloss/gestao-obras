import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmButton } from "@/components/confirm-button";
import { NovoFornecedorDialog, EditarFornecedorDialog } from "./fornecedor-dialogs";
import { DependenciaBadge } from "./dependencia-badge";
import { excluirFornecedor } from "./actions";
import { calcularDependencia } from "@/services/dependencia";
import { formatarMoeda } from "@/lib/format";
import { ChevronRight, Trash2 } from "lucide-react";

export default async function FornecedoresPage() {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");

  const [fornecedores, dependencia] = await Promise.all([
    prisma.fornecedor.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { notas: true } } },
    }),
    calcularDependencia(),
  ]);

  const linhas = fornecedores
    .map((f) => ({ f, dep: dependencia.get(f.id) ?? null }))
    .sort((a, b) => (b.dep?.score ?? -1) - (a.dep?.score ?? -1));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Fornecedores</h1>
        <NovoFornecedorDialog />
      </div>

      {fornecedores.length === 0 ? (
        <p className="text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Gasto total</TableHead>
                <TableHead className="text-right">NFs</TableHead>
                <TableHead>Dependência</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(({ f, dep }) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/fornecedores/${f.id}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {f.nome}
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{f.cnpj ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    {dep ? formatarMoeda(dep.gastoCents) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{f._count.notas}</TableCell>
                  <TableCell>
                    {dep ? (
                      <DependenciaBadge nivel={dep.nivel} score={dep.score} />
                    ) : (
                      <span className="text-xs text-muted-foreground">sem compras</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <EditarFornecedorDialog fornecedor={f} />
                      {user.role === "ADMIN" && (
                        <ConfirmButton
                          action={excluirFornecedor.bind(null, f.id)}
                          mensagem={`Excluir o fornecedor "${f.nome}"?`}
                          variant="ghost"
                          size="icon"
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </ConfirmButton>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
