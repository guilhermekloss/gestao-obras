import { test, expect, type Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

/**
 * Fluxo crítico do MVP: lançar NF → parcela aparece em contas →
 * marcar como paga → custo refletido na obra.
 */

const NUMERO_NF = `E2E-${Date.now()}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@obras.local");
  await page.fill("#senha", "admin123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

// Fornecedor e obra usam o componente Combobox (busca + lista em portal), não
// um <select> nativo — abre o campo, digita e clica na opção da lista.
async function selecionarCombobox(page: Page, placeholder: string, texto: string) {
  const campo = page.getByPlaceholder(placeholder);
  await campo.click();
  await campo.fill(texto);
  await page.locator("ul li button", { hasText: texto }).first().click();
}

// NFs de execuções anteriores desta spec ficam no banco (número único por run),
// o que infla o custo acumulado do Lote 21 a cada corrida. Limpa antes e depois
// para o teste ser idempotente independente de quantas vezes rodar.
test.beforeEach(async () => {
  await prisma.notaFiscal.deleteMany({ where: { numero: { startsWith: "E2E-" } } });
});

test.afterEach(async () => {
  await prisma.notaFiscal.deleteMany({ where: { numero: { startsWith: "E2E-" } } });
});

test("lançar NF, pagar parcela e ver custo na obra", async ({ page }) => {
  await login(page);

  // 1. Lançar a NF: R$ 1.200,00, 1 item, 100% no Lote 21, PIX à vista
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

  // 2. Contas a pagar: parcela aparece e é paga
  await page.goto("/contas?visao=todas");
  const linha = page.locator("tr", { hasText: NUMERO_NF });
  await expect(linha).toHaveCount(1);
  await linha.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Marcar como pagas" }).click();
  await expect(page.getByText("marcadas como pagas")).toBeVisible();

  await page.goto("/contas?visao=pagas");
  await expect(page.locator("tr", { hasText: NUMERO_NF })).toHaveCount(1);

  // 3. Custo aparece na obra (Lote 21 só tem esta NF)
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
    // dashboard redireciona CAMPO para /diario (não vê indicadores financeiros)
    await page.waitForURL("**/diario");

    // rota financeira: o servidor bloqueia mesmo com acesso direto pela URL
    await page.goto("/contas");
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como pagas" })).not.toBeVisible();
  } finally {
    await prisma.usuario.delete({ where: { email: emailCampo } });
  }
});
