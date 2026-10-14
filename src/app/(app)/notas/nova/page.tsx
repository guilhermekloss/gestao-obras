import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaRateio } from "@/services/obras";
import { leituraAutomaticaDisponivel } from "@/services/leitor-ia";
import { NovoLancamento } from "./novo-lancamento";

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
      <h1 className="text-2xl font-semibold">Novo lançamento</h1>
      <NovoLancamento
        fornecedores={fornecedores}
        obras={obras}
        leituraAutomatica={leituraAutomaticaDisponivel()}
      />
    </div>
  );
}
