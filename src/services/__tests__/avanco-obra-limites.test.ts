import { describe, expect, it } from "vitest";
import { avancoObraHoje } from "../avanco-obra";
import type { EtapaPlano, MedicaoPonto } from "../cronograma";

const etapa = (id: string, orcamentoCents: number, inicio: string | null, fim: string | null): EtapaPlano => ({
  id,
  orcamentoCents,
  inicioPrevisto: inicio,
  fimPrevisto: fim,
});
const med = (etapaId: string, data: string, percentBp: number): MedicaoPonto => ({ etapaId, data, percentBp });

describe("avancoObraHoje: limites da situação", () => {
  const a = etapa("a", 100, "2026-10-01", "2026-11-30");

  it("no próprio dia do fim previsto ainda não está vencida; atraso de exatos 5 p.p. é Em dia", () => {
    // previsto 100% no dia do fim; realizado 95% → atraso 500 bp, igual à margem de atenção
    expect(avancoObraHoje([a], [med("a", "2026-11-30", 9_500)], "2026-11-30")).toEqual({
      previstoBp: 10_000,
      realizadoBp: 9_500,
      desvioBp: -500,
      idp: 9_500,
      situacao: "EM_DIA",
    });
  });

  it("atraso de exatos 10 p.p. é Atenção, não Atrasada", () => {
    expect(avancoObraHoje([a], [med("a", "2026-11-30", 9_000)], "2026-11-30").situacao).toBe("ATENCAO");
  });

  it("o prazo da obra é o fim da última etapa, não da primeira", () => {
    const b = etapa("b", 100, "2026-10-01", "2026-12-31");
    // "a" já venceu em 30/nov, mas "b" vai até 31/dez e o realizado acompanha o previsto
    const r = avancoObraHoje([a, b], [med("a", "2026-11-30", 10_000), med("b", "2026-12-01", 7_174)], "2026-12-05");
    expect(r).toEqual({ previstoBp: 8_587, realizadoBp: 8_587, desvioBp: 0, idp: 10_000, situacao: "EM_DIA" });
  });

  it("passado o fim da última etapa, mesmo com pouco atraso, é Atrasada", () => {
    const b = etapa("b", 100, "2026-10-01", "2026-12-31");
    const r = avancoObraHoje([a, b], [med("a", "2026-11-30", 9_800), med("b", "2026-12-31", 9_800)], "2027-01-05");
    expect(r.situacao).toBe("ATRASADA");
  });

  describe("quais etapas definem o prazo", () => {
    // "a" venceu em 30/nov com 98%: só uma etapa válida com fim depois de hoje tira a obra de Atrasada
    const medicoes = [med("a", "2026-11-30", 9_800)];
    const hoje = "2026-12-05";

    it("etapa com início e fim no mesmo dia conta", () => {
      const b = etapa("b", 0, "2027-03-01", "2027-03-01");
      expect(avancoObraHoje([a, b], medicoes, hoje).situacao).toBe("EM_DIA");
    });

    it("etapa sem início não conta", () => {
      const b = etapa("b", 0, null, "2027-03-01");
      expect(avancoObraHoje([a, b], medicoes, hoje).situacao).toBe("ATRASADA");
    });

    it("etapa com fim antes do início não conta", () => {
      const b = etapa("b", 0, "2027-03-01", "2027-02-01");
      expect(avancoObraHoje([a, b], medicoes, hoje).situacao).toBe("ATRASADA");
    });
  });
});
