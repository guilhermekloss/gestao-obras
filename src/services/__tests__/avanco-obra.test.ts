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

describe("avancoObraHoje", () => {
  // 1/out a 30/nov = 61 dias; no dia 20/out passaram 20 → previsto 32,79%
  const plano = [etapa("a", 100, "2026-10-01", "2026-11-30")];
  const hoje = "2026-10-20";

  it("previsto, realizado, desvio e IDP ponderados", () => {
    const r = avancoObraHoje(plano, [med("a", "2026-10-15", 3_000)], hoje);
    expect(r).toEqual({ previstoBp: 3_279, realizadoBp: 3_000, desvioBp: -279, idp: 9_149, situacao: "EM_DIA" });
  });

  it("mais de 5 p.p. atrás é Atenção; mais de 10 p.p., Atrasada", () => {
    expect(avancoObraHoje(plano, [med("a", "2026-10-15", 2_500)], hoje).situacao).toBe("ATENCAO");
    expect(avancoObraHoje(plano, [med("a", "2026-10-15", 2_200)], hoje).situacao).toBe("ATRASADA");
  });

  it("medição depois de hoje não conta", () => {
    const r = avancoObraHoje(plano, [med("a", "2026-10-25", 9_000)], hoje);
    expect(r.realizadoBp).toBe(0);
    expect(r.situacao).toBe("ATRASADA");
  });

  it("antes do início: IDP null e Não iniciada", () => {
    const r = avancoObraHoje(plano, [], "2026-09-15");
    expect(r).toMatchObject({ previstoBp: 0, realizadoBp: 0, idp: null, situacao: "NAO_INICIADA" });
  });

  it("fim da última etapa vencido sem 100% é Atrasada; 100% é Concluída", () => {
    expect(avancoObraHoje(plano, [med("a", "2026-11-30", 9_800)], "2026-12-05").situacao).toBe("ATRASADA");
    expect(avancoObraHoje(plano, [med("a", "2026-11-30", 10_000)], "2026-12-05").situacao).toBe("CONCLUIDA");
  });

  it("sem nenhuma etapa com datas: Sem datas", () => {
    const r = avancoObraHoje([etapa("a", 100, null, null)], [med("a", "2026-10-01", 2_000)], hoje);
    expect(r).toMatchObject({ previstoBp: 0, realizadoBp: 2_000, idp: null, situacao: "SEM_DATAS" });
  });
});
