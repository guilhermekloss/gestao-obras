import { Carregando, CabecalhoSkeleton } from "@/components/carregando";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="o diário de obra">
      <CabecalhoSkeleton titulo="w-60" acoes={["w-44"]} />
      <div className="flex items-end gap-2">
        <div className="grid gap-1">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-10 w-48" />
        </div>
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
                <Skeleton className="size-8 shrink-0" />
              </div>
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Carregando>
  );
}
