"use client";

import { useEffect, useState } from "react";
import { ConferenciaTributaria } from "@/components/conferencia-tributaria";
import type { Nfe } from "@/services/nfe-xml";
import type { AchadoConferencia } from "@/services/tributacao/conferencia";
import { conferirTributacaoDaPrevia } from "./conferencia-actions";

/** Conferência do IBS/CBS da nota lida do XML. Falha em silêncio: é só um aviso a mais. */
export function ConferenciaDaPrevia({ nfe }: { nfe: Nfe }) {
  const [resultado, setResultado] = useState<{ nfe: Nfe; achados: AchadoConferencia[] } | null>(null);

  useEffect(() => {
    let cancelado = false;
    conferirTributacaoDaPrevia(nfe)
      .then((achados) => !cancelado && setResultado({ nfe, achados }))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [nfe]);

  // resultado de outra nota (troca de arquivo) não aparece
  if (resultado?.nfe !== nfe) return null;
  return <ConferenciaTributaria achados={resultado.achados} descricoes={nfe.itens.map((i) => i.descricao)} />;
}
