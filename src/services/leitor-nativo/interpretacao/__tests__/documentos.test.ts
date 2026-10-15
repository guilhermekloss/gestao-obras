import { describe, expect, it } from "vitest";
import { documentoLidoSchema, normalizarLeitura, type DocumentoLido } from "../../../leitura-documento";
import { interpretarDocumento, interpretarOuLancar } from "..";
import { montarTexto, type OpcoesTexto } from "./auxiliar";
import {
  BOLETO,
  CHAVE_NFCE,
  CHAVE_NFE,
  DANFE,
  DANFE_EMPILHADO,
  DAS,
  NAO_DOCUMENTO,
  NFCE,
  NFSE_NACIONAL,
  NFSE_SP,
  QR_NFCE,
  RECIBO,
} from "./fixtures";

const HOJE = "2026-10-31";

const VARIANTES: [string, OpcoesTexto][] = [
  ["com posições", {}],
  ["sem posições", { posicoes: false }],
  ["texto corrido, sem vãos nem posições", { posicoes: false, colapsar: true }],
];

function ler(texto: string, opcoes: OpcoesTexto = {}): DocumentoLido {
  const lido = interpretarOuLancar(montarTexto(texto, opcoes));
  expect(documentoLidoSchema.safeParse(lido).success).toBe(true);
  return lido;
}

/** Avisos de `normalizarLeitura` (falha se a leitura for recusada). */
function avisos(lido: DocumentoLido): string[] {
  const r = normalizarLeitura(lido, HOJE);
  if (!r.ok) throw new Error(r.erro);
  return r.leitura.avisos;
}

const soma = (xs: (number | null)[]) => Math.round(xs.reduce<number>((s, x) => s + (x ?? 0), 0) * 100) / 100;

describe.each(VARIANTES)("DANFE NF-e (%s)", (_nome, opcoes) => {
  it("lê cabeçalho, itens, frete, totais e duplicatas", () => {
    const lido = ler(DANFE, opcoes);
    expect(lido.tipo).toBe("NFE");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.chaveAcesso).toBe(CHAVE_NFE);
    expect(lido.emitente).toEqual({ nome: "DEPOSITO DE MATERIAIS FICTICIOS LTDA", documento: "11222333000181", telefone: "(11) 3333-4444" });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido.numero).toBe("000.012.345");
    expect(lido.serie).toBe("001");
    expect(lido.dataEmissao).toBe("2026-09-15");
    expect(lido.valorTotal).toBe(1675.5);
    expect(lido.valorFrete).toBe(80);
    expect(lido.valorOutrasDespesas).toBeNull();
    expect(lido.descontoGeral).toBeNull();
    expect(lido.formaPagamento).toBe("BOLETO");
    expect(lido.itens).toEqual([
      { descricao: "CIMENTO CP II-F-32 50KG", quantidade: 20, unidade: "SC", valorUnitario: 32.9, desconto: null, valorTotal: 658, tipo: "MATERIAL" },
      {
        descricao: "VERGALHAO CA-50 10,0MM BARRA 12M NERVURADO",
        quantidade: 15,
        unidade: "BR",
        valorUnitario: 38.5,
        desconto: null,
        valorTotal: 577.5,
        tipo: "MATERIAL",
      },
      { descricao: "AREIA MEDIA LAVADA", quantidade: 3, unidade: "M3", valorUnitario: 120, desconto: null, valorTotal: 360, tipo: "MATERIAL" },
    ]);
    expect(lido.parcelas).toEqual([
      { vencimento: "2026-10-15", valor: 837.75 },
      { vencimento: "2026-11-14", valor: 837.75 },
    ]);
    expect(lido.observacoes).toBeNull();
    expect(avisos(lido)).toEqual([]);
  });

  it("caixas empilhadas: 7 itens com descrição quebrada, IPI e transportadora ignorada", () => {
    const lido = ler(DANFE_EMPILHADO, opcoes);
    expect(lido.tipo).toBe("NFE");
    expect(lido.emitente.documento).toBe("11222333000181");
    expect(lido.emitente.nome).toBe("DEPOSITO DE MATERIAIS FICTICIOS LTDA");
    expect(lido.destinatario.documento).toBe("98765432000198");
    expect(lido.valorTotal).toBe(3355.32);
    expect(lido.valorFrete).toBe(120);
    expect(lido.valorOutrasDespesas).toBe(19.47);
    expect(lido.itens).toHaveLength(7);
    expect(lido.itens[1].descricao).toBe("VERGALHAO CA-50 10,0MM BARRA 12M NERVURADO - FEIXE COM 10 BARRAS");
    expect(lido.itens[3].descricao).toBe("BLOCO CONCRETO ESTRUTURAL 14X19X39CM");
    expect(lido.itens[2]).toMatchObject({ quantidade: 3.5, unidade: "M3", valorTotal: 420 });
    expect(soma(lido.itens.map((i) => i.valorTotal))).toBe(3215.85);
    expect(lido.parcelas).toEqual([
      { vencimento: "2026-10-15", valor: 1677.66 },
      { vencimento: "2026-11-14", valor: 1677.66 },
    ]);
    expect(lido.formaPagamento).toBe("BOLETO");
    expect(lido.legibilidade).toBe("BOA");
    expect(avisos(lido)).toEqual([]);
  });
});

