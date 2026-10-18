import { describe, expect, it } from "vitest";
import { encontrarAncoras } from "../comum";
import { construirDoc } from "../documento";
import { interpretarRecibo } from "../interpretes/recibo";
import { formatarReais } from "../normalizacao";
import { montarTexto } from "./auxiliar";
import { RECIBO } from "./fixtures";

const doc = (texto: string) => construirDoc(montarTexto(texto));
function ler(texto: string) {
  const d = doc(texto);
  return interpretarRecibo(d, encontrarAncoras(d)).lido;
}
const corpo = (...linhas: string[]) => ["RECIBO", ...linhas].join("\n");

describe("recibo: leitura completa", () => {
  it("lê número, pagador, valor, data, emitente e item", () => {
    const lido = ler(RECIBO);
    expect(lido.numero).toBe("042");
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido).toMatchObject({ valorTotal: 1500, dataEmissao: "2026-10-10", formaPagamento: "PIX" });
    expect(lido.emitente).toEqual({ nome: "JOSÉ DA SILVA PEREIRA", documento: "52998224725", telefone: "(11) 98888-7777" });
    expect(lido.itens).toHaveLength(1);
    expect(lido.itens[0]).toMatchObject({ valorTotal: 1500, quantidade: null, unidade: null, valorUnitario: null, desconto: null });
    expect(lido.observacoes).toBeNull();
  });
});

describe("recibo: número", () => {
  it.each([
    ["RECIBO Nº 042", "042"],
    ["RECIBO N° 7/2026", "7/2026"],
    ["RECIBO N. 12-A", "12-A"],
    ["RECIBO NO 55", "55"],
    ["RECIBO N: 9", "9"],
    ["RECIBO DE SERVICOS Nº 77", "77"],
    ["RECIBO Nº 1234567890123", "123456789012"],
  ])("'%s' → %s", (linha, numero) => {
    expect(ler(corpo(linha.replace(/^RECIBO /, ""), "Recebi de FULANO, a importância de R$ 10,00")).numero).toBe(numero);
  });

  it("o número tem de começar por dígito e estar perto da palavra recibo", () => {
    expect(ler("RECIBO Nº ABC\nRecebi de FULANO, a importância de R$ 10,00").numero).toBeNull();
    expect(ler(`RECIBO ${"x".repeat(30)} Nº 5\nRecebi de FULANO, a importância de R$ 10,00`).numero).toBeNull();
  });

  it("só olha as quatro primeiras linhas", () => {
    expect(ler("A\nB\nC\nRECIBO Nº 8\nRecebi de FULANO").numero).toBe("8");
    expect(ler("A\nB\nC\nD\nRECIBO Nº 8\nRecebi de FULANO").numero).toBeNull();
  });
});

describe("recibo: pagador", () => {
  const nomeDe = (frase: string) => ler(corpo(frase)).destinatario.nome;

  it.each([
    ["Recebi de FULANO DE TAL, CNPJ 98.765.432/0001-98, a importância de R$ 10,00", "FULANO DE TAL"],
    ["Recebi do Sr. João Silva, a importância de R$ 10,00", "João Silva"],
    ["Recebi do SR. João Silva, a importância de R$ 10,00", "João Silva"],
    ["Recebi da Sra. Maria Souza, a importância de R$ 10,00", "Maria Souza"],
    ["Recebemos da empresa Alfa Beta LTDA, a importância de R$ 10,00", "Alfa Beta LTDA"],
    ["Recebi de Pedro Alves inscrito no CPF, a importância de R$ 10,00", "Pedro Alves"],
    ["Recebi de Pedro Alves portador do RG 12, a importância de R$ 10,00", "Pedro Alves"],
    ["Recebi de Pedro Alves CPF 529.982.247-25 a importância de R$ 10,00", "Pedro Alves"],
    ["Recebi de Pedro Alves a importância de R$ 10,00", "Pedro Alves"],
    ["Recebi de Pedro Alves a quantia de R$ 10,00", "Pedro Alves"],
    ["Recebi do(a) Pedro Alves, a quantia de R$ 10,00", "Pedro Alves"],
  ])("'%s' → %s", (frase, nome) => {
    expect(nomeDe(frase)).toBe(nome);
  });

  it("documento do pagador: entre o nome e a importância; sem importância, até 40 caracteres", () => {
    const comImportancia = ler(corpo("Recebi de FULANO, CPF 529.982.247-25, a importância de R$ 10,00 CNPJ 11.222.333/0001-81"));
    expect(comImportancia.destinatario.documento).toBe("52998224725");
    const longe = ler(corpo("Recebi de FULANO, " + "x ".repeat(30) + "CPF 529.982.247-25"));
    expect(longe.destinatario.documento).toBeNull();
    const perto = ler(corpo("Recebi de FULANO, CPF 529.982.247-25"));
    expect(perto.destinatario.documento).toBe("52998224725");
  });

  it("sem frase de recebimento, sem pagador", () => {
    expect(ler(corpo("Pagamento de serviços, R$ 10,00")).destinatario).toEqual({ nome: null, documento: null });
  });
});

