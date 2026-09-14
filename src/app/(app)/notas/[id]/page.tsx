import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { NotaForm } from "../nota-form";
import { ConfirmButton } from "@/components/confirm-button";
import { excluirNota } from "../actions";
import { Trash2 } from "lucide-react";

function centsParaStr(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default async function EditarNotaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { id } = await params;

  const [nota, fornecedores, obras] = await Promise.all([
    prisma.notaFiscal.findUnique({
      where: { id },
      include: {
        itens: { include: { rateios: true } },
        parcelas: { orderBy: { numero: "asc" } },
      },
    }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, cnpj: true } }),
    prisma.obra.findMany({
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        nome: true,
        etapas: { orderBy: { ordem: "asc" }, select: { id: true, nome: true } },
      },
    }),
  ]);
  if (!nota) notFound();

  // O rateio é o mesmo para todos os itens da nota — deriva do primeiro item.
  const rateiosBase = nota.itens[0]?.rateios ?? [];

  const defaultValues = {
    fornecedorId: nota.fornecedorId,
    numero: nota.numero,
    dataCompra: nota.dataCompra.toISOString().slice(0, 10),
    total: centsParaStr(nota.totalCents),
    formaPagto: nota.formaPagto,
    numParcelas: String(nota.parcelas.length),
    obs: nota.obs ?? "",
    anexoUrl: nota.anexoUrl ?? undefined,
    anexoNome: nota.anexoNome ?? undefined,
    itens: nota.itens.map((i) => ({
      descricao: i.descricao,
      tipo: i.tipo,
      qtde: String(i.qtde).replace(".", ","),
      unidade: i.unidade,
      unit: centsParaStr(i.unitCents),
      desconto: i.descontoCents ? centsParaStr(i.descontoCents) : "",
    })),
    rateios: rateiosBase.map((r) => ({
      obraId: r.obraId,
      etapaId: r.etapaId ?? "",
      percent: (r.fracaoBp / 100).toFixed(2).replace(".", ","),
    })),
    parcelas: nota.parcelas.map((p) => ({
      numero: p.numero,
      valor: centsParaStr(p.valorCents),
      vencimento: p.vencimento.toISOString().slice(0, 10),
    })),
  };

  const temParcelaPaga = nota.parcelas.some((p) => p.status === "PAGA");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Editar NF {nota.numero}</h1>
        {!temParcelaPaga && (
          <ConfirmButton
            action={excluirNota.bind(null, nota.id)}
            mensagem={`Excluir a NF ${nota.numero}? Itens, rateios e parcelas serão removidos.`}
          >
            <Trash2 className="size-4" /> Excluir
          </ConfirmButton>
        )}
      </div>
      {temParcelaPaga && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Esta nota tem parcelas pagas. Ao salvar, as parcelas serão recriadas como abertas — confira os pagamentos depois.
        </p>
      )}
      <NotaForm
        fornecedores={fornecedores}
        obras={obras}
        defaultValues={defaultValues}
        notaId={nota.id}
      />
    </div>
  );
}
