import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { NotaForm } from "../nota-form";

export default async function NovaNotaPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");

  const [fornecedores, obras] = await Promise.all([
    prisma.fornecedor.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cnpj: true },
    }),
    prisma.obra.findMany({
      where: { status: { in: ["PLANEJAMENTO", "ANDAMENTO"] } },
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        nome: true,
        etapas: { orderBy: { ordem: "asc" }, select: { id: true, nome: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Nova nota fiscal</h1>
      <NotaForm fornecedores={fornecedores} obras={obras} />
    </div>
  );
}
