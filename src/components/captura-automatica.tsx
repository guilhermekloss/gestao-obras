"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_MS = 10 * 60 * 1000;

/**
 * Enquanto a captura de NF-e está ligada e alguém usa o sistema, pede ao servidor que confira a Sefaz a cada 10 min.
 * Quem decide se consulta de verdade é o servidor (janela de 1 h, trava); aqui só se bate na porta.
 * Sem renderizar nada.
 */
export function CapturaAutomatica() {
  const router = useRouter();
  useEffect(() => {
    let ativo = true;
    async function cutucar() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/sefaz/auto", { method: "POST" });
        const dados = (await r.json().catch(() => null)) as { novos?: number } | null;
        // chegou nota nova: atualiza contadores e listas da tela atual
        if (ativo && dados?.novos) router.refresh();
      } catch {
        // sem rede: tenta de novo no próximo ciclo
      }
    }
    void cutucar();
    const id = setInterval(cutucar, INTERVALO_MS);
    document.addEventListener("visibilitychange", cutucar);
    return () => {
      ativo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", cutucar);
    };
  }, [router]);
  return null;
}
