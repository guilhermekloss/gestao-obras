import type { Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { test, expect } from "./fixtures";
import { prisma } from "../src/lib/prisma";

const BASE_XML = readFileSync(path.join(__dirname, "..", "src", "services", "__tests__", "fixtures", "nfe-1-item.xml"), "utf8");
const comCno = (cno: string) =>
  BASE_XML.replace("</pag>", `</pag><infAdic><obsCont xCampo="CNO"><xTexto>${cno}</xTexto></obsCont></infAdic>`);

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@obras.local");
  await page.fill("#senha", "admin123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

async function enviarXml(page: Page, xml: string) {
  await page.goto("/notas/importar-xml");
  await page.locator('input[type="file"]').setInputFiles({ name: "nfe.xml", mimeType: "text/xml", buffer: Buffer.from(xml) });
  await expect(page.getByText("Rateio entre obras")).toBeVisible();
}

async function limpar() {
  await prisma.obra.deleteMany({ where: { codigo: { startsWith: "E2E-CNO" } } });
}

test.beforeEach(limpar);
test.afterEach(limpar);

test("o CNO da NF-e escolhe a obra do rateio", async ({ page }) => {
  await prisma.obra.create({ data: { codigo: "E2E-CNO-1", nome: "Lote CNO E2E", cno: "900001234567" } });
  await login(page);
  await enviarXml(page, comCno("90.000.12345/67"));
  await expect(page.getByText("CNO da obra")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Obra identificada pelo CNO 90.000.12345/67" })).toBeVisible();
});

test("CNO sem obra: grava na obra escolhida e a próxima nota já casa", async ({ page }) => {
  const obra = await prisma.obra.create({ data: { codigo: "E2E-CNO-2", nome: "Lote sem CNO E2E" } });
  await login(page);
  await enviarXml(page, comCno("11.111.11111/11"));
  const aviso = page.getByRole("status").filter({ hasText: "não está em nenhuma obra" });
  await expect(aviso).toBeVisible();

  const campo = page.getByPlaceholder("Escolher obra...");
  await campo.click();
  await campo.fill("Lote sem CNO E2E");
  await page.locator("ul li button", { hasText: "Lote sem CNO E2E" }).first().click();

  await page.getByRole("button", { name: "Gravar este CNO em Lote sem CNO E2E" }).click();
  await expect(page.getByText("Obra identificada pelo CNO 11.111.11111/11")).toBeVisible();
  await expect.poll(async () => (await prisma.obra.findUnique({ where: { id: obra.id } }))?.cno).toBe("111111111111");

  await enviarXml(page, comCno("111111111111"));
  await expect(page.getByText("Obra identificada pelo CNO 11.111.11111/11")).toBeVisible();
});
