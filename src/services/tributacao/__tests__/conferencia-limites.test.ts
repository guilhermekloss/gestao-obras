import { describe, expect, it } from "vitest";
import {
  conferirTributacao,
  itemDaNfe,
  itemDaNota,
  type ClassificacaoParaConferir,
  type ContextoConferencia,
  type ItemParaConferir,
  type NomenclaturaRef,
} from "../conferencia";

const classif = (o: Partial<ClassificacaoParaConferir> = {}): ClassificacaoParaConferir => ({
  codigo: "000001",
  inicioVigencia: "2026-01-01",
  fimVigencia: null,
  cst: "000",
  descricao: "Situações tributadas integralmente",
  pRedCbs: null,
  pRedIbs: null,
  apropriaCreditoCbs: true,
  apropriaCreditoIbs: true,
  creditoPresumidoAdquirente: false,
  indReducao: false,
  ...o,
});

// 10.000,00 a 0,9% de CBS e 0,1% de IBS: 90,00 e 10,00
const item = (o: Partial<ItemParaConferir> = {}): ItemParaConferir => ({
  ncm: "25232910",
  nbs: null,
  cst: "000",
  cClassTrib: "000001",
  ibsCbsBaseCents: 1_000_000,
  pCbs: "0.9",
  pIbsUf: "0.1",
  pIbsMun: "0",
  pRedCbs: null,
  pRedIbs: null,
  cbsCents: 9_000,
  ibsUfCents: 1_000,
  ibsMunCents: 0,
  ibsCbsDiferidoCents: null,
  ...o,
});

const nomen = (o: Partial<NomenclaturaRef> = {}): NomenclaturaRef => ({
  tipo: "NCM",
  codigo: "2523",
  cClassTrib: "000001",
  excecao: false,
  inicioVigencia: "2026-01-01",
  fimVigencia: null,
  ...o,
});

const ctx = (o: Partial<ContextoConferencia> = {}): ContextoConferencia => ({
  dataEmissao: "2026-06-10",
  crtEmitente: "3",
  classificacoes: [classif()],
  nomenclaturas: [],
  ...o,
});

const codigos = (itens: ItemParaConferir[], c: ContextoConferencia) => conferirTributacao(itens, c).map((a) => a.codigo);

describe("conferirTributacao: nota correta", () => {
  it("não acusa nada", () => {
    expect(conferirTributacao([item()], ctx())).toEqual([]);
  });
  it("sem itens não acusa nada", () => {
    expect(conferirTributacao([], ctx())).toEqual([]);
  });
});

describe("classificação inexistente ou fora de vigência", () => {
  it("código que não está na tabela", () => {
    const [a] = conferirTributacao([item({ cClassTrib: "999999" })], ctx());
    expect(a).toMatchObject({ itemIndex: 0, severidade: "ATENCAO", codigo: "CLASSIFICACAO_INEXISTENTE" });
  });
  it("item com CST e sem classificação", () => {
    expect(codigos([item({ cClassTrib: null })], ctx())).toEqual(["CLASSIFICACAO_INEXISTENTE"]);
  });
  it("antes do início da vigência", () => {
    expect(codigos([item()], ctx({ dataEmissao: "2025-12-31" }))).toEqual(["CLASSIFICACAO_FORA_DE_VIGENCIA"]);
  });
  it("o último dia da vigência ainda vale; o seguinte não", () => {
    const c = [classif({ fimVigencia: "2026-06-10" })];
    expect(codigos([item()], ctx({ classificacoes: c }))).toEqual([]);
    expect(codigos([item()], ctx({ classificacoes: c, dataEmissao: "2026-06-11" }))).toEqual(["CLASSIFICACAO_FORA_DE_VIGENCIA"]);
  });
  it("com duas vigências, vale a da data", () => {
    const c = [classif({ fimVigencia: "2026-12-31", cst: "000" }), classif({ inicioVigencia: "2027-01-01", cst: "200" })];
    expect(codigos([item()], ctx({ classificacoes: c, dataEmissao: "2026-12-31" }))).toEqual([]);
    expect(codigos([item()], ctx({ classificacoes: c, dataEmissao: "2027-01-01" }))).toContain("CST_DIVERGENTE");
  });
  it("sem a classificação vigente, não confere o resto (só os valores)", () => {
    expect(codigos([item({ cClassTrib: "999999", cst: "999" })], ctx())).toEqual(["CLASSIFICACAO_INEXISTENTE"]);
  });
  it("item sem IBS/CBS não é conferido", () => {
    expect(conferirTributacao([itemDaNfe({ ncm: "25232910" })], ctx({ crtEmitente: null }))).toEqual([]);
  });
});

