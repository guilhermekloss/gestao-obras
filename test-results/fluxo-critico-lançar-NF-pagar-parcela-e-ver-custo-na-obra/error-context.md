# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fluxo-critico.spec.ts >> lançar NF, pagar parcela e ver custo na obra
- Location: e2e/fluxo-critico.spec.ts:18:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('R$ 1.200,00').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('R$ 1.200,00').first()

```

```yaml
- navigation:
  - text: Gestão de Obras
  - link "Dashboard":
    - /url: /dashboard
  - link "Obras":
    - /url: /obras
  - link "Fornecedores":
    - /url: /fornecedores
  - link "Notas fiscais":
    - /url: /notas
  - link "Contas a pagar":
    - /url: /contas
  - link "Diário de obra":
    - /url: /diario
  - link "Medições":
    - /url: /medicoes
  - link "Orçamento":
    - /url: /orcamento
  - link "Importar":
    - /url: /importar
  - link "Usuários":
    - /url: /usuarios
- banner:
  - text: Administrador · admin
  - button "Sair"
- main:
  - heading "Lote 21" [level=1]
  - text: Em andamento
  - button "Editar"
  - button "Excluir"
  - paragraph: Custo acumulado
  - paragraph: R$ 2.400,00
  - paragraph: Orçamento previsto
  - paragraph: —
  - paragraph: Avanço físico
  - paragraph: 0%
  - paragraph: Código / CNO
  - paragraph: L21
  - text: Etapas
  - button "Etapa"
  - list:
    - listitem:
      - text: Fundação 0%
      - button
    - listitem:
      - text: Estrutura 0%
      - button
    - listitem:
      - text: Alvenaria 0%
      - button
    - listitem:
      - text: Instalações 0%
      - button
    - listitem:
      - text: Acabamento 0%
      - button
  - text: Contas a vencer (30 dias)
  - paragraph: Nada a vencer nos próximos 30 dias.
  - text: Últimos RDOs
  - link "Ver todos":
    - /url: /diario?obra=cmraz7b2u000v7uyguc9wd1wl
  - paragraph: Nenhum RDO registrado.
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect, type Page } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Fluxo crítico do MVP: lançar NF → parcela aparece em contas →
  5  |  * marcar como paga → custo refletido na obra.
  6  |  */
  7  | 
  8  | const NUMERO_NF = `E2E-${Date.now()}`;
  9  | 
  10 | async function login(page: Page) {
  11 |   await page.goto("/login");
  12 |   await page.fill("#email", "admin@obras.local");
  13 |   await page.fill("#senha", "admin123");
  14 |   await page.click("button[type=submit]");
  15 |   await page.waitForURL("**/dashboard");
  16 | }
  17 | 
  18 | test("lançar NF, pagar parcela e ver custo na obra", async ({ page }) => {
  19 |   await login(page);
  20 | 
  21 |   // 1. Lançar a NF: R$ 1.200,00, 1 item, 100% no Lote 21, PIX à vista
  22 |   await page.goto("/notas/nova");
  23 |   await page.selectOption('select[name="fornecedorId"]', { label: "Aço Forte Distribuidora" });
  24 |   await page.fill("#numero", NUMERO_NF);
  25 |   await page.fill("#total", "1200,00");
  26 | 
  27 |   await page.fill('input[name="itens.0.descricao"]', "Cimento CP-II 50kg");
  28 |   await page.fill('input[name="itens.0.qtde"]', "40");
  29 |   await page.fill('input[name="itens.0.unidade"]', "SC");
  30 |   await page.fill('input[name="itens.0.unit"]', "30,00");
  31 | 
  32 |   await page.selectOption('select[name="rateios.0.obraId"]', { label: "Lote 21" });
  33 |   await page.fill('input[name="rateios.0.percent"]', "100");
  34 | 
  35 |   await page.selectOption('select[name="formaPagto"]', "PIX");
  36 |   await page.getByRole("button", { name: "Gerar parcelas" }).click();
  37 |   await expect(page.locator('input[name="parcelas.0.valor"]')).toHaveValue("1200,00");
  38 | 
  39 |   await page.getByRole("button", { name: "Lançar nota" }).click();
  40 |   await page.waitForURL("**/notas");
  41 |   await expect(page.getByText(NUMERO_NF)).toBeVisible();
  42 | 
  43 |   // 2. Contas a pagar: parcela aparece e é paga
  44 |   await page.goto("/contas?visao=todas");
  45 |   const linha = page.locator("tr", { hasText: NUMERO_NF });
  46 |   await expect(linha).toHaveCount(1);
  47 |   await linha.locator('input[type="checkbox"]').check();
  48 |   await page.getByRole("button", { name: "Marcar como pagas" }).click();
  49 |   await expect(page.getByText("marcadas como pagas")).toBeVisible();
  50 | 
  51 |   await page.goto("/contas?visao=pagas");
  52 |   await expect(page.locator("tr", { hasText: NUMERO_NF })).toHaveCount(1);
  53 | 
  54 |   // 3. Custo aparece na obra (Lote 21 só tem esta NF)
  55 |   await page.goto("/obras");
  56 |   await page.getByText("Lote 21").click();
  57 |   await expect(page.getByText("Custo acumulado")).toBeVisible();
> 58 |   await expect(page.getByText("R$ 1.200,00").first()).toBeVisible();
     |                                                       ^ Error: expect(locator).toBeVisible() failed
  59 | });
  60 | 
  61 | test("papel campo não vê dados financeiros", async ({ page }) => {
  62 |   await login(page);
  63 | 
  64 |   // dashboard exige escritório/admin — campo é redirecionado (validação no servidor)
  65 |   // aqui verificamos pelo menos que as rotas financeiras exigem sessão
  66 |   await page.context().clearCookies();
  67 |   const resposta = await page.goto("/contas");
  68 |   expect(resposta!.url()).toContain("/login");
  69 | });
  70 | 
```