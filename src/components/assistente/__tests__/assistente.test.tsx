import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/obras" }));
vi.mock("@/app/(app)/assistente/actions", () => ({
  marcarAssistenteVisto: vi.fn(),
  perguntarAssistente: vi.fn(),
}));

import { Assistente } from "../assistente";

const render = (extra: Partial<Parameters<typeof Assistente>[0]> = {}) =>
  renderToStaticMarkup(<Assistente role="CAMPO" nome="Maria Souza" pendente={false} iaDisponivel={false} {...extra} />);

describe("Assistente", () => {
  it("o botão fixo tem nome acessível, âncora e rótulo visível a partir de sm", () => {
    const html = render();
    expect(html).toContain('data-assistente="botao"');
    expect(html).toContain('aria-label="Abrir assistente de navegação"');
    expect(html).toContain('<span class="hidden sm:inline">Assistente</span>');
    expect(html).toContain("h-11");
  });

  it("no celular o botão fica acima da barra inferior do menu", () => {
    expect(render()).toContain("--assistente-bottom-celular:calc(var(--altura-bottom-nav,0px) + 1rem)");
  });
});
