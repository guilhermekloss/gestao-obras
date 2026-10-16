import Link from "next/link";
import { FileQuestion, House } from "lucide-react";
import { AvisoDePagina } from "@/components/aviso-de-pagina";
import { buttonVariants } from "@/components/ui/button";

export function NaoEncontrado() {
  return (
    <AvisoDePagina
      icone={FileQuestion}
      tom="neutro"
      titulo="Página não encontrada"
      acoes={
        <Link href="/" className={buttonVariants()}>
          <House className="size-4" /> Voltar ao início
        </Link>
      }
    >
      <p>O endereço pode estar errado ou o registro foi excluído.</p>
      <p>Também pode ser que você não tenha acesso a ele.</p>
    </AvisoDePagina>
  );
}
