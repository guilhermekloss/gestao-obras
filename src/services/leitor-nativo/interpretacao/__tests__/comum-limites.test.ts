import { describe, expect, it } from "vitest";
import {
  avisosDeMarca,
  documentoVazio,
  encontrarAncoras,
  formaPagamentoDoTexto,
  juntarObservacoes,
  positivoOuNull,
  tipoDoItem,
} from "../comum";
import { construirDoc } from "../documento";
import { montarTexto } from "./auxiliar";
import { CHAVE_NFCE, CHAVE_NFE, CHAVE_NFSE, DANFE, LINHA_BOLETO, NFCE, QR_NFCE } from "./fixtures";

const doc = (texto: string, opcoes = {}) => construirDoc(montarTexto(texto, opcoes));

describe("documentoVazio", () => {
  it("começa sem nada lido, só com o tipo e legibilidade boa", () => {
    expect(documentoVazio("RECIBO")).toEqual({
      tipo: "RECIBO",
      legibilidade: "BOA",
      emitente: { nome: null, documento: null, telefone: null },
      destinatario: { nome: null, documento: null },
      numero: null,
      serie: null,
      chaveAcesso: null,
      dataEmissao: null,
      cno: null,
      valorTotal: null,
      valorFrete: null,
      valorOutrasDespesas: null,
      descontoGeral: null,
      formaPagamento: "NAO_INFORMADA",
      itens: [],
      parcelas: [],
      observacoes: null,
    });
  });

  it("cada chamada devolve um objeto novo", () => {
    const a = documentoVazio("NFE");
    a.itens.push({} as never);
    expect(documentoVazio("NFE").itens).toEqual([]);
  });
});

describe("formaPagamentoDoTexto", () => {
  it.each([
    ["Pago via PIX", "PIX"],
    ["pagamento instantâneo", "PIX"],
    ["Pagamento  Instantâneo", "PIX"],
    ["cartão de débito", "DEBITO"],
    ["Cartão  de  Débito", "DEBITO"],
    ["débito", "DEBITO"],
    ["cartão de crédito", "CARTAO"],
    ["crédito", "CARTAO"],
    ["cartão", "CARTAO"],
    ["dinheiro", "DINHEIRO"],
    ["em espécie", "DINHEIRO"],
    ["Em  Espécie", "DINHEIRO"],
    ["boleto bancário", "BOLETO"],
    ["transferência", "TRANSFERENCIA"],
    ["TED", "TRANSFERENCIA"],
    ["DOC", "TRANSFERENCIA"],
    ["depósito bancário", "TRANSFERENCIA"],
    ["depósito em conta", "TRANSFERENCIA"],
    ["Depósito  em  Conta", "TRANSFERENCIA"],
    ["carteira digital", "TRANSFERENCIA"],
    ["Carteira  Digital", "TRANSFERENCIA"],
    ["sem forma nenhuma", "NAO_INFORMADA"],
    ["", "NAO_INFORMADA"],
  ])("'%s' → %s", (texto, forma) => {
    expect(formaPagamentoDoTexto(texto)).toBe(forma);
  });

  it("vale a forma que aparece primeiro no texto", () => {
    expect(formaPagamentoDoTexto("dinheiro ou pix")).toBe("DINHEIRO");
    expect(formaPagamentoDoTexto("pix ou dinheiro")).toBe("PIX");
    expect(formaPagamentoDoTexto("boleto, depois cartão de débito")).toBe("BOLETO");
    expect(formaPagamentoDoTexto("TED ou boleto")).toBe("TRANSFERENCIA");
  });

  it("palavras parecidas não contam (precisa da palavra inteira)", () => {
    for (const texto of ["pixel", "dinheiros", "boletos", "cartões", "debitos", "pedoc", "docs"]) {
      expect(formaPagamentoDoTexto(texto)).toBe("NAO_INFORMADA");
    }
  });
});

