import { Carregando, CabecalhoSkeleton } from "@/components/carregando";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="o diário de obra">
      <CabecalhoSkeleton titulo="w-60" acoes={["hidden w-44 md:block"]} />
      <div className="grid gap-2">
        <Skeleton className="h-5 w-12" />
        <div className="flex gap-2">
          <Skeleton className="h-14 flex-1 md:max-w-xs" />
          <Skeleton className="h-14 w-24" />
        </div>
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="grid gap-3">
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-5 w-28" />
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
