import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    locale: "pt-BR",
    // ação ou navegação presa falha dizendo qual foi, em vez de estourar o tempo do teste sem contexto
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: process.env.CI ? "HOSTNAME=0.0.0.0 node .next/standalone/server.js" : "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
