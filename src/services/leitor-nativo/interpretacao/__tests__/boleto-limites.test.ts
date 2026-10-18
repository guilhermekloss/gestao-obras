import { describe, expect, it } from "vitest";
import { encontrarAncoras, type Ancoras } from "../comum";
import { construirDoc } from "../documento";
import { interpretarBoleto } from "../interpretes/boleto";
import { formatarReais } from "../normalizacao";
import { montarTexto } from "./auxiliar";
import { BOLETO, LINHA_BOLETO } from "./fixtures";

const doc = (texto: string) => construirDoc(montarTexto(texto));
function ler(texto: string, extra: Partial<Ancoras> = {}, dataReferencia?: string | null) {
  const d = doc(texto);
  return interpretarBoleto(d, { ...encontrarAncoras(d), ...extra }, dataReferencia).lido;
}
const trocar = (texto: string, de: string, para: string) => {
  expect(texto).toContain(de);
  return texto.replace(de, para);
};
const SEM_LINHA = BOLETO.split("\n").filter((l) => !l.includes(LINHA_BOLETO)).join("\n");

describe("boleto: leitura completa", () => {
  it("lê valor, vencimento, beneficiário, pagador, número e data do documento", () => {
    const lido = ler(BOLETO);
    expect(lido).toMatchObject({
      tipo: "BOLETO",
      valorTotal: 1234.56,
      dataEmissao: "2026-09-15",
      numero: "12345/002",
      formaPagamento: "BOLETO",
      parcelas: [{ vencimento: "2026-10-30", valor: 1234.56 }],
      observacoes: null,
    });
    expect(lido.emitente).toMatchObject({ nome: "DEPOSITO DE MATERIAIS FICTICIOS LTDA", documento: "11222333000181" });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
  });
});

describe("boleto: valor e vencimento do código de barras", () => {
  it("sem a linha digitável: usa o impresso e avisa", () => {
    const lido = ler(SEM_LINHA);
    expect(lido.valorTotal).toBe(1234.56);
    expect(lido.parcelas).toEqual([{ vencimento: "2026-10-30", valor: 1234.56 }]);
    expect(lido.observacoes).toBe("Linha digitável não lida com segurança; valor e vencimento vieram do texto impresso — confira.");
  });

  it("vencimento impresso diferente do código: vale o do código, com aviso em dd/mm/aaaa", () => {
    const lido = ler(trocar(BOLETO, "Vencimento 30/10/2026", "Vencimento 05/11/2026").replace("30/10/2026", "05/11/2026"));
    expect(lido.parcelas[0].vencimento).toBe("2026-10-30");
    expect(lido.observacoes).toBe("O vencimento impresso (05/11/2026) difere do código de barras (30/10/2026); foi usado o do código — confira.");
  });

  it("valor impresso diferente do código: vale o do código, com aviso", () => {
    const lido = ler(BOLETO.replaceAll("1.234,56", "1.200,00"));
    expect(lido.valorTotal).toBe(1234.56);
    expect(lido.observacoes).toBe(`O valor impresso (${formatarReais(1200)}) difere do valor do código de barras (${formatarReais(1234.56)}); foi usado o do código.`);
  });

  it("valor impresso igual ao do código: sem aviso", () => {
    expect(ler(BOLETO).observacoes).toBeNull();
  });

  it("sem código e sem valor impresso: sem total e sem parcela", () => {
    const sem = SEM_LINHA.replaceAll("1.234,56", "");
    const lido = ler(sem);
    expect(lido.valorTotal).toBeNull();
    expect(lido.parcelas).toEqual([]);
  });

  it("valor impresso zerado não vale", () => {
    expect(ler(SEM_LINHA.replaceAll("1.234,56", "0,00")).valorTotal).toBeNull();
  });

  it("o fator de vencimento usa a data do documento como referência para escolher o ciclo", () => {
    const antigo = BOLETO.replace("15/09/2026         12345/002", "15/09/2002         12345/002");
    expect(ler(antigo).dataEmissao).toBe("2002-09-15");
    expect(ler(antigo).parcelas[0].vencimento).toBe("2002-03-10");
  });

  it("a data de referência informada é usada quando o boleto não traz data", () => {
    const sem = trocar(trocar(BOLETO, "15/09/2026         12345/002", "                   12345/002"), "15/09/2026             109/12345678-2", "                       109/12345678-2");
    const d = doc(sem);
    const a = encontrarAncoras(d);
    expect(a.pagamento?.tipo).toBe("BOLETO");
    const semVenc = sem.replaceAll("30/10/2026", "");
    const lido = ler(semVenc, {}, "2002-03-01");
    expect(lido.parcelas[0]?.vencimento).toBe("2002-03-10");
    expect(ler(semVenc, {}, null).parcelas[0]?.vencimento).toBe("2026-10-30");
  });
});

describe("boleto: partes", () => {
  it("sem documento rotulado do beneficiário: o primeiro válido que não seja o do pagador", () => {
    const texto = ["Banco Exemplo", "Pagador: CONSTRUTORA X  CNPJ 98.765.432/0001-98", "Valor do Documento R$ 10,00"].join("\n");
    const doc14 = (valor: string, valido = true) => ({ valor, valido, linha: 0 }) as never;
    const lido = ler(texto, { documentos: [doc14("98765432000198"), doc14("45678901000176", false), doc14("11222333000181")] });
    expect(lido.destinatario.documento).toBe("98765432000198");
    expect(lido.emitente.documento).toBe("11222333000181");
    expect(ler(texto, { documentos: [doc14("98765432000198")] }).emitente.documento).toBeNull();
    expect(ler(texto, { documentos: [] }).emitente.documento).toBeNull();
  });

  it("sacador/avalista preenchido avisa que o beneficiário pode ser um banco", () => {
    const com = trocar(BOLETO, "Sacador/Avalista:                                         Autenticação", "Sacador/Avalista: FORNECEDOR REAL LTDA                         Autenticação");
    expect(ler(com).observacoes).toBe(
      "Boleto com sacador/avalista (FORNECEDOR REAL LTDA): o beneficiário pode ser um banco ou securitizadora — confira o fornecedor.",
    );
  });

  it("sacador vazio ou na linha de baixo não conta", () => {
    expect(ler(BOLETO).observacoes).toBeNull();
    const embaixo = trocar(BOLETO, "Sacador/Avalista:                                         Autenticação", "Sacador/Avalista\nOUTRA EMPRESA LTDA");
    expect(ler(embaixo).observacoes).toBeNull();
  });
});
