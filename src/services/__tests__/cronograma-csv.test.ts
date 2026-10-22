import { describe, expect, it } from "vitest";
import { celulaCsv, montarCsvCronograma, nomeArquivoCsvCronograma, type LinhaCsvCronograma } from "../cronograma-csv";

const FUNDACAO: LinhaCsvCronograma = {
  nome: "Fundação",
  inicio: "2026-01-01",
  fim: "2026-01-31",
  previstoHojeBp: 5161,
  realizadoBp: 4500,
  desvioBp: -661,
  situacao: "ATENCAO",
  linhaBaseInicio: "2026-01-01",
  linhaBaseFim: "2026-01-26",
  variacaoFimDias: 5,
  pesoBp: 2500,
};

const SEM_DATAS: LinhaCsvCronograma = {
  nome: "Acabamento",
  inicio: null,
  fim: null,
  previstoHojeBp: 0,
  realizadoBp: 0,
  desvioBp: 0,
  situacao: "SEM_DATAS",
  linhaBaseInicio: null,
  linhaBaseFim: null,
  variacaoFimDias: null,
  pesoBp: 0,
};

function linhas(csv: string): string[][] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n").map((l) => l.split(";"));
}

describe("celulaCsv", () => {
  it("neutraliza fórmula no começo do texto", () => {
    expect(celulaCsv("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(celulaCsv("=1+1")).toBe("'=1+1");
    expect(celulaCsv("+55 11")).toBe("'+55 11");
    expect(celulaCsv("-cmd")).toBe("'-cmd");
    expect(celulaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celulaCsv("\tx")).toBe("'\tx");
  });

  it("número negativo passa como número", () => {
    expect(celulaCsv("-8,5")).toBe("-8,5");
    expect(celulaCsv("-3")).toBe("-3");
    expect(celulaCsv(-3)).toBe("-3");
  });

  it("aspas, ponto e vírgula e quebra de linha vão entre aspas", () => {
    expect(celulaCsv("Laje; 2º pav.")).toBe("\"Laje; 2º pav.\"");
    expect(celulaCsv("Viga \"V1\"")).toBe("\"Viga \"\"V1\"\"\"");
    expect(celulaCsv("linha\nnova")).toBe("\"linha\nnova\"");
  });

  it("texto comum e vazio", () => {
    expect(celulaCsv("Alvenaria")).toBe("Alvenaria");
    expect(celulaCsv("")).toBe("");
    expect(celulaCsv(null)).toBe("");
  });
});

describe("montarCsvCronograma", () => {
  it("começa com BOM UTF-8 e usa ; e CRLF", () => {
    const csv = montarCsvCronograma([FUNDACAO], { comPeso: true });
    expect(csv.startsWith("﻿Etapa;Início;Fim;")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("monta as colunas com datas dd/mm/aaaa e vírgula decimal", () => {
    const [cabecalho, fundacao] = linhas(montarCsvCronograma([FUNDACAO], { comPeso: true }));
    expect(cabecalho).toEqual([
      "Etapa",
      "Início",
      "Fim",
      "Duração (dias)",
      "Previsto hoje (%)",
      "Realizado (%)",
      "Desvio (p.p.)",
      "Status",
      "LB início",
      "LB fim",
      "Variação do fim (dias)",
      "Peso (%)",
    ]);
    expect(fundacao).toEqual([
      "Fundação",
      "01/01/2026",
      "31/01/2026",
      "31",
      "51,61",
      "45",
      "-6,61",
      "Atenção",
      "01/01/2026",
      "26/01/2026",
      "5",
      "25",
    ]);
  });

  it("sem peso para quem não vê valores", () => {
    const [cabecalho, fundacao] = linhas(montarCsvCronograma([FUNDACAO], { comPeso: false }));
    expect(cabecalho).not.toContain("Peso (%)");
    expect(cabecalho).toHaveLength(11);
    expect(fundacao).toHaveLength(11);
    expect(fundacao).not.toContain("25");
  });

  it("etapa sem datas deixa as colunas do plano vazias", () => {
    const [, , semDatas] = linhas(montarCsvCronograma([FUNDACAO, SEM_DATAS], { comPeso: true }));
    expect(semDatas).toEqual(["Acabamento", "", "", "", "", "0", "", "Sem datas", "", "", "", "0"]);
  });

  it("nome de etapa malicioso não vira fórmula", () => {
    const csv = montarCsvCronograma([{ ...FUNDACAO, nome: "=cmd|' /C calc'!A0" }], { comPeso: false });
    expect(linhas(csv)[1][0]).toBe("'=cmd|' /C calc'!A0");
  });

  it("variação negativa sai como número", () => {
    const [, fundacao] = linhas(montarCsvCronograma([{ ...FUNDACAO, variacaoFimDias: -2 }], { comPeso: false }));
    expect(fundacao[10]).toBe("-2");
  });
});

describe("nomeArquivoCsvCronograma", () => {
  it("só caracteres seguros", () => {
    expect(nomeArquivoCsvCronograma("L03", "2026-10-22")).toBe("cronograma-L03-2026-10-22.csv");
    expect(nomeArquivoCsvCronograma("Lote \"São\" 3/A", "2026-10-22")).toBe("cronograma-Lote-Sao-3-A-2026-10-22.csv");
    expect(nomeArquivoCsvCronograma("***", "2026-10-22")).toBe("cronograma-obra-2026-10-22.csv");
  });
});