describe("DANFE NF-e: variações", () => {
  it("texto corrido (sem vãos nem posições) ainda acha o essencial", () => {
    const lido = ler(DANFE, { posicoes: false, colapsar: true });
    expect(lido.tipo).toBe("NFE");
    expect(lido.chaveAcesso).toBe(CHAVE_NFE);
    expect(lido.emitente.documento).toBe("11222333000181");
    expect(lido.valorTotal).toBe(1675.5);
    expect(lido.itens).toHaveLength(3);
    expect(lido.parcelas).toHaveLength(2);
  });

  it("ruído de OCR na chave e no CNPJ: o DV arbitra a correção", () => {
    const ruidoso = DANFE.replace("3526 0911 2223 3300 0181", "3526 O911 2223 33OO 0l81").replace(
      "11.222.333/0001-81\nDESTINAT",
      "11.222.333/OOO1-8l\nDESTINAT",
    );
    const lido = ler(ruidoso);
    expect(lido.chaveAcesso).toBe(CHAVE_NFE);
    expect(lido.emitente.documento).toBe("11222333000181");
  });

  it("chave com DV errado e sem código: devolvida como lida (o normalizador avisa)", () => {
    const lido = ler(DANFE.replace("7654 3218", "7654 3219"));
    expect(lido.chaveAcesso).toBe("35260911222333000181550010000123451876543219");
    expect(lido.tipo).toBe("NFE");
    expect(avisos(lido)).toContain("A chave de acesso não pôde ser lida com segurança e foi ignorada.");
  });

  it("chave do Code-128 prevalece sobre o texto", () => {
    const semChave = DANFE.replace("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218", "");
    const lido = ler(semChave, { codigos: [{ formato: "CODE128", texto: CHAVE_NFE, pagina: 1 }] });
    expect(lido.chaveAcesso).toBe(CHAVE_NFE);
  });

  it("folha faltando: legibilidade PARCIAL e observação", () => {
    const lido = ler(DANFE.replace("FOLHA 1/1", "FOLHA 1/2"));
    expect(lido.legibilidade).toBe("PARCIAL");
    expect(lido.observacoes).toMatch(/2 folhas/);
  });

  it("sem quadro de itens legível: observação para conferir", () => {
    const corte = DANFE.slice(0, DANFE.indexOf("CÓDIGO PRODUTO")) + "DADOS ADICIONAIS";
    const lido = ler(corte);
    expect(lido.itens).toEqual([]);
    expect(lido.observacoes).toBe("Itens não identificados na leitura; confira a tabela de produtos.");
  });
});

