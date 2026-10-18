import { describe, expect, it } from "vitest";
import { encontrarAncoras, type Ancoras } from "../comum";
import { construirDoc } from "../documento";
import { interpretarNfce, lerCaudaItem } from "../interpretes/nfce";
import { formatarReais } from "../normalizacao";
import { montarTexto } from "./auxiliar";
import { CHAVE_NFCE, NFCE } from "./fixtures";

const doc = (texto: string) => construirDoc(montarTexto(texto));
function ler(texto: string, extra: Partial<Ancoras> = {}) {
  const d = doc(texto);
  return interpretarNfce(d, { ...encontrarAncoras(d), ...extra }).lido;
}
const trocar = (texto: string, de: string, para: string) => {
  expect(texto).toContain(de);
  return texto.replace(de, para);
};
const qr = (extra: object) => ({ chave: CHAVE_NFCE, versao: "2", ambiente: "1", dia: null, valor: null, destinatario: null, ...extra }) as Ancoras["qr"];

describe("lerCaudaItem", () => {
  const cauda = (s: string) => lerCaudaItem(s.split(" "));

  it("quantidade, unidade, 'x', unitário e total", () => {
    expect(cauda("2 UN x 6,90 13,80")).toEqual({ inicio: 0, quantidade: 2, unidade: "UN", unitario: 6.9, total: 13.8 });
    expect(cauda("FITA VEDA 2 UN x 6,90 13,80")).toMatchObject({ inicio: 2, quantidade: 2, unidade: "UN" });
  });

  it.each(["x", "X", "×", "*"])("marcador '%s' entre a quantidade e o unitário", (m) => {
    expect(cauda(`2 UN ${m} 6,90 13,80`)).toMatchObject({ inicio: 0, quantidade: 2, unitario: 6.9 });
  });

  it("sem marcador também lê", () => {
    expect(cauda("10 un 1,85 18,50")).toEqual({ inicio: 0, quantidade: 10, unidade: "UN", unitario: 1.85, total: 18.5 });
  });

  it("quantidade e unidade coladas, com decimais", () => {
    expect(cauda("2UN x 6,90 13,80")).toMatchObject({ inicio: 0, quantidade: 2, unidade: "UN" });
    expect(cauda("1,5kg x 10,00 15,00")).toMatchObject({ quantidade: 1.5, unidade: "KG" });
    expect(cauda("1.5m2 x 10,00 15,00")).toMatchObject({ quantidade: 1.5, unidade: "M2" });
    expect(cauda("1,2345kg x 10,00 12,35")).toMatchObject({ quantidade: 1.2345 });
    expect(cauda("1,23456kg x 10,00 12,35")).toBeNull();
  });

  it("unidade antes da quantidade (precisa de uma palavra antes)", () => {
    expect(cauda("FITA UN 2 6,90 13,80")).toMatchObject({ inicio: 1, quantidade: 2, unidade: "UN", unitario: 6.9 });
    expect(cauda("UN 2 6,90 13,80")).toBeNull();
  });

  it("letra de tributação depois do total é ignorada", () => {
    expect(cauda("2 UN x 6,90 13,80 F1")).toMatchObject({ quantidade: 2, total: 13.8 });
    expect(cauda("2 UN x 6,90 13,80 T")).toMatchObject({ total: 13.8 });
    expect(cauda("2 UN x 6,90 13,80 f")).toBeNull();
    expect(cauda("2 UN x 6,90 13,80 ABC")).toBeNull();
    expect(cauda("F1")).toBeNull();
  });

  it("formatos de dinheiro: total com 2 decimais, unitário com 2 a 4", () => {
    expect(cauda("2 UN x 6,9000 13,80")).toMatchObject({ unitario: 6.9 });
    expect(cauda("2 UN x 6,9 13,80")).toBeNull();
    expect(cauda("2 UN x 6,90000 13,80")).toBeNull();
    expect(cauda("2 UN x 6,90 13,8")).toBeNull();
    expect(cauda("2 UN x 1.234,56 2.469,12")).toMatchObject({ unitario: 1234.56, total: 2469.12 });
    expect(cauda("2 UN x 6,90 -13,80")).toMatchObject({ total: -13.8 });
  });

  it("faltando peças, não lê", () => {
    expect(cauda("13,80")).toBeNull();
    expect(cauda("6,90 13,80")).toBeNull();
    expect(cauda("FITA VEDA")).toBeNull();
    expect(lerCaudaItem([])).toBeNull();
    expect(cauda("2 x 6,90 13,80")).toBeNull();
  });
});