describe("recibo: valor", () => {
  it("o valor do cabeçalho vence o do texto; sem cabeçalho, o do texto", () => {
    expect(ler(corpo("VALOR R$ 1.500,00", "Recebi de FULANO, a importância de R$ 1.500,00 (mil e quinhentos reais)")).valorTotal).toBe(1500);
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 320,50")).valorTotal).toBe(320.5);
  });

  it("cabeçalho e texto diferentes: vale o cabeçalho e avisa", () => {
    const lido = ler(corpo("VALOR R$ 1.500,00", "Recebi de FULANO, a importância de R$ 1.200,00"));
    expect(lido.valorTotal).toBe(1500);
    expect(lido.observacoes).toBe(`O valor do cabeçalho (${formatarReais(1500)}) difere do valor no texto (${formatarReais(1200)}); confira.`);
  });

  it("diferença de meio centavo ou menos não avisa", () => {
    expect(ler(corpo("VALOR R$ 1.500,00", "Recebi de FULANO, a importância de R$ 1.500,00")).observacoes).toBeNull();
  });

  it("valor só por extenso é usado, com aviso", () => {
    const lido = ler(corpo("Recebi de FULANO, a importância de (mil e quinhentos reais)"));
    expect(lido.valorTotal).toBe(1500);
    expect(lido.observacoes).toBe(`Valor lido só por extenso (${formatarReais(1500)}) — confira.`);
  });

  it("extenso que não bate com os algarismos avisa; que bate, não", () => {
    const diverge = ler(corpo("Recebi de FULANO, a importância de R$ 1.200,00 (mil e quinhentos reais)"));
    expect(diverge.valorTotal).toBe(1200);
    expect(diverge.observacoes).toBe(`O valor por extenso (${formatarReais(1500)}) difere do valor em algarismos; confira.`);
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 1.500,00 (mil e quinhentos reais)")).observacoes).toBeNull();
  });

  it("sem nenhum valor, nada", () => {
    expect(ler(corpo("Recebi de FULANO, referente a serviços.")).valorTotal).toBeNull();
  });

  it("o valor do cabeçalho só vale nas seis primeiras linhas", () => {
    const lido = ler(corpo("A", "B", "C", "D", "E", "VALOR R$ 9,00"));
    expect(lido.valorTotal).toBeNull();
  });
});

describe("recibo: referente a, item e forma de pagamento", () => {
  it("o item descreve o 'referente a' e leva o valor do recibo", () => {
    const lido = ler(corpo("Recebi de FULANO, a importância de R$ 900,00 referente aos serviços de pintura. Pagamento via PIX."));
    expect(lido.itens).toHaveLength(1);
    expect(lido.itens[0]).toMatchObject({ descricao: "serviços de pintura", valorTotal: 900 });
  });

  it.each([
    ["referente a mão de obra de piso, dando plena quitação.", "mão de obra de piso"],
    ["correspondente ao aluguel de betoneira, para maior clareza.", "aluguel de betoneira"],
    ["relativo à compra de areia, pelo que firmo.", "compra de areia"],
    ["referente as despesas de obra", "despesas de obra"],
  ])("'%s' → %s", (trecho, descricao) => {
    const lido = ler(corpo(`Recebi de FULANO, a importância de R$ 900,00 ${trecho}`));
    expect(lido.itens[0]?.descricao).toBe(descricao);
  });

  it("vírgula logo depois do valor é pontuação: o valor e o item são lidos", () => {
    const lido = ler(corpo("Recebi de FULANO, a importância de R$ 900,00, referente aos serviços de pintura."));
    expect(lido.valorTotal).toBe(900);
    expect(lido.itens[0]).toMatchObject({ descricao: "serviços de pintura", valorTotal: 900 });
  });

  it("sem 'referente a' ou sem valor, não há item", () => {
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 900,00.")).itens).toEqual([]);
    expect(ler(corpo("Recebi de FULANO, referente a serviços.")).itens).toEqual([]);
  });

  it("pagamento em cheque: avisa e não deduz a forma; sem cheque, deduz do texto", () => {
    const cheque = ler(corpo("Recebi de FULANO, a importância de R$ 900,00, pago em cheque, via PIX."));
    expect(cheque.formaPagamento).toBe("NAO_INFORMADA");
    expect(cheque.observacoes).toBe("Pagamento em cheque — confira o meio de pagamento.");
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 900,00, via PIX.")).formaPagamento).toBe("PIX");
  });

  it("a forma de pagamento é buscada depois da importância (o que vem antes não conta)", () => {
    expect(ler(corpo("PIX", "Recebi de FULANO, a importância de R$ 900,00, em dinheiro.")).formaPagamento).toBe("DINHEIRO");
  });
});

