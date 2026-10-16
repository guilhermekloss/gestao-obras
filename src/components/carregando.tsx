import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Invólucro dos esqueletos: avisa leitor de tela e some junto com a tela de verdade. */
export function Carregando({
  tela,
  className,
  children,
}: {
  tela: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-4", className)}>
      <span className="sr-only">Carregando {tela}…</span>
      {children}
    </div>
  );
}

/** Título da página e, à direita, os botões de ação (larguras como classes Tailwind). */
export function CabecalhoSkeleton({ titulo = "w-52", acoes = [] }: { titulo?: string; acoes?: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className={cn("h-8 md:h-10", titulo)} />
      {acoes.length > 0 && (
        <div className="flex gap-2">
          {acoes.map((largura) => (
            <Skeleton key={largura} className={cn("h-10", largura)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Linha de filtros: rótulo pequeno em cima de um campo de 45 px, mais o botão de filtrar. */
export function FiltrosSkeleton({ campos }: { campos: string[] }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {campos.map((largura, i) => (
        <div key={i} className="grid gap-1">
          <Skeleton className="h-4 w-14" />
          <Skeleton className={cn("h-10", largura)} />
        </div>
      ))}
      <Skeleton className="h-10 w-20" />
    </div>
  );
}

export type ColunaSkeleton = {
  /** largura do traço na linha, como classe Tailwind */
  largura: string;
  /** mesma visibilidade responsiva da coluna real (ex.: "hidden md:table-cell") */
  classe?: string;
  direita?: boolean;
};

/**
 * Lista com a mesma estrutura das telas: tabela quando cabe e, no celular, cartões
 * (o mesmo corte de `ListaDeDados`), com traços no lugar do texto.
 */
export function TabelaSkeleton({ colunas, linhas = 8 }: { colunas: ColunaSkeleton[]; linhas?: number }) {
  return (
    <div className="@container">
      <div aria-hidden className="hidden gap-2 cartao:grid">
        {Array.from({ length: Math.min(linhas, 6) }, (_, r) => (
          <div key={r} className="space-y-2 rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-md border cartao:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c, i) => (
                <TableHead key={i} className={c.classe}>
                  <Skeleton className={cn("h-4 w-16", c.direita && "ml-auto")} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: linhas }, (_, r) => (
              <TableRow key={r} className="hover:bg-transparent">
                {colunas.map((c, i) => (
                  <TableCell key={i} className={c.classe}>
                    <Skeleton className={cn("h-5 max-w-full", c.largura, c.direita && "ml-auto")} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