describe.each(VARIANTES)("NFC-e (%s)", (_nome, opcoes) => {
  it("itens em duas linhas, desconto no total, PIX e consumidor", () => {
    const lido = ler(NFCE, opcoes);
    expect(lido.tipo).toBe("NFCE");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.chaveAcesso).toBe(CHAVE_NFCE);
    expect(lido.emitente).toEqual({ nome: "FERRAGENS FICTICIAS COMERCIO LTDA", documento: "11222333000181", telefone: "(11) 2222-3333" });
    expect(lido.destinatario).toEqual({ nome: null, documento: "12345678909" });
    expect(lido.numero).toBe("000000789");
    expect(lido.serie).toBe("001");
    expect(lido.dataEmissao).toBe("2026-10-15");
    expect(lido.valorTotal).toBe(98.5);
    expect(lido.descontoGeral).toBe(5);
    expect(lido.formaPagamento).toBe("PIX");
    expect(lido.itens.map((i) => [i.descricao, i.quantidade, i.unidade, i.valorUnitario, i.valorTotal])).toEqual([
      ["FITA VEDA ROSCA 18MMX25M", 2, "UN", 6.9, 13.8],
      ["LUVA PVC SOLDAVEL 25MM", 10, "UN", 1.85, 18.5],
      ["REGISTRO ESFERA 3/4 BRUTO", 1, "UN", 42.7, 42.7],
      ["ADESIVO PVC 175G", 1, "UN", 19.9, 19.9],
      ["JOELHO PVC 90 GRAUS 25MM", 4, "UN", 2.15, 8.6],
    ]);
    expect(lido.observacoes).toBeNull();
    expect(avisos(lido)).toEqual([]);
  });
});

describe("NFC-e: QR Code", () => {
  it("chave vem do QR mesmo sem a chave impressa legível", () => {
    const semChave = NFCE.replace("3526 1011 2223 3300 0181 6500 1000 0007 8911 3572 4688", "3526 1O11 #### 3300");
    const lido = ler(semChave, { codigos: [{ formato: "QR", texto: QR_NFCE, pagina: 1 }] });
    expect(lido.tipo).toBe("NFCE");
    expect(lido.chaveAcesso).toBe(CHAVE_NFCE);
  });
});

describe("Foto inclinada: linhas de item partidas", () => {
  it("NFC-e: total na linha de baixo ou subido para a linha da descrição", () => {
    const partido = NFCE.replace("                       2 UN x 6,90      13,80", "2 UN x 6,90\n13,80").replace(
      "002 7896543210987 LUVA PVC SOLDAVEL 25MM\n                      10 UN x 1,85      18,50",
      "002 7896543210987 LUVA PVC SOLDAVEL 25MM      18,50\n10 UN x 1,85",
    );
    const lido = ler(partido);
    expect(lido.itens.map((i) => [i.descricao, i.quantidade, i.valorUnitario, i.valorTotal])).toEqual([
      ["FITA VEDA ROSCA 18MMX25M", 2, 6.9, 13.8],
      ["LUVA PVC SOLDAVEL 25MM", 10, 1.85, 18.5],
      ["REGISTRO ESFERA 3/4 BRUTO", 1, 42.7, 42.7],
      ["ADESIVO PVC 175G", 1, 19.9, 19.9],
      ["JOELHO PVC 90 GRAUS 25MM", 4, 2.15, 8.6],
    ]);
  });

  it("DANFE: cauda numérica do item na linha de baixo", () => {
    const partido = DANFE.replace(
      "000123 CIMENTO CP II-F-32 50KG 25232910 060 5405 SC 20,0000 32,9000 658,00 0,00 0,00 0,00 0,00 0,00",
      "000123 CIMENTO CP II-F-32 50KG 25232910 060 5405 SC 20,0000\n32,9000 658,00 0,00 0,00 0,00 0,00 0,00",
    );
    const lido = ler(partido);
    expect(lido.itens).toHaveLength(3);
    expect(lido.itens[0]).toMatchObject({ descricao: "CIMENTO CP II-F-32 50KG", quantidade: 20, valorUnitario: 32.9, valorTotal: 658 });
    expect(lido.itens[1].descricao).toBe("VERGALHAO CA-50 10,0MM BARRA 12M NERVURADO");
  });
});

