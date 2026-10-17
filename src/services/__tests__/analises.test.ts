import { describe, it, expect } from "vitest";
import {
  curvaAbc,
  classeAbc,
  normalizarDescricao,
  consumoBp,
  faixaConsumo,
  alertasOrcamento,
  alertasParcelasVencidas,
  alertasDivergencia,
  idsDeNotasDivergentes,
  notaDivergente,
  rotuloDocumento,
  montarAlertas,
  type NotaParaAbc,
  type EtapaParaAlerta,
} from "../analises";
import { formatarMoeda } from "@/lib/format";

function item(descricao: string, totalCents: number, extra: Partial<NotaParaAbc["itens"][number]> = {}) {
  return { descricao, unidade: "UN", tipo: "MATERIAL" as const, qtde: 1, totalCents, ...extra };
}

describe("normalizarDescricao", () => {
  it("ignora caixa, espaços nas pontas e espaços repetidos", () => {
    expect(normalizarDescricao("  Cimento   CP-II  50kg ")).toBe("cimento cp-ii 50kg");
  });
});

describe("classeAbc", () => {
  it("o insumo que cruza 80% ainda é A; o que cruza 95% ainda é B", () => {
    expect(classeAbc(0, 100)).toBe("A");
    expect(classeAbc(79, 100)).toBe("A");
    expect(classeAbc(80, 100)).toBe("B");
    expect(classeAbc(94, 100)).toBe("B");
    expect(classeAbc(95, 100)).toBe("C");
  });
});

describe("curvaAbc", () => {
  it("agrupa por descrição normalizada + unidade e soma quantidade e custo", () => {
    const notas: NotaParaAbc[] = [
      {
        fornecedorId: "f1",
        fracaoBp: 10_000,
        itens: [
          item("Cimento CP-II", 3_000, { qtde: 1, unidade: "sc" }),
          item("cimento  cp-ii", 6_000, { qtde: 2, unidade: "SC" }),
          item("Cimento CP-II", 9_000, { qtde: 3, unidade: "KG" }),
        ],
      },
      { fornecedorId: "f2", fracaoBp: 10_000, itens: [item("CIMENTO CP-II", 3_000, { qtde: 1, unidade: "SC" })] },
    ];
    const { insumos, totalCents } = curvaAbc(notas);
    expect(totalCents).toBe(21_000);
    expect(insumos).toHaveLength(2);

    const saco = insumos.find((i) => i.unidade === "SC")!;
    expect(saco.qtde).toBe(4);
    expect(saco.custoCents).toBe(12_000);
    expect(saco.precoMedioCents).toBe(3_000);
    expect(saco.numFornecedores).toBe(2);
    expect(saco.descricao).toBe("cimento  cp-ii");
  });

  it("ordena por custo e classifica A/B/C pelo acumulado, com resumo por classe", () => {
    const notas: NotaParaAbc[] = [
      {
        fornecedorId: "f1",
        fracaoBp: 10_000,
        itens: [
          item("Aço", 7_000),
          item("Concreto", 1_500),
          item("Areia", 1_000),
          item("Prego", 300),
          item("Arame", 200),
        ],
      },
    ];
    const { insumos, resumo } = curvaAbc(notas);
    expect(insumos.map((i) => [i.descricao, i.classe])).toEqual([
      ["Aço", "A"],
      ["Concreto", "A"],
      ["Areia", "B"],
      ["Prego", "C"],
      ["Arame", "C"],
    ]);
    expect(insumos[0].participacaoBp).toBe(7_000);
    expect(insumos[1].acumuladoBp).toBe(8_500);
    expect(insumos.at(-1)!.acumuladoBp).toBe(10_000);
    expect(resumo.A).toEqual({ itens: 2, custoCents: 8_500, participacaoBp: 8_500 });
    expect(resumo.B).toEqual({ itens: 1, custoCents: 1_000, participacaoBp: 1_000 });
    expect(resumo.C).toEqual({ itens: 2, custoCents: 500, participacaoBp: 500 });
  });

  it("aplica a fração do rateio ao custo e à quantidade (preço médio inalterado)", () => {
    const { insumos } = curvaAbc([
      { fornecedorId: "f1", fracaoBp: 2_500, itens: [item("Tijolo", 10_000, { qtde: 1000, unidade: "MIL" })] },
    ]);
    expect(insumos[0].custoCents).toBe(2_500);
    expect(insumos[0].qtde).toBe(250);
    expect(insumos[0].precoMedioCents).toBe(10);
  });

  it("um único insumo com quase todo o custo é A, não B", () => {
    const { insumos } = curvaAbc([
      { fornecedorId: "f1", fracaoBp: 10_000, itens: [item("Aço", 9_000), item("Areia", 1_000)] },
    ]);
    expect(insumos.map((i) => i.classe)).toEqual(["A", "B"]);
  });

  it("sem itens → curva vazia; quantidade zero → preço médio null", () => {
    expect(curvaAbc([]).insumos).toEqual([]);
    expect(curvaAbc([]).totalCents).toBe(0);
    const { insumos } = curvaAbc([
      { fornecedorId: "f1", fracaoBp: 10_000, itens: [item("Taxa", 500, { qtde: 0, tipo: "ENCARGO" })] },
    ]);
    expect(insumos[0].precoMedioCents).toBeNull();
    expect(insumos[0].tipo).toBe("ENCARGO");
  });
});

