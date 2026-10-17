import type { Tour } from "./tipos";

export const TOURS: Tour[] = [
  {
    id: "boas-vindas",
    papeis: ["ADMIN", "ESCRITORIO", "CAMPO"],
    rotas: [],
    passos: [
      { titulo: "Bem-vindo", texto: "Este é o tour de boas-vindas." },
      {
        alvo: '[data-assistente="botao"]',
        titulo: "Assistente",
        texto: "Este botão abre a ajuda a qualquer momento.",
      },
    ],
  },
];