describe("CST", () => {
  it("CST diferente do da classificação", () => {
    const [a] = conferirTributacao([item({ cst: "200" })], ctx());
    expect(a).toMatchObject({ codigo: "CST_DIVERGENTE", severidade: "ATENCAO" });
    expect(a.mensagem).toContain("200");
    expect(a.mensagem).toContain("000");
  });
});

describe("nomenclatura", () => {
  it("casa por prefixo", () => {
    expect(codigos([item({ ncm: "25232910" })], ctx({ nomenclaturas: [nomen({ codigo: "2523" })] }))).toEqual([]);
  });
  it("NCM fora do prefixo acusa", () => {
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: [nomen({ codigo: "2523" })] }))).toEqual(["NOMENCLATURA_INCOMPATIVEL"]);
  });
  it("prefixo é por dígitos inteiros: 25232 não casa com 2523 invertido", () => {
    expect(codigos([item({ ncm: "2523" })], ctx({ nomenclaturas: [nomen({ codigo: "25232910" })] }))).toEqual(["NOMENCLATURA_INCOMPATIVEL"]);
  });
  it("exceção tira o código da regra do prefixo", () => {
    const n = [nomen({ codigo: "2523" }), nomen({ codigo: "25232910", excecao: true })];
    expect(codigos([item({ ncm: "25232910" })], ctx({ nomenclaturas: n }))).toEqual(["NOMENCLATURA_INCOMPATIVEL"]);
    expect(codigos([item({ ncm: "25231000" })], ctx({ nomenclaturas: n }))).toEqual([]);
  });
  it("regra mais específica que a exceção volta a valer", () => {
    const n = [nomen({ codigo: "2523" }), nomen({ codigo: "252329", excecao: true }), nomen({ codigo: "25232910" })];
    expect(codigos([item({ ncm: "25232910" })], ctx({ nomenclaturas: n }))).toEqual([]);
  });
  it("só exceções, sem regra: a classificação não restringe", () => {
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: [nomen({ excecao: true })] }))).toEqual([]);
  });
  it("classificação sem nomenclatura não acusa", () => {
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: [] }))).toEqual([]);
  });
  it("nomenclatura de outra classificação não conta", () => {
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: [nomen({ cClassTrib: "200003" })] }))).toEqual([]);
  });
  it("linha fora da vigência é ignorada", () => {
    const n = [nomen({ fimVigencia: "2026-06-09" })];
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: n }))).toEqual([]);
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: [nomen({ fimVigencia: "2026-06-10" })] }))).toEqual(["NOMENCLATURA_INCOMPATIVEL"]);
  });
  it("classificação só de NBS não acusa item com NCM", () => {
    expect(codigos([item({ ncm: "73089010" })], ctx({ nomenclaturas: [nomen({ tipo: "NBS", codigo: "1.0101" })] }))).toEqual([]);
  });
  it("NBS com pontos casa por dígitos; NBS errada acusa", () => {
    const n = [nomen({ tipo: "NBS", codigo: "1.0101" })];
    const base = { ncm: "00", cClassTrib: "000001" };
    expect(codigos([item({ ...base, nbs: "1.0101.20.00" })], ctx({ nomenclaturas: n }))).toEqual([]);
    expect(codigos([item({ ...base, nbs: "1.0202.20.00" })], ctx({ nomenclaturas: n }))).toEqual(["NOMENCLATURA_INCOMPATIVEL"]);
  });
  it("NCM 00 (sem NCM) não é avaliado", () => {
    expect(codigos([item({ ncm: "00" })], ctx({ nomenclaturas: [nomen()] }))).toEqual([]);
  });
  it("com NCM e NBS, basta um casar", () => {
    const n = [nomen({ codigo: "2523" }), nomen({ tipo: "NBS", codigo: "1.0101" })];
    expect(codigos([item({ ncm: "73089010", nbs: "1.0101.20.00" })], ctx({ nomenclaturas: n }))).toEqual([]);
    expect(codigos([item({ ncm: "73089010", nbs: "1.0202.20.00" })], ctx({ nomenclaturas: n }))).toEqual(["NOMENCLATURA_INCOMPATIVEL"]);
  });
  it("item sem NCM nem NBS não acusa", () => {
    expect(codigos([item({ ncm: null })], ctx({ nomenclaturas: [nomen()] }))).toEqual([]);
  });
});

