import { describe, expect, it } from "vitest";
import { BARRA_NAVEGADOR, cookieDoTema, lerTema, outroTema } from "../tema";

describe("lerTema", () => {
  it("usa o claro quando não há cookie ou o valor é desconhecido", () => {
    expect(lerTema(undefined)).toBe("claro");
    expect(lerTema("")).toBe("claro");
    expect(lerTema("sistema")).toBe("claro");
    expect(lerTema("ESCURO")).toBe("claro");
  });

  it("reconhece o escuro", () => {
    expect(lerTema("escuro")).toBe("escuro");
    expect(lerTema("claro")).toBe("claro");
  });
});

describe("outroTema", () => {
  it("alterna entre claro e escuro", () => {
    expect(outroTema("claro")).toBe("escuro");
    expect(outroTema("escuro")).toBe("claro");
  });
});

describe("cookieDoTema", () => {
  it("vale o site todo, por um ano, e volta lido como o mesmo tema", () => {
    const c = cookieDoTema("escuro");
    expect(c).toBe("tema=escuro; path=/; max-age=31536000; samesite=lax");
    expect(lerTema(c.split(";")[0].split("=")[1])).toBe("escuro");
  });
});

describe("BARRA_NAVEGADOR", () => {
  it("tem uma cor para cada tema", () => {
    expect(BARRA_NAVEGADOR.claro).not.toBe(BARRA_NAVEGADOR.escuro);
  });
});
