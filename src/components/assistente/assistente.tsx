"use client";

import type { Role } from "@prisma/client";

export type AssistenteProps = {
  role: Role;
  nome: string;
  /** A pessoa ainda não passou pelo assistente: abre o pop-up de boas-vindas. */
  pendente: boolean;
  /** Há chave do Gemini no servidor: libera a aba de perguntas. */
  iaDisponivel: boolean;
};

// Casca: a interface completa entra na fase seguinte, sem mudar estas props.
export function Assistente(_props: AssistenteProps) {
  return null;
}