describe("redução", () => {
  const c60 = [classif({ pRedCbs: "60", pRedIbs: "60", indReducao: true })];
  const reduzido = { pRedCbs: "60", pRedIbs: "60", cbsCents: 3_600, ibsUfCents: 400 };
  it("igual ao previsto não acusa", () => {
    expect(codigos([item(reduzido)], ctx({ classificacoes: c60 }))).toEqual([]);
  });
  it("sem redução na nota, com redução prevista, acusa os dois tributos", () => {
    expect(codigos([item()], ctx({ classificacoes: c60 }))).toEqual(["REDUCAO_DIVERGENTE", "REDUCAO_DIVERGENTE"]);
  });
  it("redução na nota onde não há prevista acusa", () => {
    const [a] = conferirTributacao([item({ pRedCbs: "60", cbsCents: 3_600 })], ctx());
    expect(a.codigo).toBe("REDUCAO_DIVERGENTE");
    expect(a.mensagem).toContain("CBS");
  });
  it("imunidade (410029, 100% na carga mas sem indReducao) sem gRed não acusa", () => {
    const imune = classif({ codigo: "410029", cst: "410", pRedCbs: "100", pRedIbs: "100", indReducao: false });
    const nota = item({ cst: "410", cClassTrib: "410029", pCbs: null, pIbsUf: null, pIbsMun: null, cbsCents: null, ibsUfCents: null, ibsMunCents: null });
    expect(codigos([nota], ctx({ classificacoes: [imune] }))).toEqual([]);
  });
  it("0 e ausente são a mesma coisa; diferença de casas decimais não acusa", () => {
    expect(codigos([item({ pRedCbs: "0.0000" })], ctx({ classificacoes: [classif({ pRedCbs: "0", indReducao: true })] }))).toEqual([]);
    expect(codigos([item(reduzido, )], ctx({ classificacoes: [classif({ pRedCbs: "60.0000", pRedIbs: "60.00001", indReducao: true })] }))).toEqual([]);
  });
});

