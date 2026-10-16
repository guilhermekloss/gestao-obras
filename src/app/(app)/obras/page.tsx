import { podeEditarCadastros } from "@/services/acesso";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { whereObrasPermitidas } from "@/services/acesso";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusObraBadge } from "@/components/status-obra-badge";
import { NovaObraDialog } from "./obra-dialogs";
import { formatarData } from "@/lib/format";

export default async function ObrasPage() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  const podeEditar = podeEditarCadastros(user.role);

  const obras = await prisma.obra.findMany({
    where: whereObrasPermitidas(user.obrasPermitidas),
    orderBy: { codigo: "asc" },
    include: { _count: { select: { etapas: true, diarios: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Obras</h1>
        {podeEditar && <NovaObraDialog />}
      </div>

      {obras.length === 0 ? (
        <p className="text-muted-foreground">
          {user.obrasPermitidas === null
            ? "Nenhuma obra cadastrada ainda."
            : "Nenhuma obra liberada para você — fale com o administrador."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {obras.map((obra) => (
            <Link key={obra.id} href={`/obras/${obra.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <CardTitle className="text-lg">{obra.nome}</CardTitle>
                  <StatusObraBadge status={obra.status} />
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>Código: {obra.codigo}</p>
                  {obra.cno && <p>CNO: {obra.cno}</p>}
                  {obra.inicioEm && <p>Início: {formatarData(obra.inicioEm)}</p>}
                  <p className="mt-2">
                    {obra._count.etapas} etapas · {obra._count.diarios} RDOs
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
