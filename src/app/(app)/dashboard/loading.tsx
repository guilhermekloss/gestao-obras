import { Carregando } from "@/components/carregando";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="o dashboard" className="space-y-10">
      <Skeleton className="h-8 w-44 md:h-10" />

      <section className="space-y-4">
        <Skeleton className="h-7 w-44" />
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2 rounded-xl border-l-4 border-l-border bg-card p-4 ring-1 ring-border">
              <Skeleton className="h-6 w-40" />
              <Skeleton className={i === 0 ? "h-12 w-56" : "h-9 w-16"} />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-11 w-36" />
            </div>
          ))}
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex min-h-11 items-center gap-3 border-l-4 border-l-border px-3 py-2">
              <Skeleton className="hidden h-6 w-24 shrink-0 sm:block" />
              <Skeleton className="h-5 flex-1" />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid items-start gap-x-8 gap-y-5 sm:grid-cols-[3fr_2fr]">
          {[0, 1].map((i) => (
            // mesma linha de cota da tela: traço com marca nas pontas
            <div key={i} className="relative border-t border-foreground/60 pt-2">
              <span aria-hidden className="absolute -top-1.5 left-0 h-3 w-px bg-foreground/60" />
              <span aria-hidden className="absolute -top-1.5 right-0 h-3 w-px bg-foreground/60" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className={i === 0 ? "mt-1 h-9 w-36" : "mt-1 h-7 w-12"} />
            </div>
          ))}
        </div>
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
        </div>
      </section>

      <section className="space-y-4">
        <Skeleton className="h-7 w-28" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-44" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </Carregando>
  );
}
