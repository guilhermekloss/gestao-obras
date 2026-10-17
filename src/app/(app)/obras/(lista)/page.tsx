import type { Metadata } from "next";
import { formatarCno } from "@/services/cno";
import { podeEditarCadastros } from "@/services/acesso";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { whereObrasPermitidas } from "@/services/acesso";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusObraBadge } from "@/components/status-obra-badge";
import { NovaObraDialog } from "../obra-dialogs";
import { formatarData } from "@/lib/format";
import { EstadoVazio } from "@/components/estado-vazio";
import { Building2 } from "lucide-react";

export const metadata: Metadata = { title: "Obras" };

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
        <h1 className="text-2xl md:text-3xl">Obras</h1>
        {podeEditar && obras.length > 0 && <NovaObraDialog />}
      </div>

      {obras.length === 0 ? (
        user.obrasPermitidas === null ? (
          <EstadoVazio
            icone={Building2}
            titulo="Nenhuma obra cadastrada"
            acao={podeEditar && <NovaObraDialog rotulo="Cadastrar obra" grande />}
          >
            {podeEditar
              ? "Cadastre a primeira obra para lançar notas, registrar o diário e acompanhar o avanço."
              : "Peça ao escritório para cadastrar a primeira obra."}
          </EstadoVazio>
        ) : (
          <EstadoVazio icone={Building2} titulo="Nenhuma obra liberada para você">
            Peça ao administrador para liberar o seu acesso.
          </EstadoVazio>
        )
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
                  {obra.cno && <p>CNO: {formatarCno(obra.cno)}</p>}
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
