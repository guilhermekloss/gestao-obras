import { Carregando, CabecalhoSkeleton } from "@/components/carregando";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="as obras">
      <CabecalhoSkeleton titulo="w-32" acoes={["w-32"]} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="h-full">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-5 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Carregando>
  );
}
