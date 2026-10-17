import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { realizadoPorEtapa } from "@/services/custos";
import { listarObrasParaFiltro } from "@/services/obras";
import { consumoBp, faixaConsumo } from "@/services/analises";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { Button } from "@/components/ui/button";
import { OrcamentoForm, type LinhaOrcamento, type TotalOrcamento } from "./orcamento-form";
import { ESTILO_FAIXA } from "./faixa";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orçamento" };

function comFaixa(previstoCents: number, realizadoCents: number) {
  return {
    previstoCents,
    realizadoCents,
    consumoBp: consumoBp(previstoCents, realizadoCents),
    faixa: faixaConsumo(previstoCents, realizadoCents),
  };
}

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { obra: obraParam } = await searchParams;

  const obras = await listarObrasParaFiltro();
  const obraId = obraParam ?? obras[0]?.id;

  let linhas: LinhaOrcamento[] = [];
  let total: TotalOrcamento = comFaixa(0, 0);
  if (obraId) {
    const [etapas, realizado] = await Promise.all([
      prisma.etapa.findMany({ where: { obraId }, orderBy: { ordem: "asc" } }),
      realizadoPorEtapa(obraId),
    ]);
    linhas = etapas.map((e) => ({
      etapaId: e.id,
      nome: e.nome,
      ...comFaixa(e.orcamentoCents, realizado.get(e.id) ?? 0),
    }));
    const semEtapa = realizado.get(null) ?? 0;
    if (semEtapa > 0) {
      linhas.push({
        etapaId: null,
        nome: "Sem etapa definida",
        ...comFaixa(0, semEtapa),
      });
    }
    // o realizado sem etapa também consome o orçamento da obra
    total = comFaixa(
      linhas.reduce((a, l) => a + l.previstoCents, 0),
      linhas.reduce((a, l) => a + l.realizadoCents, 0),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl">Orçamento vs. realizado</h1>
        <Button variant="outline" render={<Link href="/orcamento/abc" />}>
          <ChartColumn className="size-4" /> Curva ABC de insumos
        </Button>
      </div>

      <form method="get" className="flex items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="filtro-obra" className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            id="filtro-obra"
            name="obra"
            defaultValue={obraId ?? ""}
            placeholder="Buscar obra..."
            className="w-56"
            autoSubmit
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">Ver</Button>
      </form>

      {!obraId ? (
        <p className="text-muted-foreground">Cadastre uma obra primeiro.</p>
      ) : linhas.length === 0 ? (
        <p className="text-muted-foreground">Esta obra não tem etapas cadastradas.</p>
      ) : (
        <>
          <Legenda />
          <OrcamentoForm obraId={obraId} linhas={linhas} total={total} />
        </>
      )}
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["OK", "ATENCAO", "ESTOURO"] as const).map((f) => (
        <span key={f} className="flex items-center gap-1.5">
          <span className={cn("inline-block size-2.5 rounded-full", ESTILO_FAIXA[f].barra)} />
          {ESTILO_FAIXA[f].rotulo}
        </span>
      ))}
    </div>
  );
}
