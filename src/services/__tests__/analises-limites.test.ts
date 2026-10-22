import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatarMoeda } from "@/lib/format";

const etapaFindMany = vi.fn();
const parcelaFindMany = vi.fn();
const notaFindMany = vi.fn();
const realizadoPorEtapaTodas = vi.fn();
const realizadoPorObra = vi.fn();
const avancoPorEtapa = vi.fn();
const notasParaAnalise = vi.fn();
const carregarAlertasDaCaptura = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { etapa: { findMany: etapaFindMany }, parcela: { findMany: parcelaFindMany }, notaFiscal: { findMany: notaFindMany } },
}));
vi.mock("../custos", () => ({ realizadoPorEtapaTodas, realizadoPorObra, avancoPorEtapa, notasParaAnalise }));
vi.mock("../sefaz/painel", () => ({ carregarAlertasDaCaptura }));

const { alertasOrcamento, alertasParcelasVencidas, carregarAlertas, carregarCurvaAbc, curvaAbc } = await import("../analises");

const item = (descricao: string, totalCents: number, unidade = "UN") => ({ descricao, unidade, tipo: "MATERIAL" as const, qtde: 1, totalCents });
const nota = (itens: ReturnType<typeof item>[], fornecedorId = "f1") => ({ fornecedorId, fracaoBp: 10_000, itens });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("curvaAbc: limites", () => {
  it("unidade com espaço e caixa diferente cai no mesmo insumo, e a descrição perde os espaços", () => {
    const { insumos } = curvaAbc([nota([item("  Areia média  ", 300, " m3 ")]), nota([item("areia média", 200, "M3")])]);
    expect(insumos.map((i) => [i.chave, i.descricao, i.unidade, i.custoCents])).toEqual([["areia média|M3", "Areia média", "M3", 500]]);
  });

  it("a descrição vem do maior item; empate mantém a primeira", () => {
    const maior = curvaAbc([nota([item("areia", 100), item("  AREIA  ", 300)])]);
    expect(maior.insumos[0].descricao).toBe("AREIA");
    const empate = curvaAbc([nota([item("Areia", 300), item("AREIA", 300)])]);
    expect(empate.insumos[0].descricao).toBe("Areia");
  });

  it("ordena do maior custo para o menor e desempata pela chave", () => {
    const { insumos } = curvaAbc([nota([item("tijolo", 100), item("cimento", 500), item("brita", 100)])]);
    expect(insumos.map((i) => i.chave)).toEqual(["cimento|UN", "brita|UN", "tijolo|UN"]);
  });

  it("insumos de custo zero têm participação zero, não NaN", () => {
    const { insumos, resumo } = curvaAbc([nota([item("brinde", 0)])]);
    expect(insumos[0]).toMatchObject({ participacaoBp: 0, acumuladoBp: 0, classe: "C" });
    expect(resumo.C).toEqual({ itens: 1, custoCents: 0, participacaoBp: 0 });
  });
});

describe("alertasOrcamento: ordem das atenções", () => {
  it("atenção com maior consumo vem primeiro", () => {
    const etapa = (etapaId: string, realizadoCents: number) => ({
      etapaId,
      etapaNome: etapaId,
      obraId: "o1",
      obraNome: "Obra",
      previstoCents: 1_000,
      realizadoCents,
    });
    expect(alertasOrcamento([etapa("e1", 910), etapa("e2", 990)]).map((a) => a.id)).toEqual(["atencao:e2", "atencao:e1"]);
  });
});

describe("alertasParcelasVencidas: limites", () => {
  const hoje = new Date(2026, 9, 14, 15, 0);
  const parcela = (notaId: string, valorCents: number, vencimento: Date) => ({
    notaId,
    notaNumero: notaId,
    fornecedorNome: "Depósito",
    valorCents,
    vencimento,
  });

  it("parcela que vence à meia-noite de hoje ainda não está vencida", () => {
    expect(alertasParcelasVencidas([parcela("a", 100, new Date(2026, 9, 14, 0, 0))], hoje)).toEqual([]);
  });

  it("mantém a data mais antiga da nota mesmo quando a seguinte é mais nova", () => {
    const [alerta] = alertasParcelasVencidas([parcela("a", 100, new Date(2026, 8, 1)), parcela("a", 200, new Date(2026, 9, 1))], hoje);
    expect(alerta.mensagem).toBe(`Depósito · NF a: 2 parcelas vencidas (${formatarMoeda(300)}) desde 01/09/2026`);
  });

  it("notas em ordem da parcela mais antiga, qualquer que seja a ordem recebida", () => {
    const alertas = alertasParcelasVencidas([parcela("nova", 100, new Date(2026, 9, 10)), parcela("velha", 100, new Date(2026, 7, 1))], hoje);
    expect(alertas.map((a) => a.id)).toEqual(["vencida:velha", "vencida:nova"]);
  });
});

