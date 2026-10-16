import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sun, CloudRain } from "lucide-react";
import { SeletorOpcoes } from "../seletor-opcoes";

const opcoes = [
  { valor: "SOL", rotulo: "Sol", icone: Sun },
  { valor: "CHUVA", rotulo: "Chuva", icone: CloudRain },
];

describe("SeletorOpcoes", () => {
  it("é um grupo nomeado com um botão por opção e só a escolhida marcada", () => {
    const html = renderToStaticMarkup(
      <SeletorOpcoes rotulo="Clima da manhã" valor="CHUVA" onChange={vi.fn()} opcoes={opcoes} />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Clima da manhã"');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });

  it("não marca nada sem valor", () => {
    const html = renderToStaticMarkup(
      <SeletorOpcoes rotulo="Clima" valor="" onChange={vi.fn()} opcoes={opcoes} />,
    );
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("todo botão tem altura mínima de toque (≥ 64 px)", () => {
    const html = renderToStaticMarkup(
      <SeletorOpcoes rotulo="Clima" valor="" onChange={vi.fn()} opcoes={opcoes} />,
    );
    expect(html.match(/min-h-16/g)).toHaveLength(2);
  });
});
