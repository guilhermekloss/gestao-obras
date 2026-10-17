import type { Guia } from "./tipos";

// Fonte única do que o assistente explica: central de ajuda, tour e contexto da IA leem daqui.
export const GUIAS: Guia[] = [
  {
    id: "primeiros-passos",
    titulo: "Primeiros passos",
    papeis: ["ADMIN", "ESCRITORIO", "CAMPO"],
    link: "/obras",
    rotas: [],
    paraQueServe: "Entender como as telas se ligam.",
    passoAPasso: ["Abra o menu e escolha uma tela."],
    regras: [],
  },
];