describe("NFC-e: itens", () => {
  it("lê código, descrição, quantidade e valores dos cinco itens da nota", () => {
    expect(ler(NFCE).itens.map((i) => [i.descricao, i.quantidade, i.unidade, i.valorUnitario, i.valorTotal])).toEqual([
      ["FITA VEDA ROSCA 18MMX25M", 2, "UN", 6.9, 13.8],
      ["LUVA PVC SOLDAVEL 25MM", 10, "UN", 1.85, 18.5],
      ["REGISTRO ESFERA 3/4 BRUTO", 1, "UN", 42.7, 42.7],
      ["ADESIVO PVC 175G", 1, "UN", 19.9, 19.9],
      ["JOELHO PVC 90 GRAUS 25MM", 4, "UN", 2.15, 8.6],
    ]);
  });

  it("desconto do item abate o total e dispensa o desconto geral; descontos somam", () => {
    const comDesconto = trocar(NFCE, "                       2 UN x 6,90      13,80", "                       2 UN x 6,90      13,80\nDESCONTO ITEM -1,00\nDesc. 0,50");
    const lido = ler(comDesconto);
    expect(lido.itens[0]).toMatchObject({ desconto: 1.5, valorTotal: 12.3 });
    expect(lido.descontoGeral).toBeNull();
    expect(ler(NFCE).descontoGeral).toBe(5);
  });

  it("desconto zerado, ou sem item antes, não vira desconto", () => {
    const zero = trocar(NFCE, "                       2 UN x 6,90      13,80", "                       2 UN x 6,90      13,80\nDESCONTO 0,00");
    expect(ler(zero).itens[0]).toMatchObject({ desconto: null, valorTotal: 13.8 });
    const semItem = trocar(NFCE, "001 7891000100103 FITA VEDA ROSCA 18MMX25M", "DESCONTO 3,00\n001 7891000100103 FITA VEDA ROSCA 18MMX25M");
    expect(ler(semItem).itens[0]).toMatchObject({ desconto: null, valorTotal: 13.8 });
  });

  it("linha do item quebrada: o total vem na linha seguinte", () => {
    const quebrada = trocar(NFCE, "                       2 UN x 6,90      13,80", "                       2 UN x 6,90\n13,80");
    expect(ler(quebrada).itens[0]).toMatchObject({ descricao: "FITA VEDA ROSCA 18MMX25M", quantidade: 2, valorTotal: 13.8 });
  });

  it("total no fim da linha de descrição e quantidade na linha de baixo", () => {
    const texto = [
      "LOJA TESTE LTDA",
      "CNPJ: 11.222.333/0001-81",
      "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL",
      "001 7891000100103 FITA VEDA 13,80",
      "2 UN x 6,90",
      "Valor total R$ 13,80",
    ].join("\n");
    expect(ler(texto).itens[0]).toMatchObject({ descricao: "FITA VEDA", quantidade: 2, valorTotal: 13.8 });
  });

  it("sem itens, avisa", () => {
    const sem = ["LOJA TESTE LTDA", "CNPJ: 11.222.333/0001-81", "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL", "texto sem itens", "Valor total R$ 13,80"].join("\n");
    expect(ler(sem).observacoes).toContain("Itens não identificados na leitura; confira a lista de produtos do cupom.");
    expect(ler(NFCE).observacoes ?? "").not.toContain("Itens não identificados");
  });

  it("sem o cabeçalho da lista, nenhum item é lido", () => {
    const sem = trocar(NFCE, "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL", "");
    expect(ler(sem).itens).toEqual([]);
  });

  it("a lista termina em 'Qtde. total de itens', 'Valor total', 'Subtotal' ou 'Valor a pagar'", () => {
    for (const fim of ["Qtde. total de itens 5", "Valor total R$ 103,50", "SUBTOTAL 103,50", "Valor a Pagar R$ 98,50", "TOTAL R$ 103,50"]) {
      const texto = trocar(NFCE, "Qtde. total de itens               5\nValor total R$                103,50", `${fim}\n001 1 EXTRA 1 UN x 1,00 1,00`);
      expect(ler(texto).itens).toHaveLength(5);
    }
  });
});

