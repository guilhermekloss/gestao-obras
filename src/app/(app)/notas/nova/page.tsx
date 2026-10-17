import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaRateio } from "@/services/obras";
import { leituraAutomaticaDisponivel } from "@/services/leitor-nativo";
import { analiseIaDisponivel } from "@/services/leitor-gemini";
import { listarMateriais } from "@/services/materiais-db";
import { NovoLancamento } from "./novo-lancamento";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NovaNotaPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");

  const [fornecedores, obras, materiais] = await Promise.all([
    prisma.fornecedor.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cnpj: true },
    }),
    listarObrasParaRateio(),
    listarMateriais(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl md:text-3xl">Novo lançamento</h1>
      <NovoLancamento
        fornecedores={fornecedores}
        obras={obras}
        materiais={materiais}
        leituraAutomatica={leituraAutomaticaDisponivel()}
        analiseIa={analiseIaDisponivel()}
      />
    </div>
  );
}
