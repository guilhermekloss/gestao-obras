import { describe, expect, it } from "vitest";
import { encontrarAncoras, type Ancoras } from "../comum";
import { construirDoc } from "../documento";
import { interpretarGenerico } from "../interpretes/generico";
import { montarTexto } from "./auxiliar";

const doc = (texto: string) => construirDoc(montarTexto(texto));
function ler(texto: string, extra: Partial<Ancoras> = {}) {
  const d = doc(texto);
  return interpretarGenerico(d, { ...encontrarAncoras(d), ...extra }).lido;
}
const NOTA_NAO_FISCAL = "Documento sem valor fiscal (orçamento/pedido/comprovante): confira se é mesmo uma despesa.";
const SEM_VALOR = "Valor total não identificado com rótulo claro.";

describe("genérico: valor total", () => {
  it("vale o primeiro rótulo da lista que existir", () => {
    expect(ler("Valor a Pagar R$ 10,00\nValor Total R$ 20,00\nTotal R$ 30,00").valorTotal).toBe(10);
    expect(ler("Valor Total R$ 20,00\nTotal R$ 30,00").valorTotal).toBe(20);
    expect(ler("Total R$ 30,00\nValor do Documento R$ 40,00").valorTotal).toBe(30);
    expect(ler("Valor do Documento R$ 40,00\nValor Cobrado R$ 50,00").valorTotal).toBe(40);
    expect(ler("Valor Cobrado R$ 50,00\nValor Pago R$ 60,00").valorTotal).toBe(50);
    expect(ler("Valor Pago R$ 60,00\nValor R$ 70,00").valorTotal).toBe(60);
    expect(ler("Valor R$ 70,00").valorTotal).toBe(70);
  });

  it("sem valor, ou valor zerado: nulo, com aviso", () => {
    const sem = ler("Texto qualquer sem valores");
    expect(sem.valorTotal).toBeNull();
    expect(sem.observacoes).toBe(SEM_VALOR);
    const zero = ler("Valor Total R$ 0,00");
    expect(zero.valorTotal).toBeNull();
    expect(zero.observacoes).toBe(SEM_VALOR);
    expect(ler("Valor Total R$ 5,00").observacoes).toBeNull();
  });

  it("o valor do código de arrecadação vence o impresso e a forma é boleto", () => {
    const arrecadacao = { tipo: "ARRECADACAO", arrecadacao: { valor: 99.9 } } as unknown as Ancoras["pagamento"];
    const lido = ler("Valor Total R$ 20,00\nPago via PIX", { pagamento: arrecadacao });
    expect(lido.valorTotal).toBe(99.9);
    expect(lido.formaPagamento).toBe("BOLETO");
    const semValor = { tipo: "ARRECADACAO", arrecadacao: { valor: undefined } } as unknown as Ancoras["pagamento"];
    const lido2 = ler("Valor Total R$ 20,00", { pagamento: semValor });
    expect(lido2.valorTotal).toBe(20);
    expect(lido2.formaPagamento).toBe("BOLETO");
    const boleto = { tipo: "BOLETO", boleto: {} } as unknown as Ancoras["pagamento"];
    expect(ler("Valor Total R$ 20,00", { pagamento: boleto }).formaPagamento).toBe("NAO_INFORMADA");
  });
});

