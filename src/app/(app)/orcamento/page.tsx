import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { realizadoPorEtapa } from "@/lib/custos";
import { SelectNativo } from "@/components/select-nativo";
import { Button } from "@/components/ui/button";
import { OrcamentoForm, type LinhaOrcamento } from "./orcamento-form";

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { obra: obraParam } = await searchParams;

  const obras = await prisma.obra.findMany({
    orderBy: { codigo: "asc" },
    select: { id: true, nome: true },
  });
  const obraId = obraParam ?? obras[0]?.id;

  let linhas: LinhaOrcamento[] = [];
  if (obraId) {
    const [etapas, realizado] = await Promise.all([
      prisma.etapa.findMany({ where: { obraId }, orderBy: { ordem: "asc" } }),
      realizadoPorEtapa(obraId),
    ]);
    linhas = etapas.map((e) => ({
      etapaId: e.id,
      nome: e.nome,
      previstoCents: e.orcamentoCents,
      realizadoCents: realizado.get(e.id) ?? 0,
    }));
    const semEtapa = realizado.get(null) ?? 0;
    if (semEtapa > 0) {
      linhas.push({
        etapaId: null,
        nome: "Sem etapa definida",
        previstoCents: 0,
        realizadoCents: semEtapa,
      });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Orçamento vs. realizado</h1>

      <form method="get" className="flex items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <SelectNativo name="obra" defaultValue={obraId ?? ""} className="w-48">
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </SelectNativo>
        </div>
        <Button type="submit" variant="secondary" size="sm">Ver</Button>
      </form>

      {!obraId ? (
        <p className="text-muted-foreground">Cadastre uma obra primeiro.</p>
      ) : linhas.length === 0 ? (
        <p className="text-muted-foreground">Esta obra não tem etapas cadastradas.</p>
      ) : (
        <OrcamentoForm obraId={obraId} linhas={linhas} />
      )}
    </div>
  );
}
