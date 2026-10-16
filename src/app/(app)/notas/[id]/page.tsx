import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { NotaForm } from "../nota-form";
import { ConfirmButton } from "@/components/confirm-button";
import { excluirNota } from "../actions";
import { listarObrasParaRateio } from "@/services/obras";
import { listarMateriais } from "@/services/materiais-db";
import { centsParaEditavel, dataParaInput, percentBpParaEditavel } from "@/lib/format";
import { TIPO_DOCUMENTO_BADGE } from "@/services/financeiro";
import type { ParcelaExistente } from "@/services/parcelas";
import { Trash2, TriangleAlert } from "lucide-react";

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

  const [fornecedores, obras, materiais] = await Promise.all([
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, cnpj: true } }),
    // inclui as obras já usadas nesta nota, mesmo concluídas/pausadas depois
    listarObrasParaRateio(nota.rateios.map((r) => r.obraId)),
    listarMateriais(nota.itens.map((i) => i.materialId).filter((m): m is string => !!m)),
  ]);

  const defaultValues = {
    fornecedorId: nota.fornecedorId,
    tipoDocumento: nota.tipoDocumento,
    numero: nota.numero,
    dataCompra: dataParaInput(nota.dataCompra),
    total: centsParaEditavel(nota.totalCents),
    formaPagto: nota.formaPagto,
    numParcelas: String(nota.parcelas.length),
    obs: nota.obs ?? "",
    anexoUrl: nota.anexoUrl ?? undefined,
    anexoNome: nota.anexoNome ?? undefined,
    itens: nota.itens.map((i) => ({
      materialId: i.materialId ?? "",
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

  // mesmo formato que `salvarNota` compara (ver `parcelasExistentes` em actions.ts)
  const parcelasExistentes: ParcelaExistente[] = nota.parcelas.map((p) => ({
    numero: p.numero,
    valorCents: p.valorCents,
    vencimento: dataParaInput(p.vencimento),
    status: p.status,
    pagaEm: p.pagaEm,
  }));
  const temParcelaPaga = nota.parcelas.some((p) => p.status === "PAGA");
  const documento = `${TIPO_DOCUMENTO_BADGE[nota.tipoDocumento]} ${nota.numero}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl md:text-3xl">Editar {documento}</h1>
        {!temParcelaPaga && (
          <ConfirmButton
            action={excluirNota.bind(null, nota.id)}
            mensagem={`Excluir o lançamento ${documento}? Itens, rateios e parcelas serão removidos.`}
          >
            <Trash2 className="size-4" /> Excluir lançamento
          </ConfirmButton>
        )}
      </div>
      {nota.chaveNfe && (
        <p className="text-sm text-muted-foreground">
          Importada do XML · chave NF-e <span className="font-mono break-all">{nota.chaveNfe}</span>
        </p>
      )}
      {temParcelaPaga && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Este lançamento tem parcelas pagas. Elas continuam pagas se o valor e o vencimento não mudarem. Se
            você alterar ou remover uma parcela paga, o sistema pede confirmação antes de reabri-la.
          </span>
        </p>
      )}
      <NotaForm
        fornecedores={fornecedores}
        obras={obras}
        defaultValues={defaultValues}
        notaId={nota.id}
        materiais={materiais}
        parcelasExistentes={parcelasExistentes}
      />
    </div>
  );
}