describe("CNPJ alfanumérico (a partir de 07/2026)", () => {
  it("DANFE com chave e CNPJ alfanuméricos", () => {
    const alfa = DANFE.replaceAll("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218", "3526 1012 ABC3 4501 DE35 5500 1000 0000 4212 4681 3577")
      .replaceAll("11.222.333/0001-81", "12.ABC.345/01DE-35")
      .replaceAll("000.012.345", "000.000.042");
    const lido = ler(alfa);
    expect(lido.tipo).toBe("NFE");
    expect(lido.chaveAcesso).toBe("35261012ABC34501DE35550010000000421246813577");
    expect(lido.emitente.documento).toBe("12ABC34501DE35");
    expect(lido.numero).toBe("000.000.042");
  });
});

describe.each(VARIANTES)("NFS-e (%s)", (_nome, opcoes) => {
  it("padrão nacional: valor bruto, retenções nas observações", () => {
    const lido = ler(NFSE_NACIONAL, opcoes);
    expect(lido.tipo).toBe("NFSE");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.chaveAcesso).toBeNull();
    expect(lido.emitente).toEqual({ nome: "ENGENHARIA FICTICIA SERVICOS LTDA", documento: "11222333000181", telefone: "(11) 3333-4444" });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido.numero).toBe("123");
    expect(lido.dataEmissao).toBe("2026-10-15");
    expect(lido.valorTotal).toBe(5000);
    expect(lido.formaPagamento).toBe("NAO_INFORMADA");
    expect(lido.itens).toEqual([
      {
        descricao:
          "EXECUCAO DE FUNDACOES TIPO ESTACA HELICE CONTINUA - OBRA RESIDENCIAL JARDIM CNO 90.000.12345/67 - MEDICAO 03 (01/09/2026 A 30/09/2026)",
        quantidade: null,
        unidade: null,
        valorUnitario: null,
        desconto: null,
        valorTotal: 5000,
        tipo: "SERVICO",
      },
    ]);
    expect(lido.observacoes).toBe(
      "Valor líquido R$ 4.200,00: ISS retido R$ 250,00 e INSS retido R$ 550,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).",
    );
    // a observação é o único aviso
    expect(avisos(lido)).toEqual([lido.observacoes]);
  });

  it("São Paulo: rótulo e valor na mesma linha", () => {
    const lido = ler(NFSE_SP, opcoes);
    expect(lido.tipo).toBe("NFSE");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.emitente).toEqual({ nome: "LOCADORA FICTICIA DE EQUIPAMENTOS LTDA", documento: "11222333000181", telefone: null });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido.numero).toBe("00004567");
    expect(lido.dataEmissao).toBe("2026-10-08");
    expect(lido.valorTotal).toBe(1800);
    expect(lido.itens).toEqual([
      {
        descricao: "LOCACAO DE BETONEIRA 400L COM OPERADOR - PERIODO 15/09/2026 A 30/09/2026 - OBRA RESIDENCIAL JARDIM",
        quantidade: null,
        unidade: null,
        valorUnitario: null,
        desconto: null,
        valorTotal: 1800,
        tipo: "SERVICO",
      },
    ]);
    expect(lido.observacoes).toBeNull();
    expect(lido.formaPagamento).toBe("NAO_INFORMADA");
    expect(avisos(lido)).toEqual([]);
  });
});

describe("NFS-e: ruído de OCR", () => {
  it("CNPJ do prestador com O/0 e l/1 trocados é corrigido pelo DV; valor com O no lugar de 0", () => {
    const ruidoso = NFSE_SP.replace("CPF/CNPJ: 11.222.333/0001-81", "CPF/CNPJ: 11.222.333/OOO1-8l").replace(
      "= R$ 1.800,00",
      "= R$ 1.8OO,OO",
    );
    const lido = ler(ruidoso);
    expect(lido.emitente.documento).toBe("11222333000181");
    expect(lido.valorTotal).toBe(1800);
  });

  it("CNPJ ilegível que não fecha o DV volta como lido", () => {
    const lido = ler(NFSE_SP.replace("CPF/CNPJ: 11.222.333/0001-81", "CPF/CNPJ: 11.222.383/0001-81"));
    expect(lido.emitente.documento).toBe("11222383000181");
    expect(lido.legibilidade).toBe("PARCIAL");
    expect(avisos(lido).some((a) => a.includes("não confere com os dígitos verificadores"))).toBe(true);
  });
});