describe("base × alíquota", () => {
  it("1 centavo de diferença é arredondamento", () => {
    expect(codigos([item({ cbsCents: 9_001 })], ctx())).toEqual([]);
    expect(codigos([item({ cbsCents: 8_999 })], ctx())).toEqual([]);
  });
  it("2 centavos já acusa", () => {
    const [a] = conferirTributacao([item({ cbsCents: 9_002 })], ctx());
    expect(a).toMatchObject({ itemIndex: 0, codigo: "VALOR_DIVERGENTE", severidade: "ATENCAO" });
    expect(a.mensagem).toContain("CBS");
  });
  it("leva a redução em conta", () => {
    const c = ctx({ classificacoes: [classif({ pRedCbs: "60", pRedIbs: "60", indReducao: true })] });
    expect(codigos([item({ pRedCbs: "60", pRedIbs: "60", cbsCents: 3_600, ibsUfCents: 400 })], c)).toEqual([]);
    // reduziu a alíquota mas destacou como se não tivesse reduzido
    expect(codigos([item({ pRedCbs: "60", pRedIbs: "60" })], c)).toEqual(["VALOR_DIVERGENTE", "VALOR_DIVERGENTE"]);
  });
  it("valor ausente com alíquota informada acusa", () => {
    expect(codigos([item({ ibsUfCents: null })], ctx())).toEqual(["VALOR_DIVERGENTE"]);
  });
  it("sem base (isenção, imunidade) ou sem alíquota (monofásico) não confere", () => {
    expect(codigos([item({ ibsCbsBaseCents: null })], ctx())).toEqual([]);
    expect(codigos([item({ ibsCbsBaseCents: 0, cbsCents: 5 })], ctx())).toEqual([]);
    expect(codigos([item({ pCbs: null, pIbsUf: null, pIbsMun: null, cbsCents: 500, ibsUfCents: 300 })], ctx())).toEqual([]);
  });
  it("com diferimento, compara a soma de destacado e diferido", () => {
    const dif = { cbsCents: 0, ibsUfCents: 0, ibsCbsDiferidoCents: 10_000 };
    expect(codigos([item(dif)], ctx())).toEqual([]);
    expect(codigos([item({ ...dif, ibsCbsDiferidoCents: 9_000 })], ctx())).toEqual(["VALOR_DIVERGENTE"]);
  });
  it("alíquotas de IBS da UF e do município somam", () => {
    const i = item({ pIbsUf: "0.05", pIbsMun: "0.05", ibsUfCents: 500, ibsMunCents: 500 });
    expect(codigos([i], ctx())).toEqual([]);
    expect(codigos([{ ...i, ibsMunCents: 0 }], ctx())).toEqual(["VALOR_DIVERGENTE"]);
  });
});

describe("totais IBSCBSTot", () => {
  const totais = { ibsCbsBaseCents: 2_000_000, cbsCents: 18_000, ibsUfCents: 2_000, ibsMunCents: 0, ibsCbsDiferidoCents: 0, credPresCents: 0, cbsMonoCents: 0, ibsMonoCents: 0 };
  const dois = [item(), item()];
  it("soma que fecha não acusa", () => {
    expect(codigos(dois, ctx({ totais }))).toEqual([]);
  });
  it("tolerância de 1 centavo por item", () => {
    expect(codigos(dois, ctx({ totais: { ...totais, cbsCents: 18_002 } }))).toEqual([]);
    expect(codigos(dois, ctx({ totais: { ...totais, cbsCents: 18_003 } }))).toEqual(["TOTAIS_DIVERGENTES"]);
  });
  it("acusa base, CBS e IBS separadamente, sem item", () => {
    const a = conferirTributacao(dois, ctx({ totais: { ...totais, ibsCbsBaseCents: 1, cbsCents: 1, ibsUfCents: 1 } }));
    expect(a.map((x) => x.itemIndex)).toEqual([null, null, null]);
    expect(a.map((x) => x.mensagem.match(/\((.*?)\)/)?.[1])).toEqual(["base de cálculo", "CBS", "IBS"]);
  });
  it("monofásico entra nos totais à parte", () => {
    const mono = item({ ibsCbsBaseCents: null, pCbs: null, pIbsUf: null, pIbsMun: null, cbsCents: 700, ibsUfCents: 300, ibsMunCents: null });
    const t = { ...totais, ibsCbsBaseCents: 1_000_000, cbsCents: 9_000, ibsUfCents: 1_000, cbsMonoCents: 700, ibsMonoCents: 300 };
    expect(codigos([item(), mono], ctx({ totais: t }))).toEqual([]);
  });
  it("itens sem IBS/CBS não entram na soma; total zerado e itens zerados fecham", () => {
    expect(codigos([itemDaNfe({ ncm: "1" })], ctx({ crtEmitente: null, totais: { ...totais, ibsCbsBaseCents: 0, cbsCents: 0, ibsUfCents: 0 } }))).toEqual([]);
  });
  it("sem totais (null ou ausente) não confere", () => {
    expect(codigos(dois, ctx({ totais: null }))).toEqual([]);
  });
});

