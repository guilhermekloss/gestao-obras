import { test as base, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Quem já existe antes do teste conta como tendo passado pelo assistente: o pop-up de boas-vindas
// cobriria a tela. Quem testa o pop-up cria a própria pessoa (e-mail "assistente.*") dentro do teste;
// ela fica de fora, senão outro worker a marcaria como vista no meio da execução.
async function dispensarAssistente() {
  const prisma = new PrismaClient();
  try {
    await prisma.usuario.updateMany({ where: { assistenteVistoEm: null, NOT: { email: { startsWith: "assistente." } } }, data: { assistenteVistoEm: new Date() } });
  } finally {
    await prisma.$disconnect();
  }
}

// Fixtures automáticas: dispensam o assistente e reprovam o teste se o console registrar violação de CSP.
export const test = base.extend<{ semViolacaoDeCsp: void; assistenteDispensado: void }>({
  assistenteDispensado: [
    async ({}, use) => {
      await dispensarAssistente();
      await use();
    },
    { auto: true },
  ],
  semViolacaoDeCsp: [
    async ({ page }, use) => {
      const violacoes: string[] = [];
      page.on("console", (msg) => {
        if (/Content Security Policy/i.test(msg.text())) violacoes.push(msg.text());
      });
      await use();
      expect(violacoes, "violações de CSP no console").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