describe.each(VARIANTES)("Boleto (%s)", (_nome, opcoes) => {
  it("valor e vencimento da linha digitável, conferidos com o impresso", () => {
    const lido = ler(BOLETO, opcoes);
    expect(lido.tipo).toBe("BOLETO");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.emitente).toEqual({ nome: "DEPOSITO DE MATERIAIS FICTICIOS LTDA", documento: "11222333000181", telefone: null });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido.numero).toBe("12345/002");
    expect(lido.dataEmissao).toBe("2026-09-15");
    expect(lido.valorTotal).toBe(1234.56);
    expect(lido.formaPagamento).toBe("BOLETO");
    expect(lido.itens).toEqual([]);
    expect(lido.parcelas).toEqual([{ vencimento: "2026-10-30", valor: 1234.56 }]);
    expect(lido.observacoes).toBeNull();
    expect(avisos(lido)).toEqual(["Os itens não foram identificados: o valor total entrou como um item único."]);
  });
});

describe("Boleto: divergências", () => {
  it("valor impresso diferente do código: vale o código, com observação", () => {
    const lido = ler(BOLETO.replace("Valor do Documento R$ 1.234,56", "Valor do Documento R$ 1.284,56"));
    expect(lido.valorTotal).toBe(1234.56);
    expect(lido.observacoes).toMatch(/difere do valor do código de barras/);
  });

  it("sem linha digitável legível: usa o impresso e avisa", () => {
    const lido = ler(BOLETO.replace(/34191\.09123.*$/m, "34191.0912? ilegível"));
    expect(lido.tipo).toBe("BOLETO");
    expect(lido.valorTotal).toBe(1234.56);
    expect(lido.parcelas).toEqual([{ vencimento: "2026-10-30", valor: 1234.56 }]);
    expect(lido.observacoes).toMatch(/Linha digitável não lida/);
  });

  it("código de barras ITF decodificado basta", () => {
    const lido = ler(BOLETO.replace(/34191\.09123.*$/m, ""), {
      codigos: [{ formato: "ITF", texto: "34191161500001234561091234567821234567890000", pagina: 1 }],
    });
    expect(lido.valorTotal).toBe(1234.56);
    expect(lido.parcelas[0]?.vencimento).toBe("2026-10-30");
  });
});

describe.each(VARIANTES)("DAS (%s)", (_nome, opcoes) => {
  it("guia do Simples: órgão, contribuinte, composição e vencimento", () => {
    const lido = ler(DAS, opcoes);
    expect(lido.tipo).toBe("GUIA");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.emitente).toEqual({ nome: "Simples Nacional", documento: null, telefone: null });
    expect(lido.destinatario).toEqual({ nome: "ENGENHARIA FICTICIA SERVICOS LTDA", documento: "11222333000181" });
    expect(lido.numero).toBe("07.20.26291.2345678-9");
    expect(lido.dataEmissao).toBeNull();
    expect(lido.valorTotal).toBe(456.78);
    expect(lido.formaPagamento).toBe("NAO_INFORMADA");
    expect(lido.parcelas).toEqual([{ vencimento: "2026-10-20", valor: 456.78 }]);
    expect(lido.itens.map((i) => [i.descricao, i.valorTotal, i.tipo, i.quantidade])).toEqual([
      ["IRPJ - SIMPLES NACIONAL", 25.12, "ENCARGO", null],
      ["CSLL - SIMPLES NACIONAL", 15.99, "ENCARGO", null],
      ["COFINS - SIMPLES NACIONAL", 58.47, "ENCARGO", null],
      ["PIS - SIMPLES NACIONAL", 12.67, "ENCARGO", null],
      ["INSS - SIMPLES NACIONAL", 194.13, "ENCARGO", null],
      ["ISS - SIMPLES NACIONAL", 150.4, "ENCARGO", null],
    ]);
    expect(lido.observacoes).toBeNull();
    expect(avisos(lido)).toEqual(["Data de emissão não encontrada — usada a data de hoje."]);
  });
});

