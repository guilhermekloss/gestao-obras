import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { fluxoMensal, parseSituacaoFluxo } from "@/services/financeiro";
import { SelectNativo } from "@/components/select-nativo";
import { formatarMoeda, rotuloChaveMes } from "@/lib/format";
import { listarObrasParaFiltro } from "@/services/obras";
import { ArrowLeft, ChartNoAxesColumn, ReceiptText } from "lucide-react";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";
import { veFinanceiro } from "@/services/acesso";

export const metadata: Metadata = { title: "Fluxo mensal por obra" };

export default async function FluxoMensalPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string }>;
}) {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");
  const situacao = parseSituacaoFluxo((await searchParams).situacao);

  const [parcelas, obras] = await Promise.all([
    prisma.parcela.findMany({
      where: situacao === "aberta" ? { status: "ABERTA" } : situacao === "paga" ? { status: "PAGA" } : undefined,
      include: {
        nota: { include: { rateios: true } },
      },
    }),
    listarObrasParaFiltro(),
  ]);

  const nomeObra = new Map(obras.map((o) => [o.id, o.nome]));

  const fluxo = fluxoMensal(
    parcelas.map((p) => ({
      valorCents: p.valorCents,
      vencimento: p.vencimento,
      rateios: p.nota.rateios.map((r) => ({
        obraId: r.obraId,
        fracaoBp: r.fracaoBp,
      })),
    })),
  );

  const obrasOrdenadas = [...fluxo.obras].sort((a, b) =>
    (nomeObra.get(a) ?? "").localeCompare(nomeObra.get(b) ?? ""),
  );

  // a última linha (mes: null) é o total por obra
  type Linha = { mes: string | null };
  const linhas: Linha[] = [...fluxo.meses.map((mes) => ({ mes })), { mes: null }];
  const totalGeral = Object.values(fluxo.totalPorMes).reduce((a, b) => a + b, 0);

  const colunas: ColunaDados<Linha>[] = [
    {
      id: "mes",
      titulo: "Mês",
      classe: "font-medium",
      celula: (l) => (l.mes === null ? <span className="font-semibold">Total</span> : rotuloChaveMes(l.mes)),
    },
    ...obrasOrdenadas.map<ColunaDados<Linha>>((id) => ({
      id,
      titulo: nomeObra.get(id) ?? id,
      numerica: true,
      classeCabecalho: "min-w-32",
      celula: (l) => {
        const v = l.mes === null ? (fluxo.totalPorObra[id] ?? 0) : (fluxo.valores[l.mes][id] ?? 0);
        return v ? formatarMoeda(v) : "—";
      },
    })),
    {
      id: "total",
      titulo: "Total",
      numerica: true,
      classe: "font-semibold",
      classeCabecalho: "min-w-32",
      celula: (l) => formatarMoeda(l.mes === null ? totalGeral : (fluxo.totalPorMes[l.mes] ?? 0)),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Voltar para contas a pagar" render={<Link href="/contas" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl md:text-3xl">Fluxo mensal por obra</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        O fluxo é pelo vencimento das parcelas (caixa). O Orçamento usa a data da compra (custo), por isso os
        valores de cada mês podem diferir.
      </p>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="filtro-situacao" className="text-xs text-muted-foreground">Situação</label>
          <SelectNativo id="filtro-situacao" name="situacao" defaultValue={situacao} className="w-44">
            <option value="todas">Todas</option>
            <option value="aberta">A pagar</option>
            <option value="paga">Pagas</option>
          </SelectNativo>
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      {fluxo.meses.length === 0 ? (
        <EstadoVazio
          icone={ChartNoAxesColumn}
          titulo={situacao === "todas" ? "Fluxo sem parcelas" : "Nenhuma parcela nesta situação"}
          acao={
            veFinanceiro(user.role) && (
              <AcaoVazio href="/notas/nova" icone={ReceiptText}>
                Lançar primeira nota
              </AcaoVazio>
            )
          }
        >
          O fluxo soma o que vence a cada mês, por obra. Ele aparece com a primeira nota parcelada.
        </EstadoVazio>
      ) : (
        <ListaDeDados
          modo="rolagem"
          legenda="Fluxo mensal por obra"
          linhas={linhas}
          chave={(l) => l.mes ?? "total"}
          colunas={colunas}
          classeDaLinha={(l) =>
            l.mes === null ? "bg-[color-mix(in_oklab,var(--card),var(--muted)_50%)] font-semibold" : undefined
          }
        />
      )}
    </div>
  );
}
