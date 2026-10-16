import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { veFinanceiro } from "@/services/acesso";
import { AcaoVazio, EstadoVazio } from "../estado-vazio";

const render = (role: "ADMIN" | "ESCRITORIO" | "CAMPO") =>
  renderToStaticMarkup(
    <EstadoVazio
      titulo="Nenhuma conta a pagar"
      acao={
        veFinanceiro(role) && (
          <AcaoVazio href="/notas/nova">Lançar primeira nota</AcaoVazio>
        )
      }
    >
      As parcelas aparecem aqui.
    </EstadoVazio>,
  );

describe("EstadoVazio", () => {
  it("mostra título, explicação e a ação para quem pode lançar", () => {
    const html = render("ESCRITORIO");
    expect(html).toContain("<h2");
    expect(html).toContain("Nenhuma conta a pagar");
    expect(html).toContain("As parcelas aparecem aqui.");
    expect(html).toContain('href="/notas/nova"');
    expect(html).toContain("Lançar primeira nota");
  });

  it("não mostra ação financeira para CAMPO", () => {
    const html = render("CAMPO");
    expect(html).toContain("Nenhuma conta a pagar");
    expect(html).not.toContain("Lançar primeira nota");
    expect(html).not.toContain("<a ");
  });

  it("a ação tem alvo de toque de 44px e o ícone não vai para leitor de tela", () => {
    const html = render("ADMIN");
    expect(html).toContain("h-11");
    expect(html).toContain('aria-hidden="true"');
  });

  it("usa h3 quando está dentro de um cartão", () => {
    const html = renderToStaticMarkup(
      <EstadoVazio compacto nivel={3} titulo="Sem avanço registrado">
        Marque o avanço.
      </EstadoVazio>,
    );
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h2");
  });
});
