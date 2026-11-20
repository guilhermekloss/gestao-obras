import { describe, it, expect } from "vitest";
import {
  chaveAcessoValida,
  cnpjValido,
  cpfValido,
  dadosDaChave,
  documentoLidoSchema,
  normalizarData,
  normalizarLeitura,
  normalizarNumeroNf,
  reaisParaCents,
  type DocumentoLido,
  type LeituraNormalizada,
} from "../leitura-documento";
import { calcularTotalItem } from "../rateio";

const CNPJ = "11222333000181";
const CHAVE_NFE = "35260911222333000181550010000123451876543218";
const CHAVE_NFCE = "35260911222333000181650020000007771123456786";
const HOJE = "2026-10-14";

function documento(parcial: Partial<DocumentoLido> = {}): DocumentoLido {
  return {
    tipo: "NFE",
    legibilidade: "BOA",
    emitente: { nome: "Casa do Construtor Ltda", documento: CNPJ, telefone: null },
    destinatario: { nome: "Construtora Exemplo", documento: "12345678000195" },
    numero: "12345",
    serie: "1",
    chaveAcesso: null,
    dataEmissao: "2026-09-15",
    cno: null,
    valorTotal: 150.5,
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "PIX",
    itens: [
      {
        descricao: "Cimento CP-II 50kg",
        quantidade: 3,
        unidade: "sc",
        valorUnitario: 50.1666,
        desconto: null,
        valorTotal: 150.5,
        tipo: "MATERIAL",
      },
    ],
    parcelas: [],
    observacoes: null,
    ...parcial,
  };
}

function ok(lido: DocumentoLido): LeituraNormalizada {
  const r = normalizarLeitura(lido, HOJE);
  if (!r.ok) throw new Error(`esperava leitura válida, veio: ${r.erro}`);
  return r.leitura;
}

describe("dígitos verificadores", () => {
  it("CNPJ", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });

  it("CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224726")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
  });

  it("chave de acesso", () => {
    expect(chaveAcessoValida(CHAVE_NFE)).toBe(true);
    expect(chaveAcessoValida(CHAVE_NFE.replace(/.(?=\d$)/, "9"))).toBe(false);
    expect(chaveAcessoValida(CHAVE_NFE.slice(0, 43))).toBe(false);
    expect(chaveAcessoValida("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218")).toBe(true);
  });

  it("extrai CNPJ, modelo, série e número da chave", () => {
    expect(dadosDaChave(CHAVE_NFE)).toEqual({ cnpj: CNPJ, modelo: "55", serie: "1", numero: "12345" });
    expect(dadosDaChave(CHAVE_NFCE)).toMatchObject({ modelo: "65", serie: "2", numero: "777" });
  });
});

describe("conversões", () => {
  it("reais → centavos", () => {
    expect(reaisParaCents(150.5)).toBe(15050);
    expect(reaisParaCents(0.1 + 0.2)).toBe(30);
    expect(reaisParaCents(null)).toBeNull();
    expect(reaisParaCents(-1)).toBeNull();
    expect(reaisParaCents(Number.NaN)).toBeNull();
  });

  it("datas", () => {
    expect(normalizarData("2026-09-15")).toBe("2026-09-15");
    expect(normalizarData("15/09/2026")).toBe("2026-09-15");
    expect(normalizarData("2026-02-30")).toBeNull();
    expect(normalizarData("ontem")).toBeNull();
    expect(normalizarData(null)).toBeNull();
  });

  it("número de NF sem máscara e sem zeros à esquerda (como o nNF do XML)", () => {
    expect(normalizarNumeroNf("000.012.345")).toBe("12345");
    expect(normalizarNumeroNf("0001234")).toBe("1234");
    expect(normalizarNumeroNf("A-123")).toBe("A-123");
  });
});

