import { test, expect } from "./fixtures";
import { prisma } from "../src/lib/prisma";
import { gerarToken, hashToken } from "../src/lib/token";

/**
 * Convite por link: a pessoa se cadastra sozinha, entra com o papel e as
 * obras do convite, e o link não serve para um segundo cadastro.
 */

const EMAIL = `convite.e2e-${Date.now()}@obras.local`;

test.afterEach(async () => {
  const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (usuario) {
    await prisma.atividade.deleteMany({ where: { usuarioId: usuario.id } });
    await prisma.convite.deleteMany({ where: { usuarioId: usuario.id } });
    await prisma.usuario.delete({ where: { id: usuario.id } });
  }
  await prisma.convite.deleteMany({ where: { email: EMAIL } });
});

test("cadastro pelo link com acesso limitado a uma obra", async ({ page, browser }) => {
  const [lote03, lote19] = await Promise.all([
    prisma.obra.findUniqueOrThrow({ where: { codigo: "L03" } }),
    prisma.obra.findUniqueOrThrow({ where: { codigo: "L19" } }),
  ]);
  const token = gerarToken();
  await prisma.convite.create({
    data: {
      tokenHash: hashToken(token),
      nome: "Convidado E2E",
      email: EMAIL,
      role: "CAMPO",
      todasObras: false,
      obraIds: [lote03.id],
      expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await page.goto(`/convite/${token}`);
  await expect(page.getByText("Crie seu acesso")).toBeVisible();
  await expect(page.locator("#email")).toHaveValue(EMAIL);
  await page.fill("#senha", "senha-e2e-123");
  await page.fill("#confirmacao", "senha-e2e-123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/diario");

  // só a obra liberada aparece; a outra não abre nem pela URL
  await page.goto("/obras");
  await expect(page.getByText("Lote 03")).toBeVisible();
  await expect(page.getByText("Lote 19")).not.toBeVisible();
  const resposta = await page.goto(`/obras/${lote19.id}`);
  expect(resposta?.status()).toBe(404);

  // o cadastro ficou no log de auditoria
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: EMAIL } });
  expect(await prisma.atividade.count({ where: { usuarioId: usuario.id, tipo: "convite.aceito" } })).toBe(1);

  // o mesmo link não cria uma segunda conta
  const outro = await browser.newPage();
  await outro.goto(`/convite/${token}`);
  await expect(outro.getByText("Convite indisponível")).toBeVisible();
  await outro.close();
});
