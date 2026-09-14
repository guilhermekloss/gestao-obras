import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { NotaForm } from "../nota-form";
import { ConfirmButton } from "@/components/confirm-button";
import { excluirNota } from "../actions";
import { listarObrasParaRateio } from "@/services/obras";
import { centsParaEditavel, dataParaInput, percentBpParaEditavel } from "@/lib/format";
import { Trash2 } from "lucide-react";

export default async function EditarNotaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { id } = await params;

  const nota = await prisma.notaFiscal.findUnique({
    where: { id },
    include: {
      itens: true,
      rateios: true,
      parcelas: { orderBy: { numero: "asc" } },
    },
  });
  if (!nota) notFound();

  const [fornecedores, obras] = await Promise.all([
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, cnpj: true } }),
    // além das obras ativas, inclui as já usadas nesta nota (podem ter sido
    // concluídas/pausadas depois do lançamento original).
    listarObrasParaRateio(nota.rateios.map((r) => r.obraId)),
  ]);

  const defaultValues = {
    fornecedorId: nota.fornecedorId,
    numero: nota.numero,
    dataCompra: dataParaInput(nota.dataCompra),
    total: centsParaEditavel(nota.totalCents),
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
      unit: centsParaEditavel(i.unitCents),
      desconto: i.descontoCents ? centsParaEditavel(i.descontoCents) : "",
    })),
    rateios: nota.rateios.map((r) => ({
      obraId: r.obraId,
      etapaId: r.etapaId ?? "",
      percent: percentBpParaEditavel(r.fracaoBp),
    })),
    parcelas: nota.parcelas.map((p) => ({
      numero: p.numero,
      valor: centsParaEditavel(p.valorCents),
      vencimento: dataParaInput(p.vencimento),
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
          Esta nota tem parcelas pagas. Ao salvar, as parcelas serão recriadas como abertas — o sistema vai pedir confirmação antes.
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
