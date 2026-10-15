import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { podeVerObra } from "@/services/acesso";
import { StatusObraBadge } from "@/components/status-obra-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { EditarObraDialog } from "../obra-dialogs";
import { excluirObra } from "../actions";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { AbaResumo } from "./abas/resumo";
import { AbaCronograma } from "./abas/cronograma";
import { AbaDiario } from "./abas/diario";
import { AbaEquipe } from "./abas/equipe";
import type { Role } from "@prisma/client";

const TODOS: Role[] = ["ADMIN", "ESCRITORIO", "CAMPO"];
const ABAS = [
  { key: "resumo", label: "Resumo", Componente: AbaResumo, papeis: TODOS },
  { key: "cronograma", label: "Cronograma", Componente: AbaCronograma, papeis: TODOS },
  { key: "diario", label: "Diário", Componente: AbaDiario, papeis: TODOS },
  { key: "equipe", label: "Equipe", Componente: AbaEquipe, papeis: ["ADMIN", "ESCRITORIO"] as Role[] },
] as const;

export default async function ObraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  const podeEditar = user.role !== "CAMPO";
  const ehAdmin = user.role === "ADMIN";

  const [{ id }, { aba: abaParam }] = await Promise.all([params, searchParams]);
  if (!podeVerObra(user.obrasPermitidas, id)) notFound();
  const obra = await prisma.obra.findUnique({ where: { id } });
  if (!obra) notFound();

  const abas = ABAS.filter((a) => a.papeis.includes(user.role));
  const aba = abas.find((a) => a.key === abaParam) ?? abas[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{obra.nome}</h1>
          <StatusObraBadge status={obra.status} />
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <EditarObraDialog obra={obra} />
            {ehAdmin && (
              <ConfirmButton
                action={excluirObra.bind(null, obra.id)}
                mensagem={`Excluir a obra "${obra.nome}"? Esta ação não pode ser desfeita.`}
              >
                <Trash2 className="size-4" /> Excluir
              </ConfirmButton>
            )}
          </div>
        )}
      </div>

      <nav className="flex gap-1 border-b">
        {abas.map((a) => (
          <Link
            key={a.key}
            href={a.key === "resumo" ? `/obras/${obra.id}` : `/obras/${obra.id}?aba=${a.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              a.key === aba.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.label}
          </Link>
        ))}
      </nav>

      <aba.Componente obraId={obra.id} role={user.role} />
    </div>
  );
}
