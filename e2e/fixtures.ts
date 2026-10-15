import { test as base, expect } from "@playwright/test";

/**
 * `test` dos e2e: falha se o navegador registrar violação da
 * Content-Security-Policy (script, estilo, imagem ou frame bloqueado) em
 * qualquer página visitada — pega na hora uma mudança que a CSP quebraria.
 */
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
