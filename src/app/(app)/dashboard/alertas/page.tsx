import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPapel } from "@/lib/auth";
import { carregarAlertas } from "@/services/analises";
import { AlertasLista } from "../alertas-lista";

export default async function AlertasPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const alertas = await carregarAlertas();
  const criticos = alertas.filter((a) => a.severidade === "CRITICA").length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl">Alertas</h1>
        <p className="text-sm text-muted-foreground">
          {alertas.length} alerta(s) · {criticos} crítico(s). Estouro de orçamento por etapa,
          etapas com 90% ou mais consumido, parcelas vencidas em aberto e notas com divergência
          itens × total.
        </p>
      </div>
      <AlertasLista alertas={alertas} />
    </div>
  );
}
