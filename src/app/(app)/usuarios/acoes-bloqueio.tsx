"use client";

import { LockOpen } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { liberarBloqueio } from "./actions";

export function LiberarBloqueio({ id, origem }: { id: string; origem: string }) {
  return (
    <ConfirmButton
      action={liberarBloqueio.bind(null, id)}
      mensagem={`Liberar o acesso de ${origem} agora? Se as falhas continuarem, o próximo bloqueio será mais longo.`}
      variant="outline"
      size="sm"
    >
      <LockOpen className="size-4" /> <span className="hidden sm:inline">Liberar agora</span>
    </ConfirmButton>
  );
}
