import { describe, expect, it } from "vitest";
import { posicaoDoBotao } from "../posicao";

const BASE = "calc(var(--altura-bottom-nav,0px) + 1rem)";

describe("posicaoDoBotao", () => {
  it("fica no canto, acima da barra inferior no celular, nas telas comuns", () => {
    for (const rota of ["/dashboard", "/obras", "/notas", "/diario/abc", "/conta"]) {
      const p = posicaoDoBotao(rota);
      expect(p.celular).toBe(BASE);
      expect(p.desktop).toBe("1rem");
      expect(p.elevadoNoCelular).toBe(false);
    }
  });

  it("sobe acima da BarraDeAcao nos formulários, no celular e no desktop", () => {
    for (const rota of ["/notas/nova", "/notas/importar-xml", "/notas/xyz", "/diario/novo", "/diario/abc/editar", "/contas"]) {
      const p = posicaoDoBotao(rota);
      expect(p.elevadoNoCelular, rota).toBe(true);
      expect(p.elevadoNoDesktop, rota).toBe(true);
      expect(p.celular).toContain("5.5rem");
    }
  });

  it("na lista do diário só sobe no celular", () => {
    const p = posicaoDoBotao("/diario");
    expect(p.elevadoNoCelular).toBe(true);
    expect(p.elevadoNoDesktop).toBe(false);
    expect(p.desktop).toBe("1rem");
  });

  it("ignora a barra final", () => {
    expect(posicaoDoBotao("/diario/novo/").elevadoNoCelular).toBe(true);
  });
});