describe("carregarCurvaAbc", () => {
  const notaDoBanco = (fracoes: number[], qtde: string) => ({
    fornecedorId: "f1",
    rateios: fracoes.map((fracaoBp) => ({ fracaoBp })),
    itens: [{ descricao: "Cimento", unidade: "SC", tipo: "MATERIAL", qtde, totalCents: 1_000 }],
  });

  it("com obra, aplica a fração do rateio da obra; nota sem rateio dela entra com zero", async () => {
    notaFindMany.mockResolvedValue([notaDoBanco([5_000], "10"), notaDoBanco([], "4")]);
    const curva = await carregarCurvaAbc({ obraId: "o1" });
    expect(curva.totalCents).toBe(500);
    expect(curva.insumos[0]).toMatchObject({ custoCents: 500, qtde: 5, precoMedioCents: 100 });
  });

  it("sem filtro, usa a leitura compartilhada: nota inteira (mesmo com rateio) e quantidade vira número", async () => {
    notasParaAnalise.mockResolvedValue([
      { ...notaDoBanco([], "2.5"), rateios: [{ obraId: "o1", etapaId: null, fracaoBp: 3_000 }] },
      notaDoBanco([], "1.5"),
    ]);
    const curva = await carregarCurvaAbc();
    expect(curva.insumos[0]).toMatchObject({ custoCents: 2_000, qtde: 4, precoMedioCents: 500 });
    expect(notaFindMany).not.toHaveBeenCalled();
  });

  it("com qualquer filtro, mantém a consulta própria com o mesmo where", async () => {
    notaFindMany.mockResolvedValue([notaDoBanco([], "2")]);
    const de = new Date(2026, 0, 1);
    const ate = new Date(2026, 5, 30);
    const curva = await carregarCurvaAbc({ de, ate, tipo: "MATERIAL" });
    expect(curva.insumos[0]).toMatchObject({ custoCents: 1_000, qtde: 2 });
    expect(notasParaAnalise).not.toHaveBeenCalled();
    expect(notaFindMany).toHaveBeenCalledWith({
      where: { dataCompra: { gte: de, lte: ate } },
      select: {
        fornecedorId: true,
        rateios: { where: { obraId: "" }, select: { fracaoBp: true } },
        itens: {
          where: { tipo: "MATERIAL" },
          select: { descricao: true, unidade: true, tipo: true, qtde: true, totalCents: true },
        },
      },
    });

    await carregarCurvaAbc({ obraId: "o1" });
    expect(notaFindMany).toHaveBeenLastCalledWith({
      where: { rateios: { some: { obraId: "o1" } } },
      select: {
        fornecedorId: true,
        rateios: { where: { obraId: "o1" }, select: { fracaoBp: true } },
        itens: {
          where: undefined,
          select: { descricao: true, unidade: true, tipo: true, qtde: true, totalCents: true },
        },
      },
    });
  });
});

