import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";

/** Fica fora da prévia para a tela de lançamento não carregar o leitor de XML só para mostrar o aviso. */
export function AvisoNotaExistente({ notaId, mensagem }: { notaId: string; mensagem: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{mensagem}</span>
      <Link href={`/notas/${notaId}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
        Abrir a nota <ExternalLink className="size-3.5" />
      </Link>
    </div>
  );
}
