import Link from "next/link";
import { cn } from "@/lib/utils";

export type AbaDaPagina = {
  key: string;
  label: string;
  href: string;
  /** Contagem ou selo ao lado do nome. */
  extra?: React.ReactNode;
};

/** Abas que trocam de endereço (`?aba=`). Alvo de toque de 44 px e aba atual marcada para leitor de tela. */
export function AbasDaPagina({
  rotulo,
  abas,
  ativa,
}: {
  /** Nome do grupo para leitor de tela ("Seções da obra"). */
  rotulo: string;
  abas: AbaDaPagina[];
  ativa: string;
}) {
  return (
    <nav aria-label={rotulo} className="flex gap-1 overflow-x-auto border-b">
      {abas.map((a) => (
        <Link
          key={a.key}
          href={a.href}
          aria-current={a.key === ativa ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
            a.key === ativa
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {a.label}
          {a.extra}
        </Link>
      ))}
    </nav>
  );
}