describe("genérico: data, número, forma e aviso", () => {
  it("data rotulada; sem rótulo, a primeira data do texto", () => {
    expect(ler("Data de Emissão 03/04/2026\nVencimento 10/05/2026").dataEmissao).toBe("2026-04-03");
    expect(ler("Data do Documento 04/05/2026").dataEmissao).toBe("2026-05-04");
    expect(ler("Vencimento 10/05/2026 e 11/05/2026").dataEmissao).toBe("2026-05-10");
    expect(ler("sem data").dataEmissao).toBeNull();
  });

  it("número do documento", () => {
    expect(ler("Número do Documento 4455").numero).toBe("4455");
    expect(ler("Número 77").numero).toBe("77");
    expect(ler("sem número").numero).toBeNull();
  });

  it("forma de pagamento pelo texto", () => {
    expect(ler("Pago em dinheiro").formaPagamento).toBe("DINHEIRO");
    expect(ler("nada").formaPagamento).toBe("NAO_INFORMADA");
  });

  it.each(["ORÇAMENTO", "PEDIDO 123", "SEM VALOR FISCAL", "NÃO É DOCUMENTO FISCAL", "Não  é  documento  fiscal"])("'%s' avisa que não é documento fiscal", (marca) => {
    expect(ler(`${marca}\nValor Total R$ 5,00`).observacoes).toBe(NOTA_NAO_FISCAL);
  });

  it("palavras parecidas não disparam o aviso", () => {
    expect(ler("ORCAMENTOS e PEDIDOS\nValor Total R$ 5,00").observacoes).toBeNull();
  });

  it("os avisos se juntam", () => {
    expect(ler("ORÇAMENTO sem valor").observacoes).toBe(`${NOTA_NAO_FISCAL} ${SEM_VALOR}`);
  });
});

describe("genérico: emitente", () => {
  const doc14 = (valor: string, linha: number, inicio: number, valido = true) => ({ valor, linha, inicio, valido }) as never;

  it("documento: o primeiro válido; senão o primeiro", () => {
    const texto = "LOJA DO ZE LTDA CNPJ 11.222.333/0001-81\nOUTRA";
    expect(ler(texto, { documentos: [doc14("1", 0, 16, false), doc14("11222333000181", 0, 16)] }).emitente.documento).toBe("11222333000181");
    expect(ler(texto, { documentos: [doc14("1", 0, 16, false), doc14("2", 0, 16, false)] }).emitente.documento).toBe("1");
    expect(ler(texto, { documentos: [] }).emitente.documento).toBeNull();
  });

  it("nome: o texto antes do documento, sem o rótulo CNPJ/CPF e sem separadores no fim", () => {
    const linha = "LOJA DO ZE LTDA - CNPJ: 11.222.333/0001-81";
    expect(ler(linha, { documentos: [doc14("11222333000181", 0, linha.indexOf("11.222"))] }).emitente.nome).toBe("LOJA DO ZE LTDA");
    const cpf = "ZE DA SILVA  CPF 529.982.247-25";
    expect(ler(cpf, { documentos: [doc14("52998224725", 0, cpf.indexOf("529"))] }).emitente.nome).toBe("ZE DA SILVA");
    const cnpjMinusculo = "Loja do Ze Ltda cnpj 11.222.333/0001-81";
    expect(ler(cnpjMinusculo, { documentos: [doc14("11222333000181", 0, cnpjMinusculo.indexOf("11.222"))] }).emitente.nome).toBe("Loja do Ze Ltda");
  });

  it("sem letras suficientes antes do documento, vale a linha de cima; só até o primeiro vão", () => {
    const texto = "COMERCIAL EXEMPLO LTDA      Av. Central\n11.222.333/0001-81";
    expect(ler(texto, { documentos: [doc14("11222333000181", 1, 0)] }).emitente.nome).toBe("COMERCIAL EXEMPLO LTDA");
    const curto = "AB 1\n11.222.333/0001-81";
    expect(ler(curto, { documentos: [doc14("11222333000181", 1, 0)] }).emitente.nome).toBeNull();
    const primeira = "11.222.333/0001-81";
    expect(ler(primeira, { documentos: [doc14("11222333000181", 0, 0)] }).emitente.nome).toBeNull();
  });

  it("nome com exatamente 4 letras vale", () => {
    expect(ler("ABCD 11.222.333/0001-81", { documentos: [doc14("11222333000181", 0, 5)] }).emitente.nome).toBe("ABCD");
    expect(ler("ABC 11.222.333/0001-81", { documentos: [doc14("11222333000181", 0, 4)] }).emitente.nome).toBeNull();
  });

  it("telefone do texto", () => {
    expect(ler("Fone: (11) 3333-4444").emitente.telefone).toBe("(11) 3333-4444");
    expect(ler("sem telefone").emitente.telefone).toBeNull();
  });
});
