import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { itensPara, naRota } from "@/components/nav-itens";
import { GUIAS } from "../guias";
import { TOURS } from "../tours";
import { guiasPara, tourDeBoasVindas } from "../index";

const PAPEIS: Role[] = ["ADMIN", "ESCRITORIO", "CAMPO"];

function rotasDoMenu(papeis: Role[]): string[] {
  return papeis.flatMap((p) => itensPara(p).map((i) => i.href));
}

// aceita a própria rota do menu ou uma sub-rota dela (ex.: /notas/nova)
function pertenceAoMenu(rota: string, papeis: Role[]): boolean {
  return rota === "/conta" || rotasDoMenu(papeis).some((href) => naRota(rota, href));
}

describe("guias", () => {
  it("têm ids únicos", () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GUIAS.map((g) => [g.id, g] as const))("%s: link e rotas pertencem ao menu dos seus papéis", (_id, g) => {
    expect(pertenceAoMenu(g.link, g.papeis), `link ${g.link}`).toBe(true);
    for (const rota of g.rotas) expect(pertenceAoMenu(rota, g.papeis), `rota ${rota}`).toBe(true);
  });

  it.each(GUIAS.map((g) => [g.id, g] as const))("%s: tem para que serve e ao menos um passo", (_id, g) => {
    expect(g.paraQueServe.trim().length).toBeGreaterThan(0);
    expect(g.passoAPasso.length).toBeGreaterThan(0);
  });

  it("guias do CAMPO não citam dinheiro nem telas financeiras", () => {
    const proibido = /\bR\$|lançament|orçament|contas a pagar|fornecedor/i;
    const financeiros = ["/dashboard", "/fornecedores", "/materiais", "/notas", "/contas", "/orcamento", "/usuarios"];
    const doCampo = GUIAS.filter((g) => g.papeis.includes("CAMPO"));
    expect(doCampo.length).toBeGreaterThan(0);
    for (const g of doCampo) {
      const texto = [g.titulo, g.paraQueServe, ...g.passoAPasso, ...g.regras, ...(g.dicas ?? [])].join("\n");
      expect(texto, g.id).not.toMatch(proibido);
      for (const href of [g.link, ...g.rotas]) {
        expect(
          financeiros.some((f) => naRota(href, f)),
          `${g.id}: ${href}`,
        ).toBe(false);
      }
    }
  });

  it("todo papel tem guias", () => {
    for (const p of PAPEIS) expect(guiasPara(p).length).toBeGreaterThan(0);
  });
});

describe("tours", () => {
  it("têm ids únicos", () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo papel tem tour de boas-vindas", () => {
    for (const p of PAPEIS) expect(tourDeBoasVindas(p), p).not.toBeNull();
  });

  it("o tour de boas-vindas cobre exatamente o menu do papel", () => {
    for (const p of PAPEIS) {
      const alvos = tourDeBoasVindas(p)!.passos.flatMap((s) => {
        const m = s.alvo?.match(/^\[data-assistente="menu:(\/[^"]*)"\]$/);
        return m ? [m[1]] : [];
      });
      expect([...alvos].sort(), p).toEqual(itensPara(p).map((i) => i.href).sort());
    }
  });

  it("boas-vindas terminam em Minha conta e no botão do assistente", () => {
    for (const p of PAPEIS) {
      const alvos = tourDeBoasVindas(p)!.passos.map((s) => s.alvo);
      expect(alvos.slice(-2)).toEqual(['[data-assistente="conta"]', '[data-assistente="botao"]']);
    }
  });

  it("alvos de menu existem no menu de cada papel do tour", () => {
    for (const t of TOURS) {
      for (const passo of t.passos) {
        const m = passo.alvo?.match(/menu:([^"\]]+)/);
        if (!m || m[1] === "mais") continue;
        for (const p of t.papeis) {
          expect(rotasDoMenu([p]), `${t.id}/${p}: ${m[1]}`).toContain(m[1]);
        }
      }
    }
  });

  it("todo passo tem título e texto", () => {
    for (const t of TOURS) {
      for (const s of t.passos) {
        expect(s.titulo.trim(), t.id).not.toBe("");
        expect(s.texto.trim(), t.id).not.toBe("");
      }
    }
  });

  // onde cada tela de tour guarda seus ids no código-fonte
  const FONTES: Record<string, string[]> = {
    "/dashboard": ["src/app/(app)/dashboard/page.tsx"],
    "/notas/nova": ["src/app/(app)/notas/nota-form.tsx", "src/app/(app)/notas/nova/page.tsx"],
    "/contas": ["src/app/(app)/contas/page.tsx", "src/app/(app)/contas/contas-client.tsx"],
    "/cronograma": ["src/app/(app)/cronograma/page.tsx", "src/app/(app)/cronograma/linha-base-dialog.tsx"],
    "/diario/novo": ["src/app/(app)/diario/novo/rdo-form.tsx", "src/app/(app)/diario/novo/page.tsx"],
    "/empresa": [
      "src/app/(app)/empresa/page.tsx",
      "src/app/(app)/empresa/formularios.tsx",
      "src/app/(app)/empresa/guia-certificado.tsx",
    ],
    "/sefaz": ["src/app/(app)/sefaz/page.tsx"],
  };

  it("todo seletor #id dos tours de tela existe no código da página", () => {
    const telas = TOURS.filter((t) => t.rotas.length > 0);
    expect(telas.length).toBeGreaterThan(0);
    for (const t of telas) {
      for (const rota of t.rotas) {
        const arquivos = FONTES[rota];
        expect(arquivos, `sem fonte mapeada para ${rota}`).toBeDefined();
        const codigo = arquivos.map((a) => readFileSync(join(process.cwd(), a), "utf8")).join("\n");
        for (const passo of t.passos) {
          const id = passo.alvo?.match(/^#([\w-]+)$/)?.[1];
          if (!id) continue;
          expect(codigo, `${t.id}: #${id}`).toMatch(new RegExp(`id=(?:"${id}"|\\{["'\`]${id}["'\`]\\})`));
        }
      }
    }
  });
});
