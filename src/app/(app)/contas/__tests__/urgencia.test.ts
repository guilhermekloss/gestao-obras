import { describe, expect, it } from "vitest";
import { ordenarPorUrgencia, resumoDeVencidas, rotuloDeUrgencia } from "../urgencia";

const p = (o: Partial<Parameters<typeof rotuloDeUrgencia>[0]> & { vencimento?: string; valorCents?: number } = {}) => ({
  status: "ABERTA" as const,
  vencida: false,
  diasParaVencer: 5,
  vencimento: "2026-10-20T00:00:00.000Z",
  valorCents: 1000,
  ...o,
});

describe("rotuloDeUrgencia", () => {
  it("paga", () => expect(rotuloDeUrgencia(p({ status: "PAGA" }))).toEqual({ estado: "pago", texto: "Paga" }));
  it("vencida diz há quantos dias", () => {
    expect(rotuloDeUrgencia(p({ vencida: true, diasParaVencer: -12 }))).toEqual({ estado: "vencido", texto: "Venceu há 12 dias" });
    expect(rotuloDeUrgencia(p({ vencida: true, diasParaVencer: -1 })).texto).toBe("Venceu ontem");
  });
  it("vence hoje chama atenção; os demais são neutros", () => {
    expect(rotuloDeUrgencia(p({ diasParaVencer: 0 }))).toEqual({ estado: "atencao", texto: "Vence hoje" });
    expect(rotuloDeUrgencia(p({ diasParaVencer: 1 })).texto).toBe("Vence amanhã");
    expect(rotuloDeUrgencia(p({ diasParaVencer: 5 }))).toEqual({ estado: "neutro", texto: "Vence em 5 dias" });
  });
});

describe("ordenarPorUrgencia", () => {
  it("abertas da mais atrasada à mais distante, maior valor primeiro no mesmo dia, pagas no fim", () => {
    const linhas = [
      { id: "paga", ...p({ status: "PAGA", vencimento: "2026-09-01" }) },
      { id: "futura", ...p({ vencimento: "2026-10-30" }) },
      { id: "antiga", ...p({ vencimento: "2026-10-01" }) },
      { id: "mesmo-dia-menor", ...p({ vencimento: "2026-10-10", valorCents: 100 }) },
      { id: "mesmo-dia-maior", ...p({ vencimento: "2026-10-10", valorCents: 900 }) },
    ];
    expect(ordenarPorUrgencia(linhas).map((l) => l.id)).toEqual([
      "antiga",
      "mesmo-dia-maior",
      "mesmo-dia-menor",
      "futura",
      "paga",
    ]);
  });

  it("não altera a lista original", () => {
    const linhas = [p({ vencimento: "2026-10-30" }), p({ vencimento: "2026-10-01" })];
    ordenarPorUrgencia(linhas);
    expect(linhas[0].vencimento).toBe("2026-10-30");
  });
});

describe("resumoDeVencidas", () => {
  it("soma só as abertas vencidas e acha a mais antiga", () => {
    const r = resumoDeVencidas([
      p({ vencida: true, diasParaVencer: -3, valorCents: 500 }),
      p({ vencida: true, diasParaVencer: -12, valorCents: 700 }),
      p({ vencida: true, diasParaVencer: -30, status: "PAGA" }),
      p({ diasParaVencer: 2 }),
    ]);
    expect(r).toEqual({ quantidade: 2, totalCents: 1200, maisAntigaDias: 12 });
  });
  it("sem vencidas, nada", () => expect(resumoDeVencidas([p()])).toBeNull());
});