describe("tipoDoItem", () => {
  it("frete, carreto e transporte no começo da descrição", () => {
    for (const d of ["FRETE", "frete sobre venda", "  Carreto", "TRANSPORTE de areia"]) expect(tipoDoItem(d)).toBe("FRETE");
    expect(tipoDoItem("TRANSPORTES LTDA material")).toBe("MATERIAL");
    expect(tipoDoItem("cimento com frete")).toBe("MATERIAL");
    expect(tipoDoItem("FRETEIRO")).toBe("MATERIAL");
  });

  it("taxas, tarifas, impostos, juros, multas e encargos no começo da descrição", () => {
    for (const d of ["TAXA", "taxas", "Tarifa bancária", "IMPOSTO", "impostos", "JUROS", "Multa por atraso", "encargos", "ENCARGO"]) {
      expect(tipoDoItem(d)).toBe("ENCARGO");
    }
    expect(tipoDoItem("cimento taxa")).toBe("MATERIAL");
    expect(tipoDoItem("TAXAR material")).toBe("MATERIAL");
  });

  it("CFOP 5933 e 6933 são serviço", () => {
    expect(tipoDoItem("PEDRA", "MATERIAL", "5933")).toBe("SERVICO");
    expect(tipoDoItem("PEDRA", "MATERIAL", "6933")).toBe("SERVICO");
    expect(tipoDoItem("PEDRA", "MATERIAL", "5102")).toBe("MATERIAL");
    expect(tipoDoItem("PEDRA", "MATERIAL", "59330")).toBe("MATERIAL");
    expect(tipoDoItem("PEDRA", "MATERIAL", "15933")).toBe("MATERIAL");
    expect(tipoDoItem("PEDRA", "MATERIAL", "7933")).toBe("MATERIAL");
    expect(tipoDoItem("PEDRA", "MATERIAL", "")).toBe("MATERIAL");
  });

  it("palavras de serviço em qualquer lugar da descrição", () => {
    for (const d of ["serviço de pintura", "SERVICOS GERAIS", "mão de obra", "Mão  de  Obra", "empreitada", "diária", "diarias", "locação de betoneira", "pintura e SERVICO"]) {
      expect(tipoDoItem(d)).toBe("SERVICO");
    }
    for (const d of ["servicox", "empreitadas", "locacoes", "diariamente"]) expect(tipoDoItem(d)).toBe("MATERIAL");
  });

  it("a prioridade é frete, encargo, CFOP e serviço; o padrão é o informado", () => {
    expect(tipoDoItem("FRETE serviço", "MATERIAL", "5933")).toBe("FRETE");
    expect(tipoDoItem("TAXA de serviço")).toBe("ENCARGO");
    expect(tipoDoItem("serviço", "MATERIAL", "5933")).toBe("SERVICO");
    expect(tipoDoItem("cimento")).toBe("MATERIAL");
    expect(tipoDoItem("cimento", "SERVICO")).toBe("SERVICO");
    expect(tipoDoItem("serviço", "ENCARGO")).toBe("SERVICO");
  });
});

describe("juntarObservacoes e positivoOuNull", () => {
  it("junta as notas com espaço, sem vazias nem repetidas, apara cada uma", () => {
    expect(juntarObservacoes(["a", "b"])).toBe("a b");
    expect(juntarObservacoes([" a ", null, undefined, "", "  ", "b", "a"])).toBe("a b");
    expect(juntarObservacoes([])).toBeNull();
    expect(juntarObservacoes([null, "", " "])).toBeNull();
  });

  it("só valor finito e maior que zero", () => {
    expect(positivoOuNull(5)).toBe(5);
    expect(positivoOuNull(0.01)).toBe(0.01);
    for (const v of [0, -1, null, undefined, NaN, Infinity, -Infinity]) expect(positivoOuNull(v)).toBeNull();
  });
});

describe("avisosDeMarca", () => {
  it("homologação, cancelada e contingência, cada um com seu aviso", () => {
    expect(avisosDeMarca(doc("DANFE\nSEM VALOR FISCAL"))).toEqual(['O documento indica "sem valor fiscal" (homologação).']);
    expect(avisosDeMarca(doc("AMBIENTE DE HOMOLOGAÇÃO"))).toEqual(['O documento indica "sem valor fiscal" (homologação).']);
    expect(avisosDeMarca(doc("Sem  Valor  Fiscal"))).toHaveLength(1);
    expect(avisosDeMarca(doc("NF-e CANCELADA"))).toEqual(["O documento indica nota cancelada."]);
    expect(avisosDeMarca(doc("NFC-e Cancelada"))).toHaveLength(1);
    expect(avisosDeMarca(doc("NOTA CANCELADA"))).toHaveLength(1);
    expect(avisosDeMarca(doc("NFE  CANCELADA"))).toHaveLength(1);
    expect(avisosDeMarca(doc("EMITIDA EM CONTINGÊNCIA"))).toEqual(["Nota emitida em contingência: confira a autorização."]);
    expect(avisosDeMarca(doc("DANFE EM CONTINGENCIA"))).toHaveLength(1);
    expect(avisosDeMarca(doc("Emitida  em  Contingência"))).toHaveLength(1);
  });

  it("vários avisos juntos, na ordem; nenhum em documento normal", () => {
    expect(avisosDeMarca(doc("SEM VALOR FISCAL\nNF-E CANCELADA\nEMITIDA EM CONTINGENCIA"))).toEqual([
      'O documento indica "sem valor fiscal" (homologação).',
      "O documento indica nota cancelada.",
      "Nota emitida em contingência: confira a autorização.",
    ]);
    expect(avisosDeMarca(doc(DANFE))).toEqual([]);
  });

  it("'cancelada' solta, sem tipo de nota, não conta", () => {
    expect(avisosDeMarca(doc("Compra cancelada pelo cliente"))).toEqual([]);
  });
});