describe.each(VARIANTES)("Recibo (%s)", (_nome, opcoes) => {
  it("pagador, valor, referente, data por extenso e quem recebeu", () => {
    const lido = ler(RECIBO, opcoes);
    expect(lido.tipo).toBe("RECIBO");
    expect(lido.legibilidade).toBe("BOA");
    expect(lido.emitente).toEqual({ nome: "JOSÉ DA SILVA PEREIRA", documento: "52998224725", telefone: "(11) 98888-7777" });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido.numero).toBe("042");
    expect(lido.dataEmissao).toBe("2026-10-10");
    expect(lido.valorTotal).toBe(1500);
    expect(lido.formaPagamento).toBe("PIX");
    expect(lido.itens).toEqual([
      {
        descricao:
          "mão de obra de assentamento de piso cerâmico na Obra Residencial Jardim, medição de 01/10/2026 a 10/10/2026",
        quantidade: null,
        unidade: null,
        valorUnitario: null,
        desconto: null,
        valorTotal: 1500,
        tipo: "SERVICO",
      },
    ]);
    expect(lido.observacoes).toBeNull();
    expect(avisos(lido)).toEqual([]);
  });

  it("só o valor por extenso: converte e avisa", () => {
    const lido = ler(
      RECIBO.replace("VALOR R$ 1.500,00\n", "").replace("a importância de R$ 1.500,00 (mil e", "a importância de (mil e"),
    );
    expect(lido.valorTotal).toBe(1500);
    expect(lido.observacoes).toMatch(/extenso/);
  });
});

describe("Não é documento", () => {
  it("texto sem valores nem identificação → NAO_E_DOCUMENTO", () => {
    const lido = ler(NAO_DOCUMENTO);
    expect(lido.tipo).toBe("NAO_E_DOCUMENTO");
    expect(normalizarLeitura(lido, HOJE).ok).toBe(false);
  });

  it("página vazia", () => {
    const lido = interpretarDocumento({ origem: "ocr-local", paginas: [], codigos: [], confiancaMedia: null });
    expect(lido.tipo).toBe("NAO_E_DOCUMENTO");
    expect(documentoLidoSchema.safeParse(lido).success).toBe(true);
  });
});

describe("Legibilidade", () => {
  it("OCR com confiança baixa → RUIM", () => {
    expect(ler(BOLETO, { confianca: 0.5 }).legibilidade).toBe("RUIM");
  });

  it("confiança média → PARCIAL", () => {
    expect(ler(BOLETO, { confianca: 0.7 }).legibilidade).toBe("PARCIAL");
  });

  it("camada de texto do PDF (sem confiança) → BOA", () => {
    expect(ler(BOLETO, { confianca: null, origem: "pdf-texto" }).legibilidade).toBe("BOA");
  });
});

describe("Comprovante genérico", () => {
  it("cupom não fiscal com total → OUTRO", () => {
    const lido = ler(`MADEIREIRA FICTICIA LTDA
CNPJ 11.222.333/0001-81
CUPOM NAO FISCAL - PEDIDO 991
Data: 12/10/2026
TABUA PINUS 30CM   10 x 25,00   250,00
TOTAL R$ 250,00
Pagamento: Cartão de Crédito`);
    expect(lido.tipo).toBe("OUTRO");
    expect(lido.valorTotal).toBe(250);
    expect(lido.emitente.documento).toBe("11222333000181");
    expect(lido.emitente.nome).toBe("MADEIREIRA FICTICIA LTDA");
    expect(lido.dataEmissao).toBe("2026-10-12");
    expect(lido.formaPagamento).toBe("CARTAO");
  });
});
