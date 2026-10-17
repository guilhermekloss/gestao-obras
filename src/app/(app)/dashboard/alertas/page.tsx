import type { Metadata } from "next";
import { LinkVoltar } from "@/components/link-voltar";
import { exigirPapel } from "@/lib/auth";
import { carregarAlertas } from "@/services/analises";
import { AlertasLista } from "../alertas-lista";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertasPage() {
  const usuario = await exigirPapel("ADMIN", "ESCRITORIO");
  const alertas = await carregarAlertas(new Date(), { paraAdmin: usuario.role === "ADMIN" });
  const criticos = alertas.filter((a) => a.severidade === "CRITICA").length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <LinkVoltar href="/dashboard">Dashboard</LinkVoltar>
        <h1 className="text-2xl md:text-3xl">Alertas</h1>
        <p className="text-sm text-muted-foreground">
          {alertas.length} alerta(s) · {criticos} crítico(s). Estouro de orçamento por etapa,
          etapas com 90% ou mais consumido, parcelas vencidas em aberto, notas com divergência
          itens × total e NF-e recebidas da Sefaz paradas.
        </p>
      </div>
      <AlertasLista alertas={alertas} />
    </div>
  );
}
