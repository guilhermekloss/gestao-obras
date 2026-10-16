import { Carregando } from "@/components/carregando";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="o dashboard" className="space-y-8">
      <Skeleton className="h-8 w-44 md:h-10" />

      <section className="space-y-3">
        <Skeleton className="h-7 w-44" />
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex min-h-11 items-center gap-3 border-l-4 border-l-border px-3 py-2">
              <Skeleton className="hidden h-6 w-24 shrink-0 sm:block" />
              <Skeleton className="h-5 flex-1" />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            // mesma linha de cota da tela: traço com marca nas pontas
            <div key={i} className="relative border-t border-foreground/60 pt-2">
              <span aria-hidden className="absolute -top-1.5 left-0 h-3 w-px bg-foreground/60" />
              <span aria-hidden className="absolute -top-1.5 right-0 h-3 w-px bg-foreground/60" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-1 h-9 w-36" />
              <Skeleton className="mt-1 h-5 w-32" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[0, 1, 2, 3, 4].map((j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-16 shrink-0" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-12 shrink-0" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </Carregando>
  );
}
