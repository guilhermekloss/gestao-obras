import { test as base, expect } from "@playwright/test";

// Fixture automática: reprova o teste se o console registrar violação de CSP.
export const test = base.extend<{ semViolacaoDeCsp: void }>({
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