describe("encontrarAncoras", () => {
  it("chave de NF-e no texto: chave, modelo 55 e nenhum aviso de chave inválida", () => {
    const a = encontrarAncoras(doc(DANFE));
    expect(a).toMatchObject({ chave: CHAVE_NFE, chaveInvalida: null, modelo: "55", qr: null, temValor: true, temData: true });
  });

  it("chave de NFC-e e QR Code do código de barras", () => {
    const d = doc(NFCE, { codigos: [{ formato: "QR_CODE", texto: QR_NFCE, pagina: 1 }] });
    const a = encontrarAncoras(d);
    expect(a.chave).toBe(CHAVE_NFCE);
    expect(a.modelo).toBe("65");
    expect(a.qr).toMatchObject({ chave: CHAVE_NFCE });
  });

  it("chave com dígito errado: fica como inválida e sem modelo", () => {
    const a = encontrarAncoras(doc(DANFE.replace("7654 3218", "7654 3219")));
    expect(a.chave).toBeNull();
    expect(a.chaveInvalida).toBe("35260911222333000181550010000123451876543219");
    expect(a.modelo).toBeNull();
  });

  it("a chave mais perto do rótulo 'chave de acesso' é a escolhida", () => {
    const outra = "35261011222333000181650010000007891135724688";
    const texto = [`Outra ${outra.replace(/(\d{4})/g, "$1 ").trim()}`, "x", "x", "x", "x", "CHAVE DE ACESSO", CHAVE_NFE.replace(/(\d{4})/g, "$1 ").trim()].join("\n");
    expect(encontrarAncoras(doc(texto)).chave).toBe(CHAVE_NFE);
  });

  it("chave quebrada em duas linhas é montada", () => {
    const grupos = CHAVE_NFE.match(/\d{4}/g)!;
    const texto = [grupos.slice(0, 6).join(" "), grupos.slice(6).join(" ")].join("\n");
    expect(encontrarAncoras(doc(texto)).chave).toBe(CHAVE_NFE);
  });

  it("chave de NFS-e no texto", () => {
    const texto = `Chave de Acesso da NFS-e\n${CHAVE_NFSE}`;
    expect(encontrarAncoras(doc(texto)).chaveNfse).toBe(CHAVE_NFSE);
    expect(encontrarAncoras(doc("sem chave")).chaveNfse).toBeNull();
  });

  it("código de boleto no texto, na linha ou quebrado em duas", () => {
    expect(encontrarAncoras(doc(`Linha digitável ${LINHA_BOLETO}`)).pagamento?.tipo).toBe("BOLETO");
    const [a, b] = [LINHA_BOLETO.slice(0, 20), LINHA_BOLETO.slice(20)];
    expect(encontrarAncoras(doc(`${a}\n${b}`)).pagamento?.tipo).toBe("BOLETO");
    expect(encontrarAncoras(doc("sem código")).pagamento).toBeNull();
  });

  it("documentos: CNPJ/CPF com posição da linha; sem rótulo exige pontuação", () => {
    const a = encontrarAncoras(doc("Loja\nCNPJ 11222333000181\nCPF 529.982.247-25\n11222333000181 solto"));
    expect(a.documentos.map((d) => [d.valor, d.linha])).toEqual([
      ["11222333000181", 1],
      ["52998224725", 2],
    ]);
  });

  it("temValor e temData", () => {
    expect(encontrarAncoras(doc("nada")).temValor).toBe(false);
    expect(encontrarAncoras(doc("nada")).temData).toBe(false);
    expect(encontrarAncoras(doc("R$ 10,00")).temValor).toBe(true);
    expect(encontrarAncoras(doc("em 10/10/2026")).temData).toBe(true);
  });
});
