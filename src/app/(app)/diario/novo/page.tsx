import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { RdoForm } from "./rdo-form";

export default async function NovoRdoPage() {
  await exigirPapel();

  const obras = await prisma.obra.findMany({
    where: { status: { in: ["PLANEJAMENTO", "ANDAMENTO"] } },
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo RDO</h1>
      <RdoForm obras={obras} />
    </div>
  );
}
