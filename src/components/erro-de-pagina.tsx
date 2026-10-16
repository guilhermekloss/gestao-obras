"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCw, TriangleAlert } from "lucide-react";
import { AvisoDePagina } from "@/components/aviso-de-pagina";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Nada do erro vai para a tela: em produção o Next já esconde a mensagem, e aqui ela também não é mostrada.
 * O texto serve para falha do sistema e para tela sem permissão (que também chega aqui como erro).
 */
export function ErroDePagina({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <AvisoDePagina
        icone={TriangleAlert}
        tom="atencao"
        titulo="Não foi possível abrir esta tela"
        acoes={
          <>
            <Button onClick={() => retry()}>
              <RotateCw className="size-4" /> Tentar de novo
            </Button>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              <House className="size-4" /> Voltar ao início
            </Link>
          </>
        }
      >
        <p>Pode ser uma falha passageira ou falta de acesso a esta tela.</p>
        <p>Tente de novo. Se o aviso voltar, fale com o administrador.</p>
      </AvisoDePagina>
    </div>
  );
}
