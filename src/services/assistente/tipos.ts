import type { Role } from "@prisma/client";

export type Guia = {
  id: string;
  titulo: string;
  papeis: Role[];
  /** Rota do menu para onde o guia leva ("Ir para a tela"). */
  link: string;
  /** Rotas (prefixos) em que este guia é o "Nesta tela". */
  rotas: string[];
  paraQueServe: string;
  /** Rótulos exatos da interface entre aspas. */
  passoAPasso: string[];
  regras: string[];
  dicas?: string[];
};

export type PassoTour = {
  /** Seletor CSS do elemento destacado; sem alvo, o passo é um cartão centralizado. */
  alvo?: string;
  titulo: string;
  texto: string;
};

export type Tour = {
  id: string;
  papeis: Role[];
  /** Rotas (prefixos) em que o tour é oferecido; vazio = tour de boas-vindas. */
  rotas: string[];
  passos: PassoTour[];
};

export type MensagemChat = { autor: "pessoa" | "assistente"; texto: string };

export type TelaSugerida = { href: string; label: string };
