import type { Metadata } from "next";
import { exigirPapel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ImportarClient } from "./importar-client";

export const metadata: Metadata = { title: "Importar planilhas" };

export default async function ImportarPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const obras = await prisma.obra.findMany({
    orderBy: { codigo: "asc" },
    select: { codigo: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl md:text-3xl">Importar planilhas</h1>
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Formato esperado (CSV com cabeçalho, separado por ; ou ,):</p>
        <p className="mt-2">
          <strong>Itens:</strong> fornecedor; cnpj; nf; data; descricao; tipo; qtde;
          unidade; unitario; desconto; {obras.map((o) => o.codigo).join("; ") || "L03; L19"} —
          as colunas de obra recebem a fração destinada (%, quantidade ou 1), normalizada por linha.
        </p>
        <p className="mt-1">
          <strong>Financeiro:</strong> fornecedor; cnpj; nf; data; valor_total; forma;
          parcela1_valor; parcela1_venc; parcela1_pagoem; ... até parcela6.
        </p>
        <p className="mt-1">Datas em dd/mm/aaaa, valores em formato brasileiro (1.234,56).</p>
        <p className="mt-1">Notas já importadas (mesmo fornecedor + nº) são puladas — pode rodar de novo sem duplicar.</p>
      </div>
      <ImportarClient />
    </div>
  );
}
