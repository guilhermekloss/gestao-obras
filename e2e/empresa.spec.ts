import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { test, expect } from "./fixtures";
import { prisma } from "../src/lib/prisma";
import { gerarPfxDeTeste } from "../src/services/sefaz/__tests__/certificado-teste";

const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SENHA = "senha-de-teste-e2e";
let dir: string;

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#senha", SENHA);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

async function criarUsuario(role: "ADMIN" | "ESCRITORIO") {
  const email = `empresa-${role.toLowerCase()}-${sufixo}@obras.local`;
  await prisma.usuario.create({ data: { nome: `Empresa ${role}`, email, role, senhaHash: await hash(SENHA, 4), assistenteVistoEm: new Date() } });
  return email;
}

// o cadastro da empresa é único: os testes deste arquivo rodam em sequência e o apagam no fim
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "e2e-pfx-"));
  writeFileSync(path.join(dir, "a1.pfx"), gerarPfxDeTeste({ senha: "senha-do-a1", legado: true }));
  writeFileSync(path.join(dir, "outro.pfx"), gerarPfxDeTeste({ senha: "senha-do-a1", cnpj: "99888777000166" }));
});

test.afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await prisma.empresa.deleteMany({});
  const usuarios = await prisma.usuario.findMany({ where: { email: { contains: sufixo } }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  await prisma.atividade.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  await prisma.tentativaLogin.deleteMany({ where: { email: { contains: sufixo } } });
  await prisma.$disconnect();
});

test("ADMIN cadastra a empresa, envia o certificado A1 e liga a captura", async ({ page }) => {
  await prisma.empresa.deleteMany({});
  await entrar(page, await criarUsuario("ADMIN"));
  await page.goto("/empresa");
  await expect(page.getByText("Nenhum certificado enviado.")).toBeVisible();

  await page.fill("#razaoSocial", "Construtora Teste Ltda");
  await page.fill("#cnpj", "11.222.333/0001-81");
  await page.fill("#filiais", "11.222.333/0002-62");
  await page.getByRole("button", { name: "Salvar dados" }).click();
  await expect(page.getByText("Dados da empresa salvos.")).toBeVisible();

  // certificado de outra empresa é recusado
  await page.setInputFiles("#arquivo", path.join(dir, "outro.pfx"));
  await page.fill("#senha", "senha-do-a1");
  await page.getByRole("button", { name: "Enviar certificado" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "de outra empresa" })).toBeVisible();

  // senha errada
  await page.setInputFiles("#arquivo", path.join(dir, "a1.pfx"));
  await page.fill("#senha", "errada");
  await page.getByRole("button", { name: "Enviar certificado" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "confira a senha" })).toBeVisible();

  await page.setInputFiles("#arquivo", path.join(dir, "a1.pfx"));
  await page.fill("#senha", "senha-do-a1");
  await page.getByRole("button", { name: "Enviar certificado" }).click();
  await expect(page.getByText("Certificado guardado com segurança.")).toBeVisible();
  await expect(page.getByText("CONSTRUTORA TESTE LTDA:11222333000181")).toBeVisible();

  const guardada = await prisma.empresa.findUniqueOrThrow({ where: { id: "principal" } });
  expect(Buffer.from(guardada.certificadoCifrado!).toString("latin1")).not.toContain("PRIVATE KEY");

  await page.getByLabel(/Buscar automaticamente as NF-e/).check();
  await page.getByRole("button", { name: "Salvar captura" }).click();
  await expect(page.getByText(/Captura ligada/)).toBeVisible();

  await page.goto("/sefaz");
  await expect(page.getByText("Captura desligada.")).toHaveCount(0);
  await expect(page.getByText("11.222.333/0002-62")).toBeVisible();
});

test("ESCRITÓRIO não abre a tela Empresa", async ({ page }) => {
  await entrar(page, await criarUsuario("ESCRITORIO"));
  await expect(page.locator('[data-assistente="menu:/empresa"]')).toHaveCount(0);
  await page.goto("/empresa");
  await expect(page.getByRole("heading", { name: "Empresa", exact: true })).toHaveCount(0);
});
