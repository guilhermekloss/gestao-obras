import type { Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { test, expect } from "./fixtures";
import { prisma } from "../src/lib/prisma";

const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SENHA = "senha-de-teste-e2e";
// chave fictícia (modelo 55), única por execução
const CHAVE = `4126105566677700018855001${String(Date.now()).slice(-9)}1234567890`.slice(0, 44);

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#senha", SENHA);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

async function criarUsuario(role: "ADMIN" | "ESCRITORIO") {
  const email = `sefaz-${role.toLowerCase()}-${sufixo}@obras.local`;
  await prisma.usuario.create({ data: { nome: `Sefaz ${role}`, email, role, senhaHash: await hash(SENHA, 4), assistenteVistoEm: new Date() } });
  return email;
}

test.beforeAll(async () => {
  await prisma.documentoSefaz.create({
    data: {
      chave: CHAVE,
      nsu: "000000000000001",
      cnpjDestinatario: "11222333000181",
      emitenteDoc: "55666777000188",
      emitenteNome: `MADEIREIRA E2E ${sufixo}`,
      numero: "9876",
      serie: "1",
      dataEmissao: new Date("2026-10-15T12:00:00Z"),
      valorCents: 238990,
      situacao: "RESUMO",
      manifestacao: "CIENCIA_ENVIADA",
    },
  });
});

test.afterAll(async () => {
  await prisma.documentoSefaz.deleteMany({ where: { chave: CHAVE } });
  const usuarios = await prisma.usuario.findMany({ where: { email: { contains: sufixo } }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  await prisma.atividade.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  await prisma.tentativaLogin.deleteMany({ where: { email: { contains: sufixo } } });
  await prisma.$disconnect();
});

test("ADMIN acompanha a captura e vê a NF-e recebida esperando o XML", async ({ page }) => {
  await entrar(page, await criarUsuario("ADMIN"));
  await page.goto("/sefaz");
  await expect(page.getByRole("heading", { name: "Captura de NF-e na Sefaz" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certificado A1" })).toBeVisible();

  await page.goto("/sefaz?aba=documentos");
  await expect(page.getByText(`MADEIREIRA E2E ${sufixo}`)).toBeVisible();

  await page.goto("/notas/recebidas");
  const linha = page.getByRole("row").filter({ hasText: `MADEIREIRA E2E ${sufixo}` });
  await expect(linha.getByText("Aguardando XML da Sefaz")).toBeVisible();
});

test("ESCRITÓRIO lança as recebidas, mas não abre o painel da captura", async ({ page }) => {
  await entrar(page, await criarUsuario("ESCRITORIO"));
  await expect(page.locator('[data-assistente="menu:/sefaz"]')).toHaveCount(0);
  await page.goto("/notas/recebidas");
  await expect(page.getByRole("heading", { name: "NF-e recebidas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Acompanhar a captura" })).toHaveCount(0);

  await page.goto("/sefaz");
  await expect(page.getByRole("heading", { name: "Captura de NF-e na Sefaz" })).toHaveCount(0);
});

test("o gatilho do agendador recusa chamada sem token válido", async ({ request }) => {
  expect((await request.post("/api/sefaz/sincronizar")).status()).toBe(401);
  expect((await request.post("/api/sefaz/sincronizar", { headers: { Authorization: "Bearer qualquer" } })).status()).toBe(401);
});
