import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    locale: "pt-BR",
  },
  webServer: {
    // No CI o e2e roda contra o build de produção (o mesmo server.js da imagem do Cloud Run).
    command: process.env.CI ? "node .next/standalone/server.js" : "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
