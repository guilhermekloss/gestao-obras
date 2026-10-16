import { describe, expect, it } from "vitest";
import { politicaDeConteudo } from "../csp";

describe("politicaDeConteudo", () => {
  it("monta a política completa, com o nonce e sem unsafe-eval em produção", () => {
    expect(politicaDeConteudo("abc123")).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src 'self' blob:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
      ].join("; "),
    );
  });

  it("só libera unsafe-eval no desenvolvimento", () => {
    expect(politicaDeConteudo("n", true)).toContain("script-src 'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval';");
    expect(politicaDeConteudo("n", false)).not.toContain("unsafe-eval");
    expect(politicaDeConteudo("n")).not.toContain("unsafe-eval");
  });
});
