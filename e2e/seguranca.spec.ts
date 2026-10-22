import type { Browser, Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { test, expect } from "./fixtures";
import { prisma } from "../src/lib/prisma";

const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// IP de documentação (RFC 5737) único por execução, para a regra do convite
const IP_TESTE = `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
const SENHA = "senha-de-teste-e2e";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function entrar(page: Page, email: string, senha = SENHA) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click("button[type=submit]");
}

let contador = 0;
async function criarUsuario(role: "ADMIN" | "ESCRITORIO" | "CAMPO") {
  const email = `seg-${role.toLowerCase()}-${++contador}-${sufixo}@obras.local`;
  await prisma.usuario.create({ data: { nome: `Seg ${role}`, email, role, senhaHash: await hash(SENHA, 4), assistenteVistoEm: new Date() } });
  return email;
}

async function novaPagina(browser: Browser) {
  const contexto = await browser.newContext();
  return contexto.newPage();
}

test.afterAll(async () => {
  const emails = { contains: sufixo };
  const usuarios = await prisma.usuario.findMany({ where: { email: emails }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  await prisma.atividade.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.arquivo.deleteMany({ where: { enviadoPorId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  await prisma.tentativaLogin.deleteMany({ where: { email: emails } });
  await prisma.bloqueio.deleteMany({ where: { OR: [{ chave: emails }, { chave: { in: [...ids, IP_TESTE] } }] } });
  await prisma.infracao.deleteMany({ where: { chave: { in: [...ids, IP_TESTE] } } });
});

test("páginas saem com CSP de nonce e cabeçalhos de segurança", async ({ page }) => {
  const resposta = await page.goto("/login");
  const h = resposta!.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("bloqueia o e-mail após 5 senhas erradas, mesmo com a senha certa", async ({ page }) => {
  const email = await criarUsuario("ESCRITORIO");
  for (let i = 0; i < 5; i++) {
    await entrar(page, email, "senha-errada-123");
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  }
  await entrar(page, email);
  await expect(page.getByText(/Muitas tentativas sem sucesso/)).toBeVisible();
  await expect(page).toHaveURL(/erro=bloqueado/);
});

test("admin vê o bloqueio e libera o acesso antes do prazo", async ({ browser }) => {
  const email = await criarUsuario("ESCRITORIO");
  const pessoa = await novaPagina(browser);
  for (let i = 0; i < 5; i++) await entrar(pessoa, email, "senha-errada-123");
  await entrar(pessoa, email);
  await expect(pessoa).toHaveURL(/erro=bloqueado/);

  const admin = await novaPagina(browser);
  await entrar(admin, await criarUsuario("ADMIN"));
  await admin.waitForURL("**/dashboard");
  await admin.goto("/usuarios?aba=bloqueios");
  const linha = admin.getByRole("row").filter({ hasText: email });
  await expect(linha.getByText("Bloqueado", { exact: true })).toBeVisible();
  admin.once("dialog", (d) => d.accept());
  await linha.getByRole("button", { name: /Liberar agora/ }).click();
  await expect(linha.getByText("Liberado", { exact: true })).toBeVisible();

  await entrar(pessoa, email);
  await pessoa.waitForURL("**/dashboard");

  const bloqueios = await prisma.bloqueio.findMany({ where: { chave: email } });
  expect(bloqueios).toHaveLength(1);
  expect(bloqueios[0].liberadoEm).not.toBeNull();
});

test("links de convite inexistentes bloqueiam o IP", async ({ browser }) => {
  await prisma.bloqueio.deleteMany({ where: { chave: IP_TESTE } });
  await prisma.infracao.deleteMany({ where: { chave: IP_TESTE } });
  const contexto = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": IP_TESTE } });
  const page = await contexto.newPage();
  for (let i = 0; i < 10; i++) {
    await page.goto(`/convite/nao-existe-${i}`);
    await expect(page.getByText("Link de convite inválido.")).toBeVisible();
  }
  await page.goto("/convite/nao-existe-final");
  await expect(page.getByText(/Muitos links de convite inválidos/)).toBeVisible();
  expect(await prisma.bloqueio.count({ where: { regra: "convite", chave: IP_TESTE, liberadoEm: null } })).toBe(1);
});

test("arquivos falsos seguidos bloqueiam o envio do usuário", async ({ browser }) => {
  const page = await novaPagina(browser);
  await entrar(page, await criarUsuario("ESCRITORIO"));
  await page.waitForURL("**/dashboard");
  const falso = { file: { name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html></html>") } };
  for (let i = 0; i < 10; i++) expect((await page.request.post("/api/upload", { multipart: falso })).status()).toBe(415);
  const depois = await page.request.post("/api/upload", {
    multipart: { file: { name: "foto.jpg", mimeType: "image/jpeg", buffer: PNG } },
  });
  expect(depois.status()).toBe(429);
  expect(Number(depois.headers()["retry-after"])).toBeGreaterThan(0);
});

test("upload valida o conteúdo e CAMPO não abre anexo de lançamento", async ({ browser }) => {
  const admin = await novaPagina(browser);
  await entrar(admin, await criarUsuario("ADMIN"));
  await admin.waitForURL("**/dashboard");

  const falso = await admin.request.post("/api/upload", {
    multipart: { file: { name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script>") } },
  });
  expect(falso.status()).toBe(415);

  const ok = await admin.request.post("/api/upload", {
    multipart: { file: { name: "foto.jpg", mimeType: "image/jpeg", buffer: PNG } },
  });
  expect(ok.status()).toBe(200);
  const { url } = await ok.json();
  expect(url).toMatch(/^\/api\/fotos\/\d+-[0-9a-f]+\.png$/);
  expect((await admin.request.get(url)).status()).toBe(200);

  const campo = await novaPagina(browser);
  await entrar(campo, await criarUsuario("CAMPO"));
  await campo.waitForURL("**/diario");
  expect((await campo.request.get(url)).status()).toBe(404);

  const anonimo = await novaPagina(browser);
  expect((await anonimo.request.get(url)).status()).toBe(401);
});

test("trocar a senha encerra as sessões abertas", async ({ browser }) => {
  const email = await criarUsuario("ESCRITORIO");
  const outroAparelho = await novaPagina(browser);
  await entrar(outroAparelho, email);
  await outroAparelho.waitForURL("**/dashboard");

  const page = await novaPagina(browser);
  await entrar(page, email);
  await page.waitForURL("**/dashboard");
  await page.goto("/conta");
  await page.fill("#atual", SENHA);

  const requisitos = page.locator("#nova-requisitos li");
  await expect(page.getByText("A senha precisa ter:")).toBeVisible();
  await page.fill("#nova", "1234567890");
  await expect(requisitos.nth(0)).toContainText("atendido");
  await expect(requisitos.nth(1)).toContainText("pendente");
  await page.fill("#nova", "tijolo-cimento-areia");
  await expect(requisitos.filter({ hasText: "pendente" })).toHaveCount(0);
  await page.fill("#confirmacao", "tijolo-cimento-areia");
  await page.getByRole("button", { name: "Trocar senha" }).click();
  await page.waitForURL("**/login?senha=1");

  await outroAparelho.goto("/dashboard");
  await outroAparelho.waitForURL("**/login");

  await entrar(page, email, "tijolo-cimento-areia");
  await page.waitForURL("**/dashboard");
});
