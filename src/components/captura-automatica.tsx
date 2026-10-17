"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_MS = 30 * 60 * 1000;
const ENTRE_CHAMADAS_MS = 15 * 60 * 1000;

let ultimaChamada = 0;

/**
 * Enquanto a captura de NF-e está ligada e alguém usa o sistema, avisa o servidor de tempos em tempos. Quem decide
 * se consulta a Sefaz é o servidor: só nos horários programados em Empresa (1 ou 2 vezes ao dia) e respeitando a
 * espera de 1 h da Sefaz. Aqui só se bate na porta, sem renderizar nada; a maioria das chamadas não faz nada.
 */
export function CapturaAutomatica() {
  const router = useRouter();
  useEffect(() => {
    let ativo = true;
    async function cutucar() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaChamada < ENTRE_CHAMADAS_MS) return;
      ultimaChamada = Date.now();
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
