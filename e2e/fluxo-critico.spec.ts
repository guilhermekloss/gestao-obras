import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const NUMERO_NF = `E2E-${Date.now()}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@obras.local");
  await page.fill("#senha", "admin123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

// Combobox (busca + lista em portal), não <select>: abre, digita e clica na opção.
async function selecionarCombobox(page: Page, placeholder: string, texto: string) {
  const campo = page.getByPlaceholder(placeholder);
  await campo.click();
  await campo.fill(texto);
  await page.locator("ul li button", { hasText: texto }).first().click();
}

// Limpa antes e depois: NFs de execuções anteriores inflariam o custo acumulado do Lote 21.
test.beforeEach(async () => {
  await prisma.notaFiscal.deleteMany({ where: { numero: { startsWith: "E2E-" } } });
});

test.afterEach(async () => {
  await prisma.notaFiscal.deleteMany({ where: { numero: { startsWith: "E2E-" } } });
});

test("lançar NF, pagar parcela e ver custo na obra", async ({ page }) => {
  await login(page);

  await page.goto("/notas/nova");
  await selecionarCombobox(page, "Buscar por nome ou CNPJ...", "Aço Forte Distribuidora");
  await page.fill("#numero", NUMERO_NF);
  await page.fill("#total", "1200,00");

  await page.fill('input[name="itens.0.descricao"]', "Cimento CP-II 50kg");
  await page.fill('input[name="itens.0.qtde"]', "40");
  await page.fill('input[name="itens.0.unidade"]', "SC");
  await page.fill('input[name="itens.0.unit"]', "30,00");

  await selecionarCombobox(page, "Obra...", "Lote 21");
  await page.fill('input[name="rateios.0.percent"]', "100");

  await page.selectOption('select[name="formaPagto"]', "PIX");
  await page.getByRole("button", { name: "Gerar parcelas" }).click();
  await expect(page.locator('input[name="parcelas.0.valor"]')).toHaveValue("1200,00");

  await page.getByRole("button", { name: "Lançar nota" }).click();
  await page.waitForURL("**/notas");
  await expect(page.getByText(NUMERO_NF)).toBeVisible();

  await page.goto("/contas?visao=todas");
  const linha = page.locator("tr", { hasText: NUMERO_NF });
  await expect(linha).toHaveCount(1);
  await linha.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Marcar como pagas" }).click();
  await expect(page.getByText("marcadas como pagas")).toBeVisible();

  await page.goto("/contas?visao=pagas");
  await expect(page.locator("tr", { hasText: NUMERO_NF })).toHaveCount(1);

  await page.goto("/obras");
  await page.getByText("Lote 21").click();
  await expect(page.getByText("Custo acumulado")).toBeVisible();
  await expect(page.getByText("R$ 1.200,00").first()).toBeVisible();
});

test("papel campo não vê dados financeiros", async ({ page }) => {
  const emailCampo = `campo.e2e-${Date.now()}@obras.local`;
  await prisma.usuario.create({
    data: {
      nome: "Campo E2E",
      email: emailCampo,
      senhaHash: await hash("campo123", 10),
      role: "CAMPO",
    },
  });

  try {
    await page.goto("/login");
    await page.fill("#email", emailCampo);
    await page.fill("#senha", "campo123");
    await page.click("button[type=submit]");
    await page.waitForURL("**/diario");

    await page.goto("/contas");
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como pagas" })).not.toBeVisible();
  } finally {
    await prisma.usuario.delete({ where: { email: emailCampo } });
  }
});
