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
import { Badge } from "@/components/ui/badge";
import { NovoUsuarioDialog, EditarUsuarioDialog } from "./usuario-dialogs";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  ESCRITORIO: "Escritório",
  CAMPO: "Campo",
};

export default async function UsuariosPage() {
  await exigirPapel("ADMIN");

  const usuarios = await prisma.usuario.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, email: true, role: true, ativo: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <NovoUsuarioDialog />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell className="hidden md:table-cell">{u.email}</TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "secondary" : "outline"}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <EditarUsuarioDialog usuario={u} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
