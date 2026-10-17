import type { Role } from "@prisma/client";
import { naRota } from "@/components/nav-itens";
import { GUIAS } from "./guias";
import { TOURS } from "./tours";
import type { Guia, Tour } from "./tipos";

export type { Guia, PassoTour, Tour, MensagemChat, TelaSugerida } from "./tipos";

type Fontes = { guias?: Guia[]; tours?: Tour[] };

export function guiasPara(role: Role, { guias = GUIAS }: Fontes = {}): Guia[] {
  return guias.filter((g) => g.papeis.includes(role));
}

/** O guia da tela atual: o de rota mais específica (prefixo mais longo) entre os do papel. */
export function guiaDaRota(pathname: string, role: Role, fontes: Fontes = {}): Guia | null {
  let melhor: { guia: Guia; tamanho: number } | null = null;
  for (const guia of guiasPara(role, fontes)) {
    for (const rota of guia.rotas) {
      if (naRota(pathname, rota) && (!melhor || rota.length > melhor.tamanho)) {
        melhor = { guia, tamanho: rota.length };
      }
    }
  }
  return melhor?.guia ?? null;
}

export function tourDeBoasVindas(role: Role, { tours = TOURS }: Fontes = {}): Tour | null {
  return tours.find((t) => t.rotas.length === 0 && t.papeis.includes(role)) ?? null;
}

export function tourDaTela(pathname: string, role: Role, { tours = TOURS }: Fontes = {}): Tour | null {
  let melhor: { tour: Tour; tamanho: number } | null = null;
  for (const tour of tours) {
    if (!tour.papeis.includes(role)) continue;
    for (const rota of tour.rotas) {
      if (naRota(pathname, rota) && (!melhor || rota.length > melhor.tamanho)) {
        melhor = { tour, tamanho: rota.length };
      }
    }
  }
  return melhor?.tour ?? null;
}

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Todos os termos precisam aparecer em algum campo do guia; sem texto, devolve todos os guias do papel. */
export function buscarGuias(texto: string, role: Role, fontes: Fontes = {}): Guia[] {
  const termos = normalizarBusca(texto).split(/\s+/).filter(Boolean);
  const guias = guiasPara(role, fontes);
  if (termos.length === 0) return guias;
  return guias.filter((g) => {
    const palheiro = normalizarBusca(
      [g.titulo, g.paraQueServe, ...g.passoAPasso, ...g.regras, ...(g.dicas ?? [])].join(" "),
    );
    return termos.every((t) => palheiro.includes(t));
  });
}
