import { ESTADO } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import type { AchadoConferencia, Severidade } from "@/services/tributacao/conferencia";

const GRUPOS: { severidade: Severidade; titulo: string; estado: "atencao" | "neutro" }[] = [
  { severidade: "ATENCAO", titulo: "Vale conferir com o fornecedor", estado: "atencao" },
  { severidade: "INFO", titulo: "Para saber", estado: "neutro" },
];

/**
 * Avisos da conferência do IBS/CBS, agrupados por gravidade, cada um com o item a que se refere.
 * Só informa: não impede importar nem salvar a nota.
 */
export function ConferenciaTributaria({
  achados,
  descricoes,
  mostrarVazio = false,
}: {
  achados: readonly AchadoConferencia[];
  /** Descrição de cada item da nota, na ordem de `itemIndex`. */
  descricoes: readonly string[];
  /** Sem avisos: mostra uma linha dizendo que conferiu (na tela da nota); a prévia fica em silêncio. */
  mostrarVazio?: boolean;
}) {
  if (achados.length === 0)
    return mostrarVazio ? <p className="text-sm text-muted-foreground">Conferência do IBS/CBS: nada a apontar.</p> : null;

  return (
    <section aria-label="Conferência do IBS/CBS" className="grid gap-3">
      {GRUPOS.map(({ severidade, titulo, estado }) => {
        const lista = achados.filter((a) => a.severidade === severidade);
        if (lista.length === 0) return null;
        const { Icone, classe } = ESTADO[estado];
        return (
          <div key={severidade} className={cn("rounded-md border p-3 text-sm", classe)}>
            <p className="flex items-center gap-2 font-medium">
              <Icone aria-hidden className="size-4 shrink-0" />
              {titulo}
            </p>
            <ul className="mt-2 grid gap-1.5 pl-6">
              {lista.map((a, i) => (
                <li key={i} className="list-disc">
                  {a.itemIndex !== null && (
                    <span className="font-medium">
                      Item {a.itemIndex + 1}
                      {descricoes[a.itemIndex] ? ` (${descricoes[a.itemIndex]})` : ""}:{" "}
                    </span>
                  )}
                  {a.mensagem}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
