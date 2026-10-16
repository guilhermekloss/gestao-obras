import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErroDePagina } from "../erro-de-pagina";
import { NaoEncontrado } from "../nao-encontrado";
import Erro from "../../app/(app)/error";
import ErroRaiz from "../../app/error";
import NotFoundApp from "../../app/(app)/not-found";
import NotFoundRaiz from "../../app/not-found";
import LoadingDashboard from "../../app/(app)/dashboard/loading";
import LoadingNotas from "../../app/(app)/notas/(lista)/loading";
import LoadingContas from "../../app/(app)/contas/loading";
import LoadingObras from "../../app/(app)/obras/(lista)/loading";
import LoadingDiario from "../../app/(app)/diario/(lista)/loading";
import LoadingCronograma from "../../app/(app)/cronograma/loading";

const SEGREDO = "connection refused postgres://obras:senha@db:5432 (digest 1234567890)";
const erro = Object.assign(new Error(SEGREDO), { digest: "1234567890", stack: "at Segredo (/src/x.ts:1:1)" });

describe("ErroDePagina", () => {
  it("mostra o que fazer e não expõe detalhes técnicos", () => {
    const html = renderToStaticMarkup(<ErroDePagina error={erro} retry={() => {}} />);
    expect(html).toContain("Não foi possível abrir esta tela");
    expect(html).toContain("Tentar de novo");
    expect(html).toContain("Voltar ao início");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('role="button"');
    for (const vazamento of ["postgres", "senha", "connection refused", "1234567890", "Segredo", "stack"]) {
      expect(html).not.toContain(vazamento);
    }
  });

  it("anuncia o erro para leitor de tela", () => {
    expect(renderToStaticMarkup(<ErroDePagina error={erro} retry={() => {}} />)).toContain('role="alert"');
  });

  it("aceita erro que não é Error (valor lançado no cliente)", () => {
    expect(() => renderToStaticMarkup(<ErroDePagina error="texto solto" retry={() => {}} />)).not.toThrow();
    expect(() => renderToStaticMarkup(<ErroDePagina error={undefined} retry={() => {}} />)).not.toThrow();
  });

  it("as duas telas de erro (com e sem casca) usam a mesma mensagem", () => {
    const props = { error: erro, retry: () => {} };
    expect(renderToStaticMarkup(<Erro {...props} />)).toContain("Tentar de novo");
    const raiz = renderToStaticMarkup(<ErroRaiz {...props} />);
    expect(raiz).toContain("Tentar de novo");
    expect(raiz).toContain("min-h-svh");
  });
});

describe("NaoEncontrado", () => {
  it("explica as causas e leva de volta ao início", () => {
    const html = renderToStaticMarkup(<NaoEncontrado />);
    expect(html).toContain("Página não encontrada");
    expect(html).toContain("não tenha acesso");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('role="button"');
  });

  it("existe com casca e sem casca", () => {
    expect(renderToStaticMarkup(<NotFoundApp />)).toContain("Página não encontrada");
    const raiz = renderToStaticMarkup(<NotFoundRaiz />);
    expect(raiz).toContain("Página não encontrada");
    expect(raiz).toContain("min-h-svh");
  });
});

describe("loading.tsx", () => {
  const telas = {
    dashboard: LoadingDashboard,
    notas: LoadingNotas,
    contas: LoadingContas,
    obras: LoadingObras,
    diario: LoadingDiario,
    cronograma: LoadingCronograma,
  };

  for (const [nome, Tela] of Object.entries(telas)) {
    it(`${nome}: renderiza esqueleto acessível, sem spinner e sem texto de verdade`, () => {
      const html = renderToStaticMarkup(<Tela />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toMatch(/Carregando [^<]+…/);
      expect(html).toContain('data-slot="skeleton"');
      expect(html).not.toContain("animate-spin");
    });
  }

  it("esqueletos de tabela mantêm a estrutura responsiva da tela", () => {
    const html = renderToStaticMarkup(<LoadingContas />);
    expect(html).toContain("<table");
    expect(html).toContain("hidden md:table-cell");
    expect(html).toContain("hidden lg:table-cell");
  });
});

describe("onde ficam os loading.tsx", () => {
  // Um loading.tsx envolve também as rotas filhas. Se a resposta começa a ser enviada com o esqueleto,
  // o notFound() de uma tela de detalhe já não consegue devolver HTTP 404 (o e2e do convite cobre isso).
  const raiz = join(__dirname, "../../app/(app)");

  for (const secao of ["obras", "notas", "diario"]) {
    it(`${secao}: o esqueleto é só da lista, para o detalhe continuar respondendo 404`, () => {
      expect(existsSync(join(raiz, secao, "loading.tsx"))).toBe(false);
      expect(existsSync(join(raiz, secao, "(lista)", "loading.tsx"))).toBe(true);
      expect(existsSync(join(raiz, secao, "(lista)", "page.tsx"))).toBe(true);
    });
  }
});
