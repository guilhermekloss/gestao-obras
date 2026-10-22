import { describe, expect, it } from "vitest";
import { VALIDADE_DISPOSITIVO_MS, emitirDispositivo, lerDispositivo, nomeDoCookie, valorDoCookie } from "../dispositivo";

const chave = Buffer.alloc(32, 7);
const outraChave = Buffer.alloc(32, 8);
const agora = new Date("2026-10-23T12:00:00Z");
const email = "ana@obra.com";

describe("cookie de aparelho conhecido", () => {
  it("lê o id do cookie que ele mesmo emitiu", () => {
    const { id, valor } = emitirDispositivo(email, chave, agora);
    expect(lerDispositivo(valor, email, chave, agora)).toBe(id);
    expect(valor).not.toContain("ana");
  });

  it("renovar mantém o id do aparelho", () => {
    const { id } = emitirDispositivo(email, chave, agora);
    const renovado = emitirDispositivo(email, chave, agora, id);
    expect(lerDispositivo(renovado.valor, email, chave, agora)).toBe(id);
  });

  it("recusa outro e-mail, outra chave, cookie vencido e assinatura adulterada", () => {
    const { valor } = emitirDispositivo(email, chave, agora);
    expect(lerDispositivo(valor, "bia@obra.com", chave, agora)).toBeNull();
    expect(lerDispositivo(valor, email, outraChave, agora)).toBeNull();
    expect(lerDispositivo(valor, email, chave, new Date(agora.getTime() + VALIDADE_DISPOSITIVO_MS))).toBeNull();
    const partes = valor.split(".");
    expect(lerDispositivo([partes[0], "AAAAAAAAAAAAAAAAAAAAAA", partes[2], partes[3]].join("."), email, chave, agora)).toBeNull();
    expect(lerDispositivo([partes[0], partes[1], "99999999999999", partes[3]].join("."), email, chave, agora)).toBeNull();
  });

  it("recusa lixo sem quebrar", () => {
    for (const v of [undefined, "", "a.b.c", "a.b.c.d.e", "x".repeat(300)]) expect(lerDispositivo(v, email, chave, agora)).toBeNull();
  });

  it("um cookie por conta, com nome estável e sem o e-mail", () => {
    expect(nomeDoCookie(email)).toBe(nomeDoCookie(email));
    expect(nomeDoCookie(email)).not.toBe(nomeDoCookie("bia@obra.com"));
    expect(nomeDoCookie(email)).toMatch(/^dispositivo-[A-Za-z0-9_-]{10}$/);
  });
});

describe("valorDoCookie", () => {
  it("acha o cookie pelo nome exato", () => {
    expect(valorDoCookie("tema=escuro; dispositivo-abc=1.2.3.4; x=y", "dispositivo-abc")).toBe("1.2.3.4");
    expect(valorDoCookie("dispositivo-abcd=1", "dispositivo-abc")).toBeUndefined();
    expect(valorDoCookie(null, "a")).toBeUndefined();
  });
});