describe("normalizarLeitura", () => {
  it("documento limpo: sem avisos, item coerente com o total", () => {
    const l = ok(documento());
    expect(l.avisos).toEqual([]);
    expect(l.tipoDocumento).toBe("NF");
    expect(l.fornecedor).toEqual({ nome: "Casa do Construtor Ltda", documento: CNPJ, documentoLido: CNPJ, fone: null });
    expect(l.destinatario).toEqual({ nome: "Construtora Exemplo", documento: "12345678000195", documentoLido: "12345678000195" });
    expect(l.totalCents).toBe(15050);
    expect(l.formaPagto).toBe("PIX");
    const [item] = l.itens;
    expect(item.unidade).toBe("SC");
    expect(item).toMatchObject({ qtde: 3, unitCents: 5017, descontoCents: 1, totalCents: 15050 });
    expect(item.totalCents).toBe(calcularTotalItem(item.qtde, item.unitCents, item.descontoCents));
  });

  it("recusa o que não é documento", () => {
    const r = normalizarLeitura(documento({ tipo: "NAO_E_DOCUMENTO" }), HOJE);
    expect(r.ok).toBe(false);
  });

  it("chave válida completa CNPJ e número que faltaram", () => {
    const l = ok(documento({ chaveAcesso: CHAVE_NFE, numero: null, emitente: { nome: "X", documento: null, telefone: null } }));
    expect(l.chaveNfe).toBe(CHAVE_NFE);
    expect(l.fornecedor.documento).toBe(CNPJ);
    expect(l.numero).toBe("12345");
    expect(l.serie).toBe("1");
    expect(l.avisos).toEqual([]);
  });

  it("chave válida prevalece sobre número e CNPJ lidos diferentes", () => {
    const l = ok(documento({ chaveAcesso: CHAVE_NFE, numero: "12346", emitente: { nome: "X", documento: "12345678000195", telefone: null } }));
    expect(l.numero).toBe("12345");
    expect(l.fornecedor.documento).toBe(CNPJ);
    expect(l.avisos).toHaveLength(2);
  });

  it("chave com DV errado é descartada com aviso", () => {
    const l = ok(documento({ chaveAcesso: CHAVE_NFE.slice(0, 43) + "0" }));
    expect(l.chaveNfe).toBeNull();
    expect(l.avisos.join()).toMatch(/chave de acesso/);
  });

  it("CNPJ com DV errado não é usado para achar o fornecedor", () => {
    const l = ok(documento({ emitente: { nome: "X", documento: "11222333000182", telefone: null } }));
    expect(l.fornecedor.documento).toBeNull();
    expect(l.fornecedor.documentoLido).toBe("11222333000182");
    expect(l.avisos.join()).toMatch(/CNPJ\/CPF/);
  });

  it("destinatário com DV errado é avisado e não conta como válido", () => {
    const l = ok(documento({ destinatario: { nome: "X", documento: "12345678000190" } }));
    expect(l.destinatario.documento).toBeNull();
    expect(l.destinatario.documentoLido).toBe("12345678000190");
    expect(l.avisos.join()).toMatch(/destinatário/);
  });

  it("número da NF lido com máscara vira o nNF", () => {
    expect(ok(documento({ numero: "000.012.345" })).numero).toBe("12345");
  });

  it("recibo mantém o número como impresso", () => {
    expect(ok(documento({ tipo: "RECIBO", numero: "0042" })).numero).toBe("0042");
  });

  it("frete e outras despesas viram itens; soma fecha com o total", () => {
    const l = ok(
      documento({
        valorTotal: 180.5,
        valorFrete: 20,
        valorOutrasDespesas: 10,
      }),
    );
    expect(l.itens.map((i) => i.tipo)).toEqual(["MATERIAL", "FRETE", "ENCARGO"]);
    expect(l.itens.reduce((a, i) => a + i.totalCents, 0)).toBe(18050);
    expect(l.avisos).toEqual([]);
  });

  it("desconto geral entra no maior item", () => {
    const l = ok(documento({ valorTotal: 140.5, descontoGeral: 10 }));
    expect(l.itens[0].totalCents).toBe(14050);
    expect(l.avisos).toEqual([]);
  });

  it("soma dos itens diferente do total gera aviso (sem ajuste silencioso)", () => {
    const l = ok(documento({ valorTotal: 160 }));
    expect(l.totalCents).toBe(16000);
    expect(l.itens).toHaveLength(1);
    expect(l.avisos.join()).toMatch(/soma dos itens/);
  });

  it("sem itens legíveis: o total entra como item único com o tipo do documento", () => {
    const l = ok(documento({ tipo: "RECIBO", itens: [], numero: "15", valorTotal: 800 }));
    expect(l.tipoDocumento).toBe("RECIBO");
    expect(l.itens).toEqual([
      expect.objectContaining({ tipo: "SERVICO", qtde: 1, unitCents: 80000, totalCents: 80000 }),
    ]);
    expect(l.itens[0].descricao).toContain("Recibo nº 15");
  });

  it("sem total: usa a soma dos itens", () => {
    const l = ok(documento({ valorTotal: null }));
    expect(l.totalCents).toBe(15050);
    expect(l.avisos.join()).toMatch(/Valor total não encontrado/);
  });

  it("item sem total usa o unitário lido; item sem valor nenhum fica de fora", () => {
    const l = ok(
      documento({
        valorTotal: 20,
        itens: [
          { descricao: "Prego 17x21", quantidade: 2, unidade: "kg", valorUnitario: 10, desconto: null, valorTotal: null, tipo: "MATERIAL" },
          { descricao: "Ilegível", quantidade: 1, unidade: null, valorUnitario: null, desconto: null, valorTotal: null, tipo: "MATERIAL" },
        ],
      }),
    );
    expect(l.itens).toHaveLength(1);
    expect(l.itens[0]).toMatchObject({ qtde: 2, unitCents: 1000, totalCents: 2000 });
    expect(l.avisos.join()).toMatch(/Ilegível/);
  });

  it("unitário muito diferente do total da linha gera aviso", () => {
    const l = ok(
      documento({
        valorTotal: 100,
        itens: [{ descricao: "Areia", quantidade: 2, unidade: "m3", valorUnitario: 80, desconto: null, valorTotal: 100, tipo: "MATERIAL" }],
      }),
    );
    expect(l.itens[0]).toMatchObject({ unitCents: 5000, totalCents: 10000 });
    expect(l.avisos.join()).toMatch(/quantidade × unitário/);
  });

  it("parcelas que fecham com o total viram as parcelas do lançamento, em ordem", () => {
    const l = ok(
      documento({
        formaPagamento: "NAO_INFORMADA",
        parcelas: [
          { vencimento: "2026-11-15", valor: 75.25 },
          { vencimento: "2026-10-15", valor: 75.25 },
        ],
      }),
    );
    expect(l.formaPagto).toBe("BOLETO");
    expect(l.parcelas).toEqual([
      { numero: 1, vencimento: "2026-10-15", valorCents: 7525 },
      { numero: 2, vencimento: "2026-11-15", valorCents: 7525 },
    ]);
  });

  it("parcelas que não fecham são descartadas com aviso", () => {
    const l = ok(documento({ parcelas: [{ vencimento: "2026-10-15", valor: 100 }] }));
    expect(l.parcelas).toEqual([]);
    expect(l.avisos.join()).toMatch(/vencimentos/);
  });

  it("data ausente, inválida ou futura gera aviso", () => {
    expect(ok(documento({ dataEmissao: null })).avisos.join()).toMatch(/Data de emissão não encontrada/);
    const invalida = ok(documento({ dataEmissao: "2026-13-01" }));
    expect(invalida.dataEmissao).toBeNull();
    expect(invalida.avisos.join()).toMatch(/inválida/);
    expect(ok(documento({ dataEmissao: "2027-01-01" })).avisos.join()).toMatch(/futuro/);
  });

  it("legibilidade parcial e observações do leitor viram avisos", () => {
    const l = ok(documento({ legibilidade: "PARCIAL", observacoes: "Últimos itens cortados na foto" }));
    expect(l.avisos).toHaveLength(2);
    expect(l.avisos[1]).toBe("Últimos itens cortados na foto");
  });
});

