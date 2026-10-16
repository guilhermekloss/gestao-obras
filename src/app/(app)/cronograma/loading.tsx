import { Carregando, CabecalhoSkeleton } from "@/components/carregando";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="o cronograma" className="space-y-4">
      <div className="space-y-2">
        <CabecalhoSkeleton titulo="w-52" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="flex items-end gap-2">
        <div className="grid gap-1">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-10 w-56" />
        </div>
        <Skeleton className="h-10 w-16" />
      </div>
      <div className="flex gap-1 border-b">
        {["w-28", "w-20"].map((largura) => (
          <div key={largura} className="flex min-h-10 items-center px-3 py-2">
            <Skeleton className={`h-5 ${largura}`} />
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 border-t pt-3">
              <Skeleton className="h-5 w-24 shrink-0 sm:w-44" />
              <div className="relative h-5 flex-1">
                <Skeleton className="absolute inset-y-0.5 h-4" style={{ left: `${i * 14}%`, width: "28%" }} />
              </div>
              <Skeleton className="h-5 w-10 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64 max-w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </Carregando>
  );
}