describe("fornecedor do regime normal sem destaque", () => {
  const sem = [itemDaNfe({ ncm: "25232910" })];
  it("a partir de 2027 é atenção", () => {
    const [a] = conferirTributacao(sem, ctx({ dataEmissao: "2027-01-01" }));
    expect(a).toMatchObject({ itemIndex: null, severidade: "ATENCAO", codigo: "SEM_DESTAQUE_DO_FORNECEDOR" });
  });
  it("em 2026 (ano de teste) é só informação", () => {
    expect(conferirTributacao(sem, ctx({ dataEmissao: "2026-01-01" }))[0]).toMatchObject({ severidade: "INFO", codigo: "SEM_DESTAQUE_DO_FORNECEDOR" });
    expect(conferirTributacao(sem, ctx({ dataEmissao: "2026-12-31" }))[0].severidade).toBe("INFO");
  });
  it("antes de 2026 não diz nada", () => {
    expect(conferirTributacao(sem, ctx({ dataEmissao: "2025-12-31" }))).toEqual([]);
  });
  it("Simples, MEI, CRT ausente e nota sem itens não dizem nada", () => {
    for (const crtEmitente of ["1", "2", "4", null]) expect(conferirTributacao(sem, ctx({ crtEmitente }))).toEqual([]);
    expect(conferirTributacao([], ctx())).toEqual([]);
  });
  it("basta um item com IBS/CBS para a nota não ser 'sem destaque'", () => {
    expect(codigos([...sem, item()], ctx())).toEqual([]);
  });
});

describe("crédito vedado ou parcial", () => {
  it("vedado: informação, com o valor que fica no custo", () => {
    const c = [classif({ apropriaCreditoCbs: false, apropriaCreditoIbs: false })];
    const [a] = conferirTributacao([item()], ctx({ classificacoes: c }));
    expect(a).toMatchObject({ itemIndex: 0, severidade: "INFO", codigo: "CREDITO_VEDADO" });
    expect(a.mensagem).toContain("100,00");
  });
  it("parcial: diz qual tributo gera crédito", () => {
    const so = (cbs: boolean, ibs: boolean) =>
      conferirTributacao([item()], ctx({ classificacoes: [classif({ apropriaCreditoCbs: cbs, apropriaCreditoIbs: ibs })] }))[0];
    expect(so(false, true)).toMatchObject({ codigo: "CREDITO_PARCIAL" });
    expect(so(false, true).mensagem).toContain("o IBS");
    expect(so(true, false).mensagem).toContain("a CBS");
  });
  it("sem valor destacado não há o que explicar", () => {
    const c = [classif({ apropriaCreditoCbs: false, apropriaCreditoIbs: false })];
    expect(codigos([item({ ibsCbsBaseCents: null, cbsCents: null, ibsUfCents: null, ibsMunCents: null })], ctx({ classificacoes: c }))).toEqual([]);
  });
  it("não depende do regime da empresa: nunca bloqueia (só INFO)", () => {
    const c = [classif({ apropriaCreditoCbs: false, apropriaCreditoIbs: false })];
    expect(conferirTributacao([item()], ctx({ classificacoes: c })).every((a) => a.severidade === "INFO")).toBe(true);
  });
});

describe("itemIndex e vários itens", () => {
  it("aponta o item certo, contando os sem IBS/CBS", () => {
    const itens = [itemDaNfe({ ncm: "1" }), item(), item({ cst: "200" })];
    expect(conferirTributacao(itens, ctx()).map((a) => [a.itemIndex, a.codigo])).toEqual([[2, "CST_DIVERGENTE"]]);
  });
});

describe("adaptadores", () => {
  it("itemDaNota converte Decimal em texto e preserva nulos", () => {
    const d = (s: string) => ({ toString: () => s });
    const i = itemDaNota({ ...item(), pCbs: d("0.9000"), pIbsUf: d("0.1000"), pIbsMun: null, pRedCbs: null, pRedIbs: null });
    expect(i).toMatchObject({ pCbs: "0.9000", pIbsUf: "0.1000", pIbsMun: null, cClassTrib: "000001" });
  });
  it("itemDaNfe sem grupo IBS/CBS fica todo nulo, menos o NCM", () => {
    expect(itemDaNfe({ ncm: "25232910" })).toMatchObject({ ncm: "25232910", cst: null, cClassTrib: null, cbsCents: null });
  });
});