describe("NFC-e: totais", () => {
  const SEM_PAGAR = (texto: string) => trocar(texto, "Valor a Pagar R$               98,50\n", "");

  it("valor a pagar é o total", () => {
    expect(ler(NFCE).valorTotal).toBe(98.5);
  });

  it("sem 'valor a pagar': total menos desconto, mais acréscimos e frete", () => {
    expect(ler(SEM_PAGAR(NFCE)).valorTotal).toBe(98.5);
    const comTudo = trocar(SEM_PAGAR(NFCE), "Descontos R$                    5,00", "Descontos R$                    5,00\nAcréscimos R$                   2,00\nFrete R$                        3,00");
    const lido = ler(comTudo);
    expect(lido).toMatchObject({ valorTotal: 103.5 - 5 + 2 + 3, valorOutrasDespesas: 2, valorFrete: 3, descontoGeral: 5 });
  });

  it("valor a pagar zerado não vale; cai no total", () => {
    expect(ler(trocar(NFCE, "Valor a Pagar R$               98,50", "Valor a Pagar R$               0,00")).valorTotal).toBe(98.5);
  });

  it("sem nenhum total impresso, vale o do QR Code; com total impresso diferente, avisa", () => {
    const semTotais = trocar(trocar(NFCE, "Valor total R$                103,50\n", ""), "Valor a Pagar R$               98,50\n", "");
    expect(ler(semTotais, { qr: qr({ valor: 77.7 }) }).valorTotal).toBe(77.7);
    expect(ler(semTotais, { qr: qr({ valor: 77.7 }) }).observacoes ?? "").not.toContain("QR Code");
    expect(ler(NFCE, { qr: qr({ valor: 99.5 }) }).observacoes).toContain(`O valor do QR Code (${formatarReais(99.5)}) difere do total impresso; confira.`);
    expect(ler(NFCE, { qr: qr({ valor: 98.509 }) }).observacoes ?? "").not.toContain("QR Code");
    expect(ler(NFCE, { qr: qr({ valor: 98.5 }) }).observacoes ?? "").not.toContain("QR Code");
  });

  it("frete numa linha própria", () => {
    const comFrete = trocar(NFCE, "Descontos R$                    5,00", "Descontos R$                    5,00\nFRETE 7,50");
    expect(ler(comFrete).valorFrete).toBe(7.5);
    expect(ler(NFCE).valorFrete).toBeNull();
  });
});

describe("NFC-e: pagamento", () => {
  const com = (linhas: string) => trocar(NFCE, "Pagamento Instantâneo (PIX)      98,50", linhas);

  it("um meio só: sem aviso", () => {
    const lido = ler(NFCE);
    expect(lido.formaPagamento).toBe("PIX");
    expect(lido.observacoes ?? "").not.toContain("mais de um meio");
  });

  it("mais de um meio: vale o de maior valor, com aviso", () => {
    const lido = ler(com("Dinheiro      50,00\nPagamento Instantâneo (PIX)      48,50"));
    expect(lido.formaPagamento).toBe("DINHEIRO");
    expect(lido.observacoes).toContain("Pagamento em mais de um meio; foi considerado o de maior valor.");
    expect(ler(com("Dinheiro      20,00\nPagamento Instantâneo (PIX)      78,50")).formaPagamento).toBe("PIX");
  });

  it("o mesmo meio repetido não é 'mais de um meio'", () => {
    const lido = ler(com("Dinheiro      50,00\nDinheiro      48,50"));
    expect(lido.formaPagamento).toBe("DINHEIRO");
    expect(lido.observacoes ?? "").not.toContain("mais de um meio");
  });

  it("a lista de meios para no troco e na consulta da chave", () => {
    const lido = ler(com("Dinheiro      50,00\nTroco R$ 0,00\nPagamento Instantâneo (PIX)      48,50"));
    expect(lido.formaPagamento).toBe("DINHEIRO");
    expect(lido.observacoes ?? "").not.toContain("mais de um meio");
  });

  it("sem o quadro de pagamento, procura nas últimas linhas", () => {
    const sem = trocar(NFCE, "FORMA PAGAMENTO          VALOR PAGO R$\nPagamento Instantâneo (PIX)      98,50", "Pago em cartão de crédito");
    expect(ler(sem).formaPagamento).toBe("CARTAO");
  });

  it("quadro de pagamento sem meio reconhecido: não informada", () => {
    const sem = trocar(NFCE, "Pagamento Instantâneo (PIX)      98,50", "Outros      98,50");
    expect(ler(sem).formaPagamento).toBe("NAO_INFORMADA");
  });
});

