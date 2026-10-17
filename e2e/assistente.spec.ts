import type { Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { test, expect } from "./fixtures";
import { prisma } from "../src/lib/prisma";

const SENHA = "senha-forte-e2e-123";
const SUFIXO = Date.now();
const EMAILS = {
  ADMIN: `assistente.admin-${SUFIXO}@obras.local`,
  CAMPO: `assistente.campo-${SUFIXO}@obras.local`,
};

async function criarUsuario(role: "ADMIN" | "CAMPO", nome: string) {
  await prisma.usuario.create({
    data: {
      nome,
      email: EMAILS[role],
      senhaHash: await hash(SENHA, 10),
      role,
      todasObras: true,
      assistenteVistoEm: null,
    },
  });
}

async function entrar(page: Page, email: string, destino: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#senha", SENHA);
  await page.click("button[type=submit]");
  await page.waitForURL(destino);
}

test.beforeEach(async () => {
  await criarUsuario("ADMIN", "Ana Assistente");
  await criarUsuario("CAMPO", "Caio Campo");
});

test.afterEach(async () => {
  const usuarios = await prisma.usuario.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  await prisma.atividade.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
});

test("boas-vindas, tour até concluir e o pop-up não volta depois de recarregar", async ({ page }) => {
  await entrar(page, EMAILS.ADMIN, "**/dashboard");

  const popup = page.getByRole("dialog", { name: "Boas-vindas, Ana" });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("button", { name: "Ver os guias" })).toBeVisible();
  await expect(popup.getByRole("button", { name: "Agora não" })).toBeVisible();
  await popup.getByRole("button", { name: "Fazer o tour (2 min)" }).click();

  const tour = page.getByRole("region", { name: "Tour guiado" });
  await expect(tour).toBeVisible();
  await expect(tour).toBeFocused();
  await expect(tour.getByText(/^Passo 1 de \d+$/)).toBeVisible();

  const total = Number((await tour.getByText(/^Passo 1 de \d+$/).textContent())!.match(/de (\d+)/)![1]);
  for (let i = 1; i < total; i++) {
    await tour.getByRole("button", { name: "Próximo" }).click();
    await expect(tour.getByText(`Passo ${i + 1} de ${total}`)).toBeVisible();
  }
  if (total > 1) await tour.getByRole("button", { name: "Voltar" }).click();
  if (total > 1) await tour.getByRole("button", { name: "Próximo" }).click();
  await tour.getByRole("button", { name: "Concluir" }).click();
  await expect(tour).toBeHidden();

  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: EMAILS.ADMIN } });
  expect(usuario.assistenteVistoEm).not.toBeNull();

  await page.reload();
  await expect(page.getByRole("button", { name: "Abrir assistente de navegação" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Esc encerra o tour e devolve o foco", async ({ page }) => {
  await entrar(page, EMAILS.ADMIN, "**/dashboard");
  await page.getByRole("button", { name: "Agora não" }).click();
  await page.getByRole("button", { name: "Abrir assistente de navegação" }).click();
  await page.getByRole("button", { name: "Refazer o tour de boas-vindas" }).click();
  const tour = page.getByRole("region", { name: "Tour guiado" });
  await expect(tour).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(page.getByRole("button", { name: "Abrir assistente de navegação" })).toBeFocused();
});

test("central de ajuda: busca, accordion e Ir para a tela", async ({ page }) => {
  await entrar(page, EMAILS.ADMIN, "**/dashboard");
  await page.getByRole("button", { name: "Ver os guias" }).click();

  const central = page.getByRole("dialog", { name: "Central de ajuda" });
  await expect(central).toBeVisible();
  const itens = central.locator("[data-slot=accordion-trigger]");
  await expect(itens.first()).toBeVisible();
  const todos = await itens.count();
  const primeiro = (await itens.first().textContent()) ?? "";

  await central.getByLabel("Buscar ajuda").fill("zzz-nada-assim-zzz");
  await expect(central.getByText(/Nenhum guia encontrado/)).toBeVisible();
  await expect(itens).toHaveCount(0);

  await central.getByLabel("Buscar ajuda").fill("");
  await expect(itens).toHaveCount(todos);
  await central.getByLabel("Buscar ajuda").fill(primeiro.slice(0, 5));
  await expect(itens.filter({ hasText: primeiro })).toHaveCount(1);

  await itens.filter({ hasText: primeiro }).first().click();
  await expect(central.getByRole("heading", { name: "Para que serve" })).toBeVisible();
  const ir = central.getByRole("link", { name: "Ir para a tela" });
  const destino = await ir.getAttribute("href");
  await ir.click();
  await expect(central).toBeHidden();
  await page.waitForURL(`**${destino}`);
});

test("CAMPO não vê guias financeiros na central", async ({ page }) => {
  await entrar(page, EMAILS.CAMPO, "**/diario");
  const popup = page.getByRole("dialog", { name: "Boas-vindas, Caio" });
  await expect(popup).toBeVisible();
  await expect(popup).not.toContainText(/R\$|contas a pagar|notas/i);
  await popup.getByRole("button", { name: "Ver os guias" }).click();

  const central = page.getByRole("dialog", { name: "Central de ajuda" });
  await expect(central).toBeVisible();
  const itens = central.locator("[data-slot=accordion-trigger]");
  for (const gatilho of await itens.all()) await gatilho.click();
  for (const href of await central.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
    expect(href).not.toMatch(/^\/(contas|notas|orcamento|usuarios|fornecedores|materiais)/);
  }
});