describe("documentoLidoSchema", () => {
  it("aceita o formato que o leitor devolve", () => {
    expect(documentoLidoSchema.safeParse(documento()).success).toBe(true);
  });
});

describe("normalizarLeitura — CNO", () => {
  it("CNO impresso com máscara fica só em dígitos", () => {
    const leitura = ok(documento({ cno: "90.000.12345/67" }));
    expect(leitura.cno).toBe("900001234567");
    expect(leitura.avisos.some((a) => a.includes("CNO"))).toBe(false);
  });

  it("sem CNO fica nulo, sem aviso", () => {
    const leitura = ok(documento({ cno: null }));
    expect(leitura.cno).toBeNull();
    expect(leitura.avisos.some((a) => a.includes("CNO"))).toBe(false);
  });

  it("CNO com dígitos faltando é ignorado com aviso", () => {
    const leitura = ok(documento({ cno: "90.000.1234/67" }));
    expect(leitura.cno).toBeNull();
    expect(leitura.avisos).toContain("O CNO lido (90.000.1234/67) não tem 12 dígitos e foi ignorado.");
  });
});

describe("normalizarLeitura: NFS-e", () => {
  const nfse = (parcial: Partial<DocumentoLido> = {}) =>
    documento({
      tipo: "NFSE",
      numero: "000228",
      itens: [{ descricao: "Mão de obra", quantidade: null, unidade: null, valorUnitario: null, desconto: null, valorTotal: 150.5, tipo: "SERVICO" }],
      ...parcial,
    });

  it("grava como NFSE (não mais como NF), com o número sem zeros à esquerda", () => {
    const l = ok(nfse());
    expect(l.tipoDocumento).toBe("NFSE");
    expect(l.descricaoDocumento).toBe("NFS-e (nota de serviço)");
    expect(l.numero).toBe("228");
  });

  it("como nota, exige o número", () => {
    expect(ok(nfse({ numero: null })).avisos).toContain("Número da nota não encontrado — preencha antes de salvar.");
  });

  it("item sem tipo reconhecido cai em serviço", () => {
    const l = ok(nfse({ itens: [], valorTotal: 300 }));
    expect(l.itens).toEqual([expect.objectContaining({ tipo: "SERVICO", totalCents: 30_000 })]);
  });
});