describe("faixaConsumo / consumoBp", () => {
  it("classifica pelo consumo do previsto", () => {
    expect(faixaConsumo(0, 500)).toBe("SEM_ORCAMENTO");
    expect(faixaConsumo(10_000, 8_999)).toBe("OK");
    expect(faixaConsumo(10_000, 9_000)).toBe("ATENCAO");
    expect(faixaConsumo(10_000, 10_000)).toBe("ATENCAO");
    expect(faixaConsumo(10_000, 10_001)).toBe("ESTOURO");
  });

  it("consumo em basis points, null sem previsto", () => {
    expect(consumoBp(20_000, 5_000)).toBe(2_500);
    expect(consumoBp(0, 5_000)).toBeNull();
  });
});

const etapa = (id: string, previsto: number, realizado: number): EtapaParaAlerta => ({
  etapaId: id,
  etapaNome: `Etapa ${id}`,
  obraId: "o1",
  obraNome: "Lote 01",
  previstoCents: previsto,
  realizadoCents: realizado,
});

describe("alertasOrcamento", () => {
  it("gera estouro (crítico) e atenção, ignorando etapas ok e sem orçamento", () => {
    const alertas = alertasOrcamento([
      etapa("ok", 10_000, 5_000),
      etapa("sem", 0, 5_000),
      etapa("at", 10_000, 9_500),
      etapa("e1", 10_000, 11_000),
      etapa("e2", 10_000, 15_000),
    ]);
    expect(alertas.map((a) => a.id)).toEqual(["estouro:e2", "estouro:e1", "atencao:at"]);
    expect(alertas[0].severidade).toBe("CRITICA");
    expect(alertas[0].mensagem).toContain(formatarMoeda(5_000));
    expect(alertas[0].link).toBe("/orcamento?obra=o1");
    expect(alertas[2].severidade).toBe("ATENCAO");
    expect(alertas[2].mensagem).toContain("95%");
  });
});

describe("alertasParcelasVencidas", () => {
  const hoje = new Date(2026, 9, 14, 15, 0);
  const parcela = (notaId: string, valorCents: number, vencimento: Date) => ({
    notaId,
    notaNumero: `N${notaId}`,
    fornecedorNome: "Depósito",
    valorCents,
    vencimento,
  });

  it("só conta as vencidas antes de hoje e agrupa por nota, mais antiga primeiro", () => {
    const alertas = alertasParcelasVencidas(
      [
        parcela("a", 100, new Date(2026, 9, 14, 9, 0)),
        parcela("b", 200, new Date(2026, 9, 10)),
        parcela("b", 300, new Date(2026, 8, 10)),
        parcela("c", 400, new Date(2026, 9, 1)),
      ],
      hoje,
    );
    expect(alertas.map((a) => a.id)).toEqual(["vencida:b", "vencida:c"]);
    expect(alertas[0].mensagem).toContain("2 parcelas vencidas");
    expect(alertas[0].mensagem).toContain(formatarMoeda(500));
    expect(alertas[0].mensagem).toContain("10/09/2026");
    expect(alertas[0].link).toBe("/notas/b");
    expect(alertas[1].mensagem).toContain("parcela de");
  });
});

describe("alertasDivergencia", () => {
  it("lista só notas divergentes, maior diferença primeiro", () => {
    const alertas = alertasDivergencia([
      { id: "1", numero: "1", fornecedorNome: "A", totalCents: 1_000, somaItensCents: 1_000 },
      { id: "2", numero: "2", fornecedorNome: "B", totalCents: 1_000, somaItensCents: 990 },
      { id: "3", numero: "3", fornecedorNome: "C", totalCents: 1_000, somaItensCents: 1_500 },
    ]);
    expect(alertas.map((a) => a.id)).toEqual(["divergencia:3", "divergencia:2"]);
    expect(alertas[0].link).toBe("/notas/3");
  });
});

