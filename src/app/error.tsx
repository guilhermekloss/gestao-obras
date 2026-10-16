"use client";

import { ErroDePagina } from "@/components/erro-de-pagina";

// Falhas fora da casca do app (login, convite) e do próprio layout da casca, como banco fora do ar.
export default function Erro(props: { error: unknown; retry: () => void }) {
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <ErroDePagina {...props} />
    </main>
  );
}
