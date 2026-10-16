import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// Regressão da auditoria visual: o que o leitor de tela e o dedo precisam em toda tela do menu.
// Sem biblioteca de auditoria: cada checagem é uma regra simples, para a falha dizer o que consertar.

const TELAS = [
  "/dashboard",
  "/obras",
  "/fornecedores",
  "/materiais",
  "/notas",
  "/notas/nova",
  "/contas",
  "/diario",
  "/diario/novo",
  "/cronograma",
  "/orcamento",
  "/usuarios",
  "/conta",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@obras.local");
  await page.fill("#senha", "admin123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

/** Nome acessível simplificado: aria-label, texto visível, rótulo ligado ao campo ou title. */
function semNomeAcessivel() {
  const achados: string[] = [];
  const visivel = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const controles = document.querySelectorAll<HTMLElement>(
    "a[href], button, select, textarea, input:not([type=hidden]), [role=button], [role=combobox]",
  );
  for (const el of controles) {
    if (!visivel(el) || el.closest("[aria-hidden=true], [inert], nextjs-portal")) continue;
    const ids = (el.getAttribute("aria-labelledby") ?? "").split(" ").filter(Boolean);
    const porId = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    const rotulos = "labels" in el ? Array.from((el as HTMLInputElement).labels ?? []) : [];
    const nome = [
      el.getAttribute("aria-label"),
      porId,
      el.textContent,
      rotulos.map((l) => l.textContent).join(" "),
      el.getAttribute("title"),
      el.getAttribute("placeholder"),
    ]
      .join(" ")
      .trim();
    if (!nome) achados.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${el.className.toString().slice(0, 60)}`);
  }
  return achados;
}

/** Alvos de toque abaixo de 44 px (WCAG 2.5.5), contando o rótulo de caixas de seleção. */
function alvosPequenos() {
  const achados: string[] = [];
  const controles = document.querySelectorAll<HTMLElement>(
    "a[href], button, select, textarea, input:not([type=hidden])",
  );
  for (const el of controles) {
    const estilo = getComputedStyle(el);
    if (estilo.visibility === "hidden" || el.closest("[aria-hidden=true], [inert], nextjs-portal, .sr-only")) continue;
    // link no meio de um texto corrido não conta (exceção "em linha" da WCAG 2.5.8)
    if (el.tagName === "A" && estilo.display === "inline" && el.parentElement && el.parentElement.textContent!.trim() !== el.textContent!.trim()) continue;
    const alvo = el.matches("input[type=checkbox], input[type=radio]") ? (el.closest("label") ?? el) : el;
    const r = alvo.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 43.5 || r.height < 43.5) {
      achados.push(`${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  return achados;
}

test.describe("celular (390 px, toque)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const rota of TELAS) {
    test(`${rota}: título, nomes acessíveis e alvos de 44 px`, async ({ page }) => {
      await login(page);
      await page.goto(rota);
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h1")).toHaveCount(1);
      // cada tela tem o próprio <title> ("Contas a pagar · Gestão de Obras")
      await expect(page).toHaveTitle(/.+ · Gestão de Obras$/);

      expect(await page.evaluate(semNomeAcessivel), "controles sem nome acessível").toEqual([]);
      expect(await page.evaluate(alvosPequenos), "alvos de toque menores que 44 px").toEqual([]);
    });
  }
});
