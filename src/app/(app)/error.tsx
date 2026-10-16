"use client";

import { ErroDePagina } from "@/components/erro-de-pagina";

export default function Erro(props: { error: unknown; retry: () => void }) {
  return <ErroDePagina {...props} />;
}