describe("montarAlertas", () => {
  it("ordena: estouro, parcela vencida, atenção de orçamento, divergência", () => {
    const alertas = montarAlertas({
      hoje: new Date(2026, 9, 14),
      etapas: [etapa("at", 10_000, 9_500), etapa("e", 10_000, 12_000)],
      parcelas: [
        { notaId: "p", notaNumero: "1", fornecedorNome: "X", valorCents: 1, vencimento: new Date(2026, 0, 1) },
      ],
      notas: [{ id: "d", numero: "2", fornecedorNome: "Y", totalCents: 2, somaItensCents: 1 }],
    });
    expect(alertas.map((a) => a.tipo)).toEqual([
      "ORCAMENTO_ESTOURO",
      "PARCELA_VENCIDA",
      "ORCAMENTO_ATENCAO",
      "NOTA_DIVERGENTE",
    ]);
  });
});

describe("rótulo do tipo de documento nos alertas", () => {
  it("rotuloDocumento usa o rótulo curto do tipo; sem tipo é NF", () => {
    expect(rotuloDocumento("NF", "123")).toBe("NF 123");
    expect(rotuloDocumento("RECIBO", "REC-0001")).toBe("Recibo REC-0001");
    expect(rotuloDocumento("FOLHA", "FOL-0002")).toBe("Folha FOL-0002");
    expect(rotuloDocumento("GUIA", "GUIA-0001")).toBe("Guia GUIA-0001");
    expect(rotuloDocumento("OUTRO", "DOC-0003")).toBe("Outro DOC-0003");
    expect(rotuloDocumento(undefined, "9")).toBe("NF 9");
  });

  it("parcela vencida de recibo diz Recibo, não NF", () => {
    const [a] = alertasParcelasVencidas(
      [
        {
          notaId: "r",
          notaNumero: "REC-0001",
          tipoDocumento: "RECIBO",
          fornecedorNome: "Zé",
          valorCents: 100,
          vencimento: new Date(2026, 8, 1),
        },
      ],
      new Date(2026, 9, 14),
    );
    expect(a.mensagem).toContain("Zé · Recibo REC-0001: parcela de");
    expect(a.mensagem).not.toContain("NF");
  });

  it("divergência de guia diz Guia; sem tipo mantém NF", () => {
    const alertas = alertasDivergencia([
      { id: "g", numero: "GUIA-0001", tipoDocumento: "GUIA", fornecedorNome: "Prefeitura", totalCents: 10, somaItensCents: 5 },
      { id: "n", numero: "7", fornecedorNome: "Loja", totalCents: 10, somaItensCents: 5 },
    ]);
    expect(alertas[0].mensagem).toContain("Prefeitura · Guia GUIA-0001: itens somam");
    expect(alertas[1].mensagem).toContain("Loja · NF 7: itens somam");
  });
});

describe("notaDivergente / idsDeNotasDivergentes", () => {
  it("compara soma dos itens com o total", () => {
    expect(notaDivergente(1_000, 1_000)).toBe(false);
    expect(notaDivergente(1_000, 999)).toBe(true);
  });

  it("lista só as divergentes, na ordem recebida; nota sem itens soma zero", () => {
    const somas = new Map([
      ["a", 1_000],
      ["b", 900],
    ]);
    const ids = idsDeNotasDivergentes(
      [
        { id: "a", totalCents: 1_000 },
        { id: "b", totalCents: 1_000 },
        { id: "c", totalCents: 500 },
      ],
      somas,
    );
    expect(ids).toEqual(["b", "c"]);
  });

  it("é a mesma regra do alerta do dashboard", () => {
    const notas = [
      { id: "a", numero: "1", fornecedorNome: "A", totalCents: 1_000, somaItensCents: 1_000 },
      { id: "b", numero: "2", fornecedorNome: "B", totalCents: 1_000, somaItensCents: 900 },
      { id: "c", numero: "3", fornecedorNome: "C", totalCents: 500, somaItensCents: 0 },
    ];
    const doAlerta = alertasDivergencia(notas).map((x) => x.id.replace("divergencia:", "")).sort();
    const doFiltro = idsDeNotasDivergentes(
      notas,
      new Map(notas.map((n) => [n.id, n.somaItensCents])),
    ).sort();
    expect(doFiltro).toEqual(doAlerta);
  });
});
