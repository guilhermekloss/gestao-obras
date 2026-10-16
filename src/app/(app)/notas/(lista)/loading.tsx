import { Carregando, CabecalhoSkeleton, FiltrosSkeleton, TabelaSkeleton } from "@/components/carregando";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Carregando tela="os lançamentos">
      <CabecalhoSkeleton titulo="w-52" acoes={["w-36", "w-44"]} />
      <FiltrosSkeleton campos={["w-48", "w-40", "w-44", "w-36", "w-36"]} />
      <Skeleton className="h-5 w-56" />
      <TabelaSkeleton
        colunas={[
          { largura: "w-20" },
          { largura: "w-36" },
          { largura: "w-28" },
          { largura: "w-16", classe: "hidden md:table-cell" },
          { largura: "w-8", classe: "hidden md:table-cell" },
          { largura: "w-16" },
          { largura: "w-24", direita: true },
        ]}
      />
    </Carregando>
  );
}
