import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// Obra própria do teste: renomear, reordenar e a linha de base não mexem nos dados dos outros testes.
const SUFIXO = Date.now();
const CODIGO = `E2E-CRONO-${SUFIXO}`;
const EMAIL_CAMPO = `campo.crono-${SUFIXO}@obras.local`;
let obraId = "";

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

test.beforeAll(async () => {
  const obra = await prisma.obra.create({
    data: {
      nome: `Obra cronograma ${SUFIXO}`,
      codigo: CODIGO,
      etapas: {
        create: [
          { nome: "Fundação", ordem: 1, orcamentoCents: 100_000, inicioPrevisto: dia("2026-01-05"), fimPrevisto: dia("2026-02-27") },
          { nome: "Estrutura", ordem: 2, orcamentoCents: 300_000, inicioPrevisto: dia("2026-03-02"), fimPrevisto: dia("2026-05-29") },
        ],
      },
    },
    select: { id: true },
  });
  obraId = obra.id;
  await prisma.usuario.create({
    data: {
      nome: "Campo Cronograma",
      email: EMAIL_CAMPO,
      senhaHash: await hash("campo123", 10),
      role: "CAMPO",
      assistenteVistoEm: new Date(),
    },
  });
});

test.afterAll(async () => {
  await prisma.obra.deleteMany({ where: { codigo: CODIGO } });
  await prisma.usuario.deleteMany({ where: { email: EMAIL_CAMPO } });
});

async function login(page: Page, email: string, senha: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("ADMIN renomeia e reordena etapas e salva a linha de base", async ({ page }) => {
  await login(page, "admin@obras.local", "admin123");

  await page.goto(`/obras/${obraId}`);
  await page.getByRole("button", { name: "Renomear a etapa Estrutura" }).click();
  await page.getByLabel("Nome da etapa").fill("Estrutura e lajes");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByText("Estrutura e lajes")).toBeVisible();

  await page.getByRole("button", { name: "Mover a etapa Estrutura e lajes para cima" }).click();
  await expect(page.getByRole("button", { name: "Mover a etapa Estrutura e lajes para cima" })).toBeDisabled();
  await expect
    .poll(async () => (await prisma.etapa.findMany({ where: { obraId }, orderBy: { ordem: "asc" } })).map((e) => e.nome))
    .toEqual(["Estrutura e lajes", "Fundação"]);

  await page.goto(`/cronograma?obra=${obraId}`);
  await page.locator("#salvar-linha-base").click();
  await page.getByLabel("Nome (opcional)").fill("Contrato");
  await page.getByRole("button", { name: "Confirmar e salvar linha de base" }).click();
  await expect(page.getByText("Linha de base: Contrato")).toBeVisible();
  await expect(page.getByText(/Previsto pela linha de base de/)).toBeVisible();

  const csv = await (await page.request.get(`/cronograma/exportar?obra=${obraId}`)).text();
  expect(csv.startsWith("﻿Etapa;")).toBe(true);
  expect(csv).toContain("Peso (%)");
  expect(csv).toContain("Estrutura e lajes;02/03/2026;29/05/2026;89;");
});

test("CAMPO exporta o cronograma sem o peso e não vê os botões de planejamento", async ({ page }) => {
  await login(page, EMAIL_CAMPO, "campo123");
  await page.goto(`/cronograma?obra=${obraId}`);
  await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeVisible();
  await expect(page.locator("#salvar-linha-base")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar datas" })).toHaveCount(0);

  const resposta = await page.request.get(`/cronograma/exportar?obra=${obraId}`);
  expect(resposta.status()).toBe(200);
  const csv = await resposta.text();
  expect(csv).toContain("Etapa;Início;Fim");
  expect(csv).not.toContain("Peso");
});

test("exportar exige login e uma obra válida", async ({ page, request }) => {
  expect((await request.get(`/cronograma/exportar?obra=${obraId}`, { maxRedirects: 0 })).status()).toBe(401);
  await login(page, "admin@obras.local", "admin123");
  expect((await page.request.get("/cronograma/exportar?obra=nao-existe")).status()).toBe(404);
  expect((await page.request.get("/cronograma/exportar")).status()).toBe(400);
});
