import { Carregando, CabecalhoSkeleton, FiltrosSkeleton, TabelaSkeleton } from "@/components/carregando";
import { Skeleton } from "@/components/ui/skeleton";

const CHIPS = ["w-28", "w-36", "w-32", "w-24", "w-24", "w-32", "w-20"];

export default function Loading() {
  return (
    <Carregando tela="as contas a pagar">
      <CabecalhoSkeleton titulo="w-64" acoes={["w-36"]} />
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((largura, i) => (
          <Skeleton key={i} className={`h-10 ${largura}`} />
        ))}
      </div>
      <FiltrosSkeleton campos={["w-40", "w-48", "w-44"]} />
      <Skeleton className="h-5 w-64" />
      <TabelaSkeleton
        colunas={[
          { largura: "w-4" },
          { largura: "w-24" },
          { largura: "w-36" },
          { largura: "w-28", classe: "hidden md:table-cell" },
          { largura: "w-32", classe: "hidden lg:table-cell" },
          { largura: "w-10" },
          { largura: "w-20" },
          { largura: "w-24", direita: true },
        ]}
      />
    </Carregando>
  );
}
