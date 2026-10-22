import type { Metadata } from "next";
import { LinkVoltar } from "@/components/link-voltar";
import { exigirPapel, obraAutorizada } from "@/lib/auth";
import { carregarAlertas } from "@/services/analises";
import { AlertasLista } from "../alertas-lista";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  const usuario = await exigirPapel("ADMIN", "ESCRITORIO");
  const { obra: obraParam } = await searchParams;
  // mesmo filtro do dashboard; obra fora do acesso é ignorada
  const obra = obraParam ? await obraAutorizada(usuario, obraParam) : null;
  const alertas = await carregarAlertas(new Date(), {
    paraAdmin: usuario.role === "ADMIN",
    obraId: obra?.id,
  });
  const criticos = alertas.filter((a) => a.severidade === "CRITICA").length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <LinkVoltar href={obra ? `/dashboard?obra=${obra.id}` : "/dashboard"}>Dashboard</LinkVoltar>
        <h1 className="text-2xl md:text-3xl">{obra ? `Alertas · ${obra.nome}` : "Alertas"}</h1>
        <p className="text-sm text-muted-foreground">
          {alertas.length} alerta(s) · {criticos} crítico(s). Estouro de orçamento por etapa,
          etapas com 90% ou mais consumido, obras cuja tendência de custo passa do orçado em mais de 5%,
          parcelas vencidas em aberto, notas com divergência itens × total e NF-e recebidas da Sefaz paradas.
        </p>
      </div>
      <AlertasLista alertas={alertas} />
    </div>
  );
}
