import type { Metadata } from "next";
import { NaoEncontrado } from "@/components/nao-encontrado";

// Endereço que não existe em lugar nenhum do app: aparece sem a casca (menu e cabeçalho).

export const metadata: Metadata = { title: "Página não encontrada" };
export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <NaoEncontrado />
    </main>
  );
}