describe("recibo: data de emissão", () => {
  it.each([
    ["São Paulo, 10 de outubro de 2026.", "2026-10-10"],
    ["Curitiba, 5 de março de 2026", "2026-03-05"],
    ["Curitiba, 07/08/2026", "2026-08-07"],
    ["Curitiba, 7.8.2026", "2026-08-07"],
  ])("'%s' → %s", (linha, data) => {
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 10,00", linha)).dataEmissao).toBe(data);
  });

  it("havendo várias linhas cidade-data, vale a última", () => {
    expect(ler(corpo("Curitiba, 01/01/2026", "Curitiba, 02/02/2026")).dataEmissao).toBe("2026-02-02");
  });

  it("sem linha de cidade e data, usa a data rotulada; depois, a primeira data que não seja do período citado", () => {
    expect(ler(corpo("Data de Emissão: 03/04/2026", "Recebi de FULANO, a importância de R$ 10,00")).dataEmissao).toBe("2026-04-03");
    const periodo = ler(corpo("Recebi de FULANO, a importância de R$ 10,00, referente a medição de 01/10/2026 a 10/10/2026. Pago em 12/10/2026."));
    expect(periodo.dataEmissao).toBe("2026-10-12");
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 10,00, pago em 12/10/2026.")).dataEmissao).toBe("2026-10-12");
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 10,00.")).dataEmissao).toBeNull();
  });
});

describe("recibo: emitente", () => {
  const base = ["Recebi de FULANO, a importância de R$ 10,00", "Curitiba, 10/10/2026"];

  it("nome logo depois da linha da data ou da linha de assinatura", () => {
    expect(ler(corpo(...base, "JOSE DA SILVA PEREIRA")).emitente.nome).toBe("JOSE DA SILVA PEREIRA");
    expect(ler(corpo("Recebi de FULANO, a importância de R$ 10,00", "______________", "MARIA SOUZA LIMA")).emitente.nome).toBe("MARIA SOUZA LIMA");
  });

  it("prefixos 'Nome:' e 'Emitente:' saem; linhas de CPF, CNPJ, RG, fone, tel e assinatura são puladas", () => {
    expect(ler(corpo(...base, "Nome: JOSE DA SILVA")).emitente.nome).toBe("JOSE DA SILVA");
    expect(ler(corpo(...base, "Emitente: JOSE DA SILVA")).emitente.nome).toBe("JOSE DA SILVA");
    expect(ler(corpo(...base, "Recebedor: JOSE DA SILVA")).emitente.nome).toBe("JOSE DA SILVA");
    for (const pular of ["CPF 529.982.247-25", "CNPJ 11.222.333/0001-81", "RG 12.345.678", "FONE (11) 98888-7777", "TEL (11) 98888-7777", "ASSINATURA", "________"]) {
      expect(ler(corpo(...base, pular, "JOSE DA SILVA")).emitente.nome).toBe("JOSE DA SILVA");
    }
  });

  it("linha com menos de 4 letras, ou com documento, não é nome", () => {
    expect(ler(corpo(...base, "AB 12", "JOSE DA SILVA")).emitente.nome).toBe("JOSE DA SILVA");
    expect(ler(corpo(...base, "JOSE SILVA 529.982.247-25", "MARIA SOUZA")).emitente.nome).toBe("MARIA SOUZA");
    expect(ler(corpo(...base, "ABCD")).emitente.nome).toBe("ABCD");
  });

  it("documento e telefone do emitente vêm do trecho depois do nome", () => {
    const lido = ler(corpo(...base, "JOSE DA SILVA", "CPF 529.982.247-25", "Fone: (11) 98888-7777"));
    expect(lido.emitente).toEqual({ nome: "JOSE DA SILVA", documento: "52998224725", telefone: "(11) 98888-7777" });
  });

  it("documento do emitente: o primeiro válido depois da assinatura, senão o primeiro", () => {
    const invalido = ler(corpo(...base, "JOSE DA SILVA", "CPF 529.982.247-26"));
    expect(invalido.emitente.documento).not.toBeNull();
    const dois = ler(corpo(...base, "JOSE DA SILVA", "CPF 529.982.247-26", "CPF 111.444.777-35"));
    expect(dois.emitente.documento).toBe("11144477735");
  });

  it("documentos antes da assinatura (o do pagador) não são do emitente", () => {
    const lido = ler(corpo("Recebi de FULANO, CNPJ 98.765.432/0001-98, a importância de R$ 10,00", "Curitiba, 10/10/2026", "JOSE DA SILVA"));
    expect(lido.emitente.documento).toBeNull();
  });

  it("sem linha de data nem de assinatura, o emitente vem de 'Eu, FULANO, portador...'", () => {
    const lido = ler("Eu, JOSE DA SILVA, portador do CPF 529.982.247-25, declaro ter recebido a quantia de R$ 10,00");
    expect(lido.emitente.nome).toBe("JOSE DA SILVA");
    const brasileiro = ler("Eu JOSE DA SILVA, brasileiro, declaro ter recebido");
    expect(brasileiro.emitente.nome).toBe("JOSE DA SILVA");
  });
});
