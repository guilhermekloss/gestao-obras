"use client";

import { useEffect, useState } from "react";
import { ConferenciaTributaria } from "@/components/conferencia-tributaria";
import type { DadosImportaveis } from "@/services/documento-xml";
import type { AchadoConferencia } from "@/services/tributacao/conferencia";
import { conferirTributacaoDaPrevia, type NotaParaConferir } from "./conferencia-actions";

function notaParaConferir(dados: DadosImportaveis): NotaParaConferir {
  return {
    dataEmissao: dados.dataEmissao,
    crtEmitente: dados.crtEmitente,
    itens: dados.itens.map((i) => ({ ncm: i.ncm, nbs: i.nbs ?? null, ibsCbs: i.ibsCbs ?? null })),
    totaisIbsCbs: dados.totaisIbsCbs,
  };
}

// Sem IBS/CBS nos itens nem nos totais, só o regime normal gera aviso (o "sem destaque do fornecedor", que depende
// da data): para os demais a resposta só pode ser vazia, e a ida ao servidor é desperdício.
function haOQueConferir(nota: NotaParaConferir): boolean {
  return nota.crtEmitente === "3" || nota.totaisIbsCbs !== null || nota.itens.some((i) => i.ibsCbs);
}

/**
 * Conferência do IBS/CBS da nota lida do XML (NF-e ou NFS-e). Falha em silêncio: é só um aviso a mais.
 * Uma nota por vez: quem usa troca a `key` quando a nota muda, e o resultado da anterior não sobra.
 */
export function ConferenciaDaPrevia({ dados }: { dados: DadosImportaveis }) {
  const [achados, setAchados] = useState<AchadoConferencia[] | null>(null);

  useEffect(() => {
    const nota = notaParaConferir(dados);
    if (!haOQueConferir(nota)) return;
    let cancelado = false;
    conferirTributacaoDaPrevia(nota)
      .then((a) => !cancelado && setAchados(a))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [dados]);

  if (!achados) return null;
  return <ConferenciaTributaria achados={achados} descricoes={dados.itens.map((i) => i.descricao)} />;
}
