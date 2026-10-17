import { describe, expect, it } from "vitest";
import { buscarGuias, guiaDaRota, guiasPara, tourDaTela, tourDeBoasVindas } from "../index";
import type { Guia, Tour } from "../tipos";

const base = { paraQueServe: "", passoAPasso: [], regras: [] };
const guias: Guia[] = [
  { ...base, id: "contas", titulo: "Contas a pagar", papeis: ["ADMIN", "ESCRITORIO"], link: "/contas", rotas: ["/contas"], paraQueServe: "Pagar parcelas em lote" },
  { ...base, id: "fluxo", titulo: "Fluxo mensal", papeis: ["ADMIN", "ESCRITORIO"], link: "/contas/fluxo", rotas: ["/contas/fluxo"] },
  { ...base, id: "diario", titulo: "Diário de obra", papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], link: "/diario", rotas: ["/diario"] },
];
const tours: Tour[] = [
  { id: "bv", papeis: ["ADMIN", "CAMPO"], rotas: [], passos: [] },
  { id: "contas", papeis: ["ADMIN"], rotas: ["/contas"], passos: [] },
];

describe("guiasPara", () => {
  it("filtra pelo papel", () => {
    expect(guiasPara("CAMPO", { guias }).map((g) => g.id)).toEqual(["diario"]);
  });
});

describe("guiaDaRota", () => {
  it("escolhe a rota mais específica", () => {
    expect(guiaDaRota("/contas/fluxo", "ADMIN", { guias })?.id).toBe("fluxo");
    expect(guiaDaRota("/contas", "ADMIN", { guias })?.id).toBe("contas");
  });
  it("não devolve guia que o papel não vê", () => {
    expect(guiaDaRota("/contas", "CAMPO", { guias })).toBeNull();
  });
  it("não confunde prefixo parcial", () => {
    expect(guiaDaRota("/contasx", "ADMIN", { guias })).toBeNull();
  });
});

describe("tours", () => {
  it("boas-vindas é o tour sem rotas do papel", () => {
    expect(tourDeBoasVindas("CAMPO", { tours })?.id).toBe("bv");
    expect(tourDeBoasVindas("ESCRITORIO", { tours })).toBeNull();
  });
  it("tour de tela respeita rota e papel", () => {
    expect(tourDaTela("/contas", "ADMIN", { tours })?.id).toBe("contas");
    expect(tourDaTela("/contas", "CAMPO", { tours })).toBeNull();
  });
});

describe("buscarGuias", () => {
  it("ignora acento e caixa", () => {
    expect(buscarGuias("DIARIO", "ADMIN", { guias }).map((g) => g.id)).toEqual(["diario"]);
  });
  it("exige todos os termos", () => {
    expect(buscarGuias("pagar lote", "ADMIN", { guias }).map((g) => g.id)).toEqual(["contas"]);
    expect(buscarGuias("pagar xyz", "ADMIN", { guias })).toEqual([]);
  });
  it("sem texto devolve todos do papel", () => {
    expect(buscarGuias("  ", "CAMPO", { guias })).toHaveLength(1);
  });
});
