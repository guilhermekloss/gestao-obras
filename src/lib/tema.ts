export type Tema = "claro" | "escuro";

export const COOKIE_TEMA = "tema";
const UM_ANO = 60 * 60 * 24 * 365;

// mesma cor do cabeçalho (token --barra-navegador em globals.css)
export const BARRA_NAVEGADOR: Record<Tema, string> = {
  claro: "#ffffff",
  escuro: "#132330",
};

// sem cookie, ou com valor estranho, vale o claro: é o que se lê melhor no sol do canteiro
export function lerTema(valor: string | undefined): Tema {
  return valor === "escuro" ? "escuro" : "claro";
}

export function outroTema(tema: Tema): Tema {
  return tema === "escuro" ? "claro" : "escuro";
}

export function cookieDoTema(tema: Tema): string {
  return `${COOKIE_TEMA}=${tema}; path=/; max-age=${UM_ANO}; samesite=lax`;
}
