import type { PassoTour } from "@/services/assistente";

/** Mantém só os passos sem alvo ou cujo alvo existe e está visível agora; o tour pula os demais. */
export function passosVisiveis(passos: PassoTour[], existe: (seletor: string) => boolean): PassoTour[] {
  return passos.filter((p) => !p.alvo || existe(p.alvo));
}

function visivel(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  const estilo = getComputedStyle(el);
  return estilo.visibility !== "hidden" && estilo.display !== "none";
}

/** O primeiro elemento VISÍVEL do seletor: o menu existe duas vezes no DOM e uma delas fica oculta por CSS. */
export function elementoVisivel(seletor: string): HTMLElement | null {
  let achados: NodeListOf<HTMLElement>;
  try {
    achados = document.querySelectorAll<HTMLElement>(seletor);
  } catch {
    return null;
  }
  for (const el of achados) if (visivel(el)) return el;
  return null;
}
