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
import { excluirFornecedor } from "./actions";
import { Trash2 } from "lucide-react";

export default async function FornecedoresPage() {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");

  const fornecedores = await prisma.fornecedor.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { notas: true } } },
  });

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
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead className="text-right">NFs</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedores.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="hidden md:table-cell">{f.cnpj ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{f.fone ?? "—"}</TableCell>
                  <TableCell className="text-right">{f._count.notas}</TableCell>
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