describe("carregarAlertas", () => {
  const hoje = new Date(2026, 9, 14, 15, 0);

  beforeEach(() => {
    etapaFindMany.mockResolvedValue([
      { id: "e1", nome: "Fundação", orcamentoCents: 1_000, obra: { id: "o1", nome: "Casa A" } },
      { id: "e2", nome: "Telhado", orcamentoCents: 1_000, obra: { id: "o1", nome: "Casa A" } },
    ]);
    realizadoPorEtapaTodas.mockResolvedValue(new Map([["e1", 1_500]]));
    realizadoPorObra.mockResolvedValue(new Map([["o1", 1_500]]));
    avancoPorEtapa.mockResolvedValue(new Map());
    parcelaFindMany.mockResolvedValue([
      { valorCents: 700, vencimento: new Date(2026, 9, 1), nota: { id: "n1", numero: "REC-0001", tipoDocumento: "RECIBO", fornecedor: { nome: "Ferragens" } } },
    ]);
    // formato de notasParaAnalise: campos a mais (rateios, dataCompra, item completo) não mudam o alerta
    const itemNota = (totalCents: number) => ({ descricao: "x", unidade: "UN", tipo: "MATERIAL", qtde: "1", totalCents });
    const doBanco = { dataCompra: new Date(2026, 9, 1), fornecedorId: "f1", rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 10_000 }] };
    notasParaAnalise.mockResolvedValue([
      { ...doBanco, id: "n2", numero: "46", tipoDocumento: "NF", totalCents: 1_000, fornecedor: { nome: "Depósito" }, itens: [itemNota(400), itemNota(500)] },
      { ...doBanco, id: "n3", numero: "47", tipoDocumento: "NF", totalCents: 300, fornecedor: { nome: "Depósito" }, itens: [itemNota(300)] },
    ]);
    carregarAlertasDaCaptura.mockResolvedValue([
      { id: "nfe-recebida-parada", tipo: "NFE_RECEBIDA", severidade: "ATENCAO", mensagem: "x", link: "/sefaz" },
      { id: "sefaz-cert", tipo: "SEFAZ_CERTIFICADO", severidade: "CRITICA", mensagem: "y", link: "/empresa" },
    ]);
  });

  it("junta orçamento, parcelas, divergências e captura, na ordem de gravidade", async () => {
    const alertas = await carregarAlertas(hoje);
    expect(alertas).toEqual([
      {
        id: "estouro:e1",
        tipo: "ORCAMENTO_ESTOURO",
        severidade: "CRITICA",
        mensagem: `Casa A · Fundação: orçamento estourado em ${formatarMoeda(500)} (150% consumido)`,
        link: "/orcamento?obra=o1",
        obraId: "o1",
      },
      {
        id: "vencida:n1",
        tipo: "PARCELA_VENCIDA",
        severidade: "CRITICA",
        mensagem: `Ferragens · Recibo REC-0001: parcela de ${formatarMoeda(700)} vencida em 01/10/2026`,
        link: "/notas/n1",
      },
      { id: "sefaz-cert", tipo: "SEFAZ_CERTIFICADO", severidade: "CRITICA", mensagem: "y", link: "/empresa" },
      {
        id: "divergencia:n2",
        tipo: "NOTA_DIVERGENTE",
        severidade: "ATENCAO",
        mensagem: `Depósito · NF 46: itens somam ${formatarMoeda(900)}, nota ${formatarMoeda(1_000)}`,
        link: "/notas/n2",
      },
      { id: "nfe-recebida-parada", tipo: "NFE_RECEBIDA", severidade: "ATENCAO", mensagem: "x", link: "/sefaz" },
    ]);
    expect(carregarAlertasDaCaptura).toHaveBeenCalledWith(false, hoje);
    expect(notaFindMany).not.toHaveBeenCalled();
  });

  it("repassa paraAdmin para os alertas da captura", async () => {
    await carregarAlertas(hoje, { paraAdmin: true });
    expect(carregarAlertasDaCaptura).toHaveBeenCalledWith(true, hoje);
  });

  it("filtrado por obra: etapas e parcelas filtradas no banco, notas de outra obra e captura fora", async () => {
    notasParaAnalise.mockResolvedValue([
      {
        id: "n9", numero: "9", tipoDocumento: "NF", totalCents: 1_000, fornecedorId: "f1", dataCompra: new Date(2026, 9, 1),
        fornecedor: { nome: "Outro" }, itens: [{ totalCents: 1 }], rateios: [{ obraId: "o2", etapaId: null, fracaoBp: 10_000 }],
      },
    ]);
    const alertas = await carregarAlertas(hoje, { obraId: "o1" });
    expect(etapaFindMany.mock.calls[0][0].where).toEqual({ obraId: "o1" });
    expect(parcelaFindMany.mock.calls[0][0].where.nota).toEqual({ rateios: { some: { obraId: "o1" } } });
    expect(carregarAlertasDaCaptura).not.toHaveBeenCalled();
    expect(alertas.map((a) => a.id)).toEqual(["estouro:e1", "vencida:n1"]);
  });

  it("tendência da obra conta o realizado sem etapa e o físico das etapas", async () => {
    // e1: orçado 1.000, físico 50%, realizado 1.500 → tendência 3.000; e2: orçado 1.000, sem físico → 1.000
    avancoPorEtapa.mockResolvedValue(new Map([["e1", 5_000]]));
    const alertas = await carregarAlertas(hoje, { obraId: "o1" });
    const tendencia = alertas.find((a) => a.tipo === "ORCAMENTO_TENDENCIA");
    expect(tendencia).toMatchObject({ id: "tendencia:o1", obraId: "o1", link: "/orcamento?obra=o1", severidade: "ATENCAO" });
    expect(tendencia!.mensagem).toContain(formatarMoeda(4_000));
    expect(tendencia!.mensagem).toContain("100%");
  });
});
