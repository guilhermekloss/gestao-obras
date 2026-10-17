import { describe, expect, it } from "vitest";
import { passosVisiveis } from "../passos";

const passos = [
  { titulo: "Início", texto: "sem alvo" },
  { alvo: "#a", titulo: "A", texto: "existe" },
  { alvo: "#b", titulo: "B", texto: "oculto" },
];

describe("passosVisiveis", () => {
  it("mantém passos sem alvo e com alvo presente; pula o que não existe", () => {
    const r = passosVisiveis(passos, (s) => s === "#a");
    expect(r.map((p) => p.titulo)).toEqual(["Início", "A"]);
  });

  it("sem nenhum alvo visível, sobram só os passos centralizados", () => {
    expect(passosVisiveis(passos, () => false).map((p) => p.titulo)).toEqual(["Início"]);
  });

  it("lista vazia continua vazia", () => {
    expect(passosVisiveis([], () => true)).toEqual([]);
  });
});
