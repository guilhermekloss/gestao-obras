import type { Role } from "@prisma/client";

// Sem valores em reais nem telas financeiras para CAMPO.
export const BOAS_VINDAS: Record<Role, string[]> = {
  ADMIN: [
    "Você acompanha obras, notas, contas a pagar, cronograma e orçamento em um só lugar.",
    "Também cadastra usuários e define o que cada pessoa pode ver.",
    "O assistente mostra onde cada coisa está e como fazer, passo a passo.",
  ],
  ESCRITORIO: [
    "Você lança notas, acompanha contas a pagar e mantém fornecedores e materiais em dia.",
    "Também confere o diário de obra e o cronograma de cada obra.",
    "O assistente mostra onde cada coisa está e como fazer, passo a passo.",
  ],
  CAMPO: [
    "Você registra o diário de obra do dia, com condição do tempo, equipe e fotos.",
    "Também acompanha o cronograma das obras em que trabalha.",
    "O assistente mostra onde cada coisa está e como fazer, passo a passo.",
  ],
};

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}