describe("NFC-e: emitente, consumidor, número e data", () => {
  it("emitente: nome da primeira linha com letras, CNPJ e telefone do topo", () => {
    const lido = ler(NFCE);
    expect(lido.emitente).toEqual({ nome: "FERRAGENS FICTICIAS COMERCIO LTDA", documento: "11222333000181", telefone: "(11) 2222-3333" });
  });

  it("o nome pula linhas de rótulo e para na linha do CNPJ", () => {
    const texto = ["DANFE NFC-E", "Documento Auxiliar", "IE 123", "LOJA DO ZE COMERCIO     Rua A", "CNPJ: 11.222.333/0001-81", "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL"].join("\n");
    expect(ler(texto).emitente.nome).toBe("LOJA DO ZE COMERCIO");
    const semNome = ["CNPJ: 11.222.333/0001-81", "OUTRA LOJA LTDA", "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL"].join("\n");
    expect(ler(semNome).emitente.nome).toBeNull();
    const curto = ["AB 12", "LOJA GRANDE LTDA", "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL"].join("\n");
    expect(ler(curto).emitente.nome).toBe("LOJA GRANDE LTDA");
  });

  it("documento do emitente: o da chave quando aparece no topo; senão o rotulado; senão o da chave", () => {
    const topo = ["LOJA DO ZE COMERCIO", "CNPJ: 98.765.432/0001-98", "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL"].join("\n");
    const doc14 = (valor: string, linha: number) => ({ valor, linha, valido: true }) as never;
    expect(ler(topo, { chave: CHAVE_NFCE, documentos: [doc14("11222333000181", 1)] }).emitente.documento).toBe("11222333000181");
    expect(ler(topo, { chave: CHAVE_NFCE, documentos: [] }).emitente.documento).toBe("98765432000198");
    expect(ler(topo, { chave: CHAVE_NFCE, documentos: [doc14("11222333000181", 5)] }).emitente.documento).toBe("98765432000198");
    const semRotulo = ["LOJA DO ZE COMERCIO", "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL"].join("\n");
    expect(ler(semRotulo, { chave: CHAVE_NFCE, documentos: [] }).emitente.documento).toBe("11222333000181");
    expect(ler(semRotulo, { chave: null, documentos: [] }).emitente.documento).toBeNull();
  });

  it("consumidor identificado: CPF e nome; não identificado: nada", () => {
    expect(ler(NFCE).destinatario).toEqual({ nome: null, documento: "12345678909" });
    const comNome = trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09", "CONSUMIDOR: JOAO DA SILVA");
    expect(ler(comNome).destinatario.nome).toBe("JOAO DA SILVA");
    const nome = trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09", "Nome: Maria\nCONSUMIDOR");
    expect(ler(nome).destinatario.nome).toBeNull();
    const naoIdent = trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09", "CONSUMIDOR NAO IDENTIFICADO");
    expect(ler(naoIdent).destinatario).toEqual({ nome: null, documento: null });
  });

  it("nome do consumidor com a palavra CPF ou CNPJ não é nome", () => {
    const texto = trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09", "CONSUMIDOR: CPF NAO INFORMADO");
    expect(ler(texto).destinatario.nome).toBeNull();
    expect(ler(trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09", "CONSUMIDOR: ABC")).destinatario.nome).toBeNull();
    expect(ler(trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09", "CONSUMIDOR: ABCD")).destinatario.nome).toBe("ABCD");
  });

  it("sem CPF no texto, o documento vem do QR Code", () => {
    const sem = trocar(NFCE, "CONSUMIDOR - CPF 123.456.789-09\n", "");
    expect(ler(sem, { qr: qr({ destinatario: "52998224725" }) }).destinatario.documento).toBe("52998224725");
    expect(ler(NFCE, { qr: qr({ destinatario: "52998224725" }) }).destinatario.documento).toBe("12345678909");
  });

  it("número, série e data de emissão", () => {
    expect(ler(NFCE)).toMatchObject({ numero: "000000789", serie: "001", dataEmissao: "2026-10-15" });
    const outro = trocar(NFCE, "NFC-e nº 000000789 Série 001 15/10/2026 14:32:10", "Número: 321 Série: 2 16/10/2026");
    expect(ler(outro)).toMatchObject({ numero: "321", serie: "2", dataEmissao: "2026-10-16" });
  });

  it("sem data na linha do número, usa a data de emissão rotulada; depois, o dia do QR Code com o mês da chave", () => {
    const semData = trocar(NFCE, "NFC-e nº 000000789 Série 001 15/10/2026 14:32:10", "NFC-e nº 000000789 Série 001");
    expect(ler(semData).dataEmissao).toBeNull();
    expect(ler(semData, { chave: CHAVE_NFCE, qr: qr({ dia: 9 }) }).dataEmissao).toBe("2026-10-09");
    expect(ler(semData, { chave: null, qr: qr({ dia: 9 }) }).dataEmissao).toBeNull();
    expect(ler(semData, { chave: CHAVE_NFCE, qr: qr({ dia: null }) }).dataEmissao).toBeNull();
    const rotulada = semData.replace("Protocolo de Autorização", "Data da Emissão 12/10/2026\nProtocolo de Autorização");
    expect(ler(rotulada).dataEmissao).toBe("2026-10-12");
  });
});

describe("NFC-e: descrição do item", () => {
  const CAB = "# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL";
  const itens = (...linhas: string[]) => ler(["LOJA TESTE LTDA", "CNPJ: 11.222.333/0001-81", CAB, ...linhas, "Valor total R$ 99,00"].join("\n")).itens.map((i) => i.descricao);

  it("tira o número do item e o código de barras do começo da descrição", () => {
    expect(itens("FITA VEDA 2 UN x 6,90 13,80")).toEqual(["FITA VEDA"]);
    expect(itens("001 FITA VEDA 2 UN x 6,90 13,80")).toEqual(["FITA VEDA"]);
    expect(itens("7891000100103 FITA VEDA 2 UN x 6,90 13,80")).toEqual(["FITA VEDA"]);
    expect(itens("001 7891000100103 FITA VEDA 2 UN x 6,90 13,80")).toEqual(["FITA VEDA"]);
  });

  it("descrição de uma palavra só é mantida, com ou sem código", () => {
    expect(itens("PARAFUSO 2 UN x 6,90 13,80")).toEqual(["PARAFUSO"]);
    expect(itens("001 PARAFUSO 2 UN x 6,90 13,80")).toEqual(["PARAFUSO"]);
  });

  it("descrição em linhas acima da linha de valores", () => {
    expect(itens("FITA VEDA", "ROSCA 18MM", "2 UN x 6,90 13,80")).toEqual(["FITA VEDA ROSCA 18MM"]);
    expect(itens("FITA VEDA ROSCA", "001 7891000100103 2 UN x 6,90 13,80")).toEqual(["FITA VEDA ROSCA"]);
  });

  it("linha de valores sem descrição nenhuma é descartada", () => {
    expect(itens("2 UN x 6,90 13,80")).toEqual([]);
  });

  it("a descrição acumulada de um item não vaza para o seguinte", () => {
    expect(itens("FITA VEDA", "2 UN x 6,90 13,80", "LUVA PVC 1 UN x 5,00 5,00")).toEqual(["FITA VEDA", "LUVA PVC"]);
  });

  it("linha só de rótulos dentro da lista é ignorada", () => {
    expect(itens("FITA VEDA 2 UN x 6,90 13,80", "VALOR UNIT  VALOR TOTAL", "LUVA PVC 1 UN x 5,00 5,00")).toEqual(["FITA VEDA", "LUVA PVC"]);
  });
});
