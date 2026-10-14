import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaRateio } from "@/services/obras";
import { NotaForm } from "../nota-form";
import { Button } from "@/components/ui/button";
import { FileCode2 } from "lucide-react";

export default async function NovaNotaPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");

  const [fornecedores, obras] = await Promise.all([
    prisma.fornecedor.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cnpj: true },
    }),
    listarObrasParaRateio(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Novo lançamento</h1>
        <Button variant="outline" size="sm" render={<Link href="/notas/importar-xml" />}>
          <FileCode2 className="size-4" /> Importar XML da NF-e
        </Button>
      </div>
      <NotaForm fornecedores={fornecedores} obras={obras} />
    </div>
  );
}
