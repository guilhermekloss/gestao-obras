import { describe, expect, it } from "vitest";
import { encontrarAncoras } from "../comum";
import { construirDoc } from "../documento";
import { documentoDaChave, interpretarDanfe, lerLinhaProduto } from "../interpretes/danfe";
import { formatarReais } from "../normalizacao";
import { montarTexto } from "./auxiliar";
import { CHAVE_NFE, DANFE } from "./fixtures";

const doc = (texto: string) => construirDoc(montarTexto(texto));
function ler(texto: string) {
  const d = doc(texto);
  return interpretarDanfe(d, encontrarAncoras(d));
}
const trocar = (texto: string, de: string, para: string) => {
  expect(texto).toContain(de);
  return texto.replace(de, para);
};

describe("documentoDaChave", () => {
  const chaveCom = (doc14: string) => `352609${doc14}` + "55" + "001" + "000012345" + "1" + "87654321" + "8";

  it("devolve o CNPJ embutido quando é válido", () => {
    expect(documentoDaChave(CHAVE_NFE)).toBe("11222333000181");
  });

  it("produtor rural: '000' + CPF válido devolve o CPF", () => {
    expect(documentoDaChave(chaveCom("0005299822472" + "5"))).toBe("52998224725");
  });

  it("sem chave, CNPJ inválido ou CPF inválido: nada", () => {
    expect(documentoDaChave(null)).toBeNull();
    expect(documentoDaChave("")).toBeNull();
    expect(documentoDaChave(chaveCom("11222333000182"))).toBeNull();
    expect(documentoDaChave(chaveCom("00052998224726"))).toBeNull();
  });
});

describe("lerLinhaProduto: limites", () => {
  const NUMEROS = "20,0000 32,9000 658,00";
  const linha = (miolo: string, numeros = NUMEROS) => `000123 CIMENTO CP II ${miolo} ${numeros}`;

  it("lê código, descrição, NCM, CST, CFOP, unidade e números", () => {
    expect(lerLinhaProduto(linha("25232910 060 5405 SC"))).toEqual({
      codigo: "000123",
      descricao: "CIMENTO CP II",
      ncm: "25232910",
      cst: "060",
      cfop: "5405",
      unidade: "SC",
      numeros: ["20,0000", "32,9000", "658,00"],
      iDescricao: 1,
      iNcm: 4,
    });
  });

  it("NCM pontuado perde os pontos; '00' também é aceito", () => {
    expect(lerLinhaProduto(linha("2523.29.10 060 5405 SC"))?.ncm).toBe("25232910");
    expect(lerLinhaProduto(linha("00 060 5405 SC"))?.ncm).toBe("00");
    expect(lerLinhaProduto(linha("2523291 060 5405 SC"))).toBeNull();
    expect(lerLinhaProduto(linha("252329100 060 5405 SC"))).toBeNull();
  });

  it("CST de 2 a 4 dígitos", () => {
    for (const cst of ["60", "060", "0100"]) expect(lerLinhaProduto(linha(`25232910 ${cst} 5405 SC`))?.cst).toBe(cst);
    for (const cst of ["6", "01000", "ab"]) expect(lerLinhaProduto(linha(`25232910 ${cst} 5405 SC`))).toBeNull();
  });

  it("CFOP de 4 dígitos começando de 1 a 7", () => {
    for (const cfop of ["1102", "5405", "7949"]) expect(lerLinhaProduto(linha(`25232910 060 ${cfop} SC`))?.cfop).toBe(cfop);
    for (const cfop of ["0102", "8102", "540", "54050"]) expect(lerLinhaProduto(linha(`25232910 060 ${cfop} SC`))).toBeNull();
  });

  it("unidade: letra seguida de até 5 caracteres, devolvida em maiúsculas", () => {
    expect(lerLinhaProduto(linha("25232910 060 5405 sc"))?.unidade).toBe("SC");
    expect(lerLinhaProduto(linha("25232910 060 5405 M²"))?.unidade).toBe("M²");
    expect(lerLinhaProduto(linha("25232910 060 5405 CAIXA1"))?.unidade).toBe("CAIXA1");
    expect(lerLinhaProduto(linha("25232910 060 5405 CAIXA12"))).toBeNull();
    expect(lerLinhaProduto(linha("25232910 060 5405 3M"))).toBeNull();
  });

  it("exige ao menos 3 números, todos numéricos", () => {
    expect(lerLinhaProduto(linha("25232910 060 5405 SC", "20,0000 32,9000"))).toBeNull();
    expect(lerLinhaProduto(linha("25232910 060 5405 SC", "20,0000 32,9000 abc"))).toBeNull();
    expect(lerLinhaProduto(linha("25232910 060 5405 SC", "20,0000 32,9000 -5,00"))?.numeros).toHaveLength(3);
    expect(lerLinhaProduto(linha("25232910 060 5405 SC", "20 32,9000 658,00"))).toBeNull();
  });

  it("sem descrição, o código vale como descrição; com 8 campos já lê", () => {
    expect(lerLinhaProduto("000123 25232910 060 5405 SC 1,0000 2,0000 3,0000")).toMatchObject({
      descricao: "000123",
      iNcm: 1,
    });
    expect(lerLinhaProduto("000123 25232910 060 5405 SC 1,0000 2,0000")).toBeNull();
  });

  it("um número de 8 dígitos na descrição não é confundido com o NCM", () => {
    const l = lerLinhaProduto("000123 TUBO 12345678 MM 25232910 060 5405 SC 1,0000 2,0000 3,0000");
    expect(l).toMatchObject({ descricao: "TUBO 12345678 MM", ncm: "25232910", iNcm: 4 });
  });

  it("corrige letras do OCR nos campos numéricos", () => {
    expect(lerLinhaProduto(linha("2523291O O60 54O5 SC", "20,0000 32,9000 658,0O"))).toMatchObject({
      ncm: "25232910",
      cst: "060",
      cfop: "5405",
      numeros: ["20,0000", "32,9000", "658,00"],
    });
  });
});

describe("DANFE: itens", () => {
  const CABECALHO = "CÓDIGO PRODUTO DESCRIÇÃO DO PRODUTO / SERVIÇO NCM/SH O/CST CFOP UN QUANT VALOR UNIT VALOR TOTAL";
  const ITEM = "000123 CIMENTO CP II-F-32 50KG 25232910 060 5405 SC 20,0000 32,9000 658,00";
  const MAIS = "0,00 0,00 0,00 0,00 0,00";
  const tabela = (...linhas: string[]) => `DADOS DO PRODUTO / SERVIÇO\n${CABECALHO}\n${linhas.join("\n")}\nDADOS ADICIONAIS`;

  it("lê quantidade, unitário, total, unidade e tipo do item", () => {
    expect(ler(tabela(`${ITEM} ${MAIS}`)).lido.itens).toEqual([
      { descricao: "CIMENTO CP II-F-32 50KG", quantidade: 20, unidade: "SC", valorUnitario: 32.9, desconto: null, valorTotal: 658, tipo: "MATERIAL" },
    ]);
  });

  it("só lê itens dentro da tabela: antes do início e depois do fim, não", () => {
    const fora = `${ITEM} ${MAIS}`;
    const texto = `${fora}\n${tabela(`${ITEM} ${MAIS}`)}\n${fora}`;
    expect(ler(texto).lido.itens).toHaveLength(1);
  });

  it("depois de 'Dados adicionais' a tabela termina; uma nova 'Dados do produto' a reabre", () => {
    const texto = `${tabela(`${ITEM} ${MAIS}`)}\n${ITEM} ${MAIS}\nDADOS DO PRODUTO\n${ITEM} ${MAIS}`;
    expect(ler(texto).lido.itens).toHaveLength(2);
  });

  it.each(["CALCULO DO ISSQN", "INFORMAÇÕES COMPLEMENTARES", "RESERVADO AO FISCO"])("'%s' também encerra a tabela", (fim) => {
    expect(ler(`DADOS DO PRODUTO\n${ITEM} ${MAIS}\n${fim}\n${ITEM} ${MAIS}`).lido.itens).toHaveLength(1);
  });

  it("coluna de desconto: com o rótulo, o 4º número é o desconto do item", () => {
    const comColuna = `DADOS DO PRODUTO\n${CABECALHO} V. DESC.\n${ITEM} 58,00 0,00 0,00 0,00 0,00 0,00`;
    const [item] = ler(comColuna).lido.itens;
    expect(item).toMatchObject({ desconto: 58, valorTotal: 600 });
  });

  it("sem o rótulo, 6 ou mais números depois do total também indicam desconto", () => {
    const [item] = ler(`DADOS DO PRODUTO\n${CABECALHO}\n${ITEM} 58,00 0,00 0,00 0,00 0,00 0,00`).lido.itens;
    expect(item).toMatchObject({ desconto: 58, valorTotal: 600 });
    const [semDesconto] = ler(`DADOS DO PRODUTO\n${CABECALHO}\n${ITEM} 58,00 0,00 0,00 0,00 0,00`).lido.itens;
    expect(semDesconto).toMatchObject({ desconto: null, valorTotal: 658 });
  });

  it("desconto zerado não conta; a palavra 'descrição' não vira coluna de desconto", () => {
    const [item] = ler(`DADOS DO PRODUTO\n${CABECALHO} V. DESC.\n${ITEM} 0,00 0,00 0,00 0,00 0,00 0,00`).lido.itens;
    expect(item).toMatchObject({ desconto: null, valorTotal: 658 });
    const [outro] = ler(`DADOS DO PRODUTO\n${CABECALHO}\n${ITEM} 58,00 0,00 0,00 0,00 0,00`).lido.itens;
    expect(outro.desconto).toBeNull();
  });

  it("desconto nos itens dispensa o desconto geral do quadro de totais", () => {
    const base = trocar(DANFE, "VALOR DO FRETE  VALOR DO SEGURO  DESCONTO  OUTRAS DESPESAS  VALOR TOTAL IPI  V. TOTAL DA NOTA\n80,00           0,00             0,00", "VALOR DO FRETE  VALOR DO SEGURO  DESCONTO  OUTRAS DESPESAS  VALOR TOTAL IPI  V. TOTAL DA NOTA\n80,00           0,00             10,00");
    expect(ler(base).lido.descontoGeral).toBe(10);
    const comItem = trocar(base, "658,00 0,00 0,00 0,00 0,00 0,00", "658,00 50,00 0,00 0,00 0,00 0,00 0,00");
    expect(ler(comItem).lido.descontoGeral).toBeNull();
  });

  it("linha do item quebrada em duas (campos na linha de baixo) é juntada", () => {
    const quebrada = tabela("000123 CIMENTO CP II-F-32 50KG 25232910 060 5405 SC", `20,0000 32,9000 658,00 ${MAIS}`, `000789 AREIA 25051000 000 5102 M3 3,0000 120,0000 360,00 ${MAIS}`);
    expect(ler(quebrada).lido.itens.map((i) => [i.descricao, i.valorTotal])).toEqual([
      ["CIMENTO CP II-F-32 50KG", 658],
      ["AREIA", 360],
    ]);
  });

  it("linha que parece quebrada mas não fecha com a seguinte é ignorada", () => {
    const texto = tabela("000123 CIMENTO 25232910 060 5405 SC", "texto qualquer");
    expect(ler(texto).lido.itens).toEqual([]);
  });

  it("linha de continuação alinhada à descrição é anexada; fora da coluna, não", () => {
    const base = `${ITEM} ${MAIS}`;
    const alinhada = `${base}\n       RESISTENTE`;
    expect(ler(tabela(alinhada)).lido.itens[0].descricao).toBe("CIMENTO CP II-F-32 50KG RESISTENTE");
    const aEsquerda = `${base}\nRESISTENTE`;
    expect(ler(tabela(aEsquerda)).lido.itens[0].descricao).toBe("CIMENTO CP II-F-32 50KG");
    const aDireita = `${base}\n${" ".repeat(60)}RESISTENTE`;
    expect(ler(tabela(aDireita)).lido.itens[0].descricao).toBe("CIMENTO CP II-F-32 50KG");
  });

  it("várias linhas de continuação são acumuladas, e uma linha numérica encerra o item", () => {
    const base = `${ITEM} ${MAIS}`;
    const texto = tabela(base, "       PARTE UM", "       PARTE DOIS", "       1,00 2,00 3,00", "       DEPOIS");
    expect(ler(texto).lido.itens[0].descricao).toBe("CIMENTO CP II-F-32 50KG PARTE UM PARTE DOIS");
  });

  it("duas linhas numéricas não bastam para encerrar o item", () => {
    const texto = tabela(`${ITEM} ${MAIS}`, "       PARTE 1,00 2,00");
    expect(ler(texto).lido.itens[0].descricao).toBe("CIMENTO CP II-F-32 50KG PARTE 1,00 2,00");
  });

  it("linha só de rótulos entre itens não vira descrição", () => {
    const texto = tabela(`${ITEM} ${MAIS}`, "       VALOR UNIT   VALOR TOTAL");
    expect(ler(texto).lido.itens[0].descricao).toBe("CIMENTO CP II-F-32 50KG");
  });

  it("cabeçalho repetido no meio da tabela (folha seguinte) não vira descrição", () => {
    const texto = tabela(`${ITEM} ${MAIS}`, CABECALHO, `000789 AREIA 25051000 000 5102 M3 3,0000 120,0000 360,00 ${MAIS}`);
    expect(ler(texto).lido.itens.map((i) => i.descricao)).toEqual(["CIMENTO CP II-F-32 50KG", "AREIA"]);
  });

  it("avisos de itens: tabela sem itens, e sem tabela", () => {
    expect(ler(tabela("nada de produto aqui")).lido.observacoes).toBe("Itens não identificados na leitura; confira a tabela de produtos.");
    expect(ler("DANFE\nsem tabela nenhuma").lido.observacoes).toBe("Quadro de produtos não encontrado na leitura; confira os itens.");
  });
});

describe("DANFE: totais e conferências", () => {
  const com = (de: string, para: string) => trocar(DANFE, de, para);

  it("lê total da nota, frete e outras despesas (seguro + outras + IPI + ST + FCP + II)", () => {
    const lido = ler(DANFE).lido;
    expect(lido).toMatchObject({ valorTotal: 1675.5, valorFrete: 80, valorOutrasDespesas: null, descontoGeral: null });
    const comOutras = com("80,00           0,00             0,00      0,00             0,00             1.675,50", "80,00           1,00             0,00      2,00             3,00             1.681,50");
    expect(ler(comOutras).lido).toMatchObject({ valorFrete: 80, valorOutrasDespesas: 6, valorTotal: 1681.5 });
  });

  it("soma dos itens que difere do total dos produtos vira aviso; 1 centavo de diferença, não", () => {
    const soma = com("937,50                 168,75         0,00                     0,00                  1.595,50", "937,50                 168,75         0,00                     0,00                  1.600,50");
    const aviso = `A soma dos itens lidos (${formatarReais(1595.5)}) difere do total dos produtos impresso (${formatarReais(1600.5)}); alguma linha pode não ter sido lida.`;
    expect(ler(soma).lido.observacoes).toContain(aviso);
    const um = com("1.595,50", "1.595,51");
    expect(ler(um).lido.observacoes ?? "").not.toContain("A soma dos itens lidos");
  });

  it("totais que não fecham com o total da nota viram aviso; diferença de 2 centavos passa", () => {
    const aviso = "Os valores do quadro de totais não fecham com o total da nota; confira frete, impostos e desconto.";
    const nota = (v: string) => com("             1.675,50\nTRANSPORTADOR", `             ${v}\nTRANSPORTADOR`);
    expect(ler(nota("1.700,50")).lido.observacoes).toContain(aviso);
    expect(ler(nota("1.675,52")).lido.observacoes ?? "").not.toContain(aviso);
    expect(ler(nota("1.675,53")).lido.observacoes).toContain(aviso);
  });

  it("a conferência considera o desconto geral e as outras despesas", () => {
    const aviso = "Os valores do quadro de totais não fecham com o total da nota";
    const comDesconto = com("80,00           0,00             0,00      0,00             0,00             1.675,50", "80,00           0,00             20,00     0,00             0,00             1.655,50");
    expect(ler(comDesconto).lido.observacoes ?? "").not.toContain(aviso);
    const comOutras = com("80,00           0,00             0,00      0,00             0,00             1.675,50", "80,00           5,00             0,00      0,00             0,00             1.680,50");
    expect(ler(comOutras).lido.observacoes ?? "").not.toContain(aviso);
  });

  it("sem o quadro de totais, o total vem do 'valor total' das primeiras linhas", () => {
    const texto = "RECEBEMOS DE FORNECEDOR TESTE LTDA OS PRODUTOS\nVALOR TOTAL: R$ 321,00\nDANFE";
    expect(ler(texto).lido.valorTotal).toBe(321);
  });
});

describe("DANFE: folhas", () => {
  it("todas as folhas lidas: completo; folha faltando: incompleto, com o aviso", () => {
    const completo = DANFE.replace("FOLHA 1/1", "FOLHA 1/2\nFOLHA 2/2");
    expect(ler(completo).incompleto).toBe(false);
    expect(ler(completo).lido.observacoes ?? "").not.toContain("folhas");
    const faltando = ler(DANFE.replace("FOLHA 1/1", "FOLHA 1/3\nFL. 2/3"));
    expect(faltando.incompleto).toBe(true);
    expect(faltando.lido.observacoes).toContain("O DANFE tem 3 folhas e só 2 foi(ram) lida(s); itens podem estar faltando.");
  });

  it("a mesma folha repetida não conta duas vezes", () => {
    const r = ler(DANFE.replace("FOLHA 1/1", "FOLHA 1/2\nFOLHA 1/2"));
    expect(r.incompleto).toBe(true);
    expect(r.lido.observacoes).toContain("só 1 foi(ram)");
  });

  it("sem indicação de folha, está completo", () => {
    expect(ler(DANFE.replace("FOLHA 1/1", "")).incompleto).toBe(false);
  });
});

describe("DANFE: emitente, número e série", () => {
  it("nome do emitente pelo canhoto, mesmo quebrado em duas linhas e com acento", () => {
    const texto = "RECEBEMOS DE INDÚSTRIA E COMÉRCIO\nDE TIJOLOS LTDA OS PRODUTOS E/OU SERVIÇOS\nDANFE";
    expect(ler(texto).lido.emitente.nome).toBe("INDÚSTRIA E COMÉRCIO DE TIJOLOS LTDA");
  });

  it("o canhoto só vale nas 4 primeiras linhas", () => {
    const texto = "A\nB\nC\nD\nRECEBEMOS DE FORNECEDOR TESTE LTDA OS PRODUTOS";
    expect(ler(texto).lido.emitente.nome).not.toBe("FORNECEDOR TESTE LTDA");
  });

  it("sem canhoto, o nome vem do topo: primeira célula com 2+ palavras e letras suficientes", () => {
    const sem = DANFE.split("\n").slice(3).join("\n");
    expect(ler(sem).lido.emitente.nome).toBe("DEPOSITO DE MATERIAIS FICTICIOS LTDA");
  });

  it.each([
    ["linha de rótulos do cabeçalho", "DANFE DOCUMENTO AUXILIAR   X"],
    ["uma palavra só", "CONSTRUTORA"],
    ["poucas letras", "AB CD E"],
    ["muitos dígitos", "RUA ALFA 12345 67890 11111"],
    ["rótulo de NF", "NOTA FISCAL ELETRONICA TESTE"],
    ["chave", "CHAVE DE ACESSO FORNECEDOR"],
    ["número", "Nº 123 FORNECEDOR TESTE"],
    ["série", "SERIE 1 FORNECEDOR TESTE"],
    ["folha", "FOLHA 1 FORNECEDOR TESTE"],
    ["entrada", "ENTRADA FORNECEDOR TESTE"],
    ["saída", "SAIDA FORNECEDOR TESTE"],
  ])("topo: %s não é o nome do emitente", (_motivo, linhaRuim) => {
    const texto = `${linhaRuim}\nFORNECEDOR REAL EXEMPLO LTDA\nDESTINATARIO / REMETENTE`;
    expect(ler(texto).lido.emitente.nome).toBe("FORNECEDOR REAL EXEMPLO LTDA");
  });

  it("topo: letras e dígitos no limite (6 letras; dígitos até 1/4 das letras)", () => {
    expect(ler("ABCD EF\nDESTINATARIO / REMETENTE").lido.emitente.nome).toBe("ABCD EF");
    expect(ler("ABCD E\nDESTINATARIO / REMETENTE").lido.emitente.nome).toBeNull();
    expect(ler("ABCDEFGH IJKL 12345\nDESTINATARIO / REMETENTE").lido.emitente.nome).toBeNull();
    expect(ler("ABCDEFGH IJKL 123\nDESTINATARIO / REMETENTE").lido.emitente.nome).toBe("ABCDEFGH IJKL 123");
  });

  it("topo: só a primeira célula da linha e só antes do bloco do destinatário", () => {
    expect(ler("FORNECEDOR TESTE LTDA          Av. Central 100\nDESTINATARIO / REMETENTE").lido.emitente.nome).toBe("FORNECEDOR TESTE LTDA");
    expect(ler("DESTINATARIO / REMETENTE\nFORNECEDOR TESTE LTDA").lido.emitente.nome).toBeNull();
  });

  it("topo: linha de recebimento não conta", () => {
    for (const linha of ["DATA DE RECEBIMENTO ASSINATURA TESTE", "IDENTIFICACAO E ASSINATURA DO RECEBEDOR", "ELETRONICA INDICADA AO LADO TESTE", "IDENTIFICACAO DO EMITENTE FORNECEDOR"]) {
      expect(ler(`${linha}\nDESTINATARIO / REMETENTE`).lido.emitente.nome).toBeNull();
    }
  });

  it.each([
    ["NF-e Nº 000.012.345 SÉRIE 001", "000.012.345", "001"],
    ["Nº 000.012.345", "000.012.345", null],
    ["Nº: 12345 SÉRIE: 2", "12345", "2"],
    ["N° 99 SERIE 12", "99", "12"],
    ["N. 000.012.345 SERIE 1", "000.012.345", "1"],
    ["No 77", "77", null],
    ["DANFE Nº 555555555 SÉRIE 999", "555555555", "999"],
    ["SERIE 1234", null, null],
    ["N. 55", null, null],
  ])("número e série em '%s'", (linha, numero, serie) => {
    const lido = ler(`${linha}\nDESTINATARIO / REMETENTE`).lido;
    expect([lido.numero, lido.serie]).toEqual([numero, serie]);
  });

  it("número e série podem estar em linhas diferentes, e vale o primeiro de cada", () => {
    const lido = ler("Nº 11\nSÉRIE 3\nNº 22\nSÉRIE 4\nDESTINATARIO / REMETENTE").lido;
    expect([lido.numero, lido.serie]).toEqual(["11", "3"]);
  });

  it("só olha as linhas do topo", () => {
    const lido = ler(`${"x\n".repeat(20)}Nº 11 SÉRIE 3`).lido;
    expect([lido.numero, lido.serie]).toEqual([null, null]);
  });
});

describe("DANFE: blocos e âncoras", () => {
  const com = (de: string, para: string) => trocar(DANFE, de, para);
  const DEST = "DESTINATÁRIO / REMETENTE";

  it("destinatário: nome, documento e data de emissão do bloco", () => {
    const lido = ler(DANFE).lido;
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido.dataEmissao).toBe("2026-09-15");
    expect(lido.emitente.telefone).toBe("(11) 3333-4444");
  });

  it("'Destinatário' sozinho no começo da linha também abre o bloco; com dois-pontos, não", () => {
    expect(ler(com(DEST, "DESTINATÁRIO")).lido.destinatario.nome).toBe("CONSTRUTORA EXEMPLO LTDA");
    expect(ler(com(DEST, "DESTINATÁRIO: X")).lido.destinatario).toEqual({ nome: null, documento: null });
    expect(ler(com(DEST, "XYZ")).lido.destinatario).toEqual({ nome: null, documento: null });
  });

  it("a data de emissão do bloco do destinatário vence a do canhoto; sem bloco, vale a primeira com rótulo", () => {
    const canhoto = com("EMISSÃO: 15/09/2026", "EMISSÃO: 14/09/2026");
    expect(ler(canhoto).lido.dataEmissao).toBe("2026-09-15");
    expect(ler(trocar(canhoto, DEST, "XYZ")).lido.dataEmissao).toBe("2026-09-14");
  });

  it("sem data com rótulo, usa a primeira data do texto que cai no mês da chave", () => {
    const mini = [
      "RECEBEMOS DE FORNECEDOR TESTE LTDA OS PRODUTOS",
      "3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218",
      "Vencimento em 10/10/2026 e antes disso 20/08/2026",
      "Emitido em 20/09/2026 e 21/09/2026",
    ].join("\n");
    expect(ler(mini).lido.dataEmissao).toBe("2026-09-20");
    expect(ler(mini.replace("20/09/2026 e 21/09/2026", "20/10/2026")).lido.dataEmissao).toBeNull();
    expect(ler(mini.replace("3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218", "")).lido.dataEmissao).toBeNull();
  });

  it("documento do destinatário sem rótulo vem do primeiro documento válido do bloco", () => {
    const semRotulo = com("NOME / RAZÃO SOCIAL                             CNPJ / CPF            DATA DA EMISSÃO", "NOME / RAZÃO SOCIAL                                                   DATA DA EMISSÃO");
    expect(ler(semRotulo).lido.destinatario.documento).toBe("98765432000198");
  });

  it("total da nota: sem o rótulo no quadro, usa o 'valor total' das primeiras linhas", () => {
    expect(ler(com("V. TOTAL DA NOTA", "XXXX")).lido.valorTotal).toBe(1675.5);
    expect(ler(com("V. TOTAL DA NOTA", "XXXX")).lido.valorFrete).toBe(80);
  });

  it("fatura: parcelas e forma de pagamento; a palavra 'fatura' antes do destinatário não conta", () => {
    expect(ler(DANFE).lido.parcelas).toEqual([
      { vencimento: "2026-10-15", valor: 837.75 },
      { vencimento: "2026-11-14", valor: 837.75 },
    ]);
    expect(ler(DANFE).lido.formaPagamento).toBe("BOLETO");
    const semFatura = com("FATURA / DUPLICATA", "XYZ");
    expect(ler(semFatura).lido.parcelas).toEqual([]);
    const antes = `FATURA\n${semFatura}`;
    expect(ler(antes).lido.parcelas).toEqual([]);
  });

  it("forma de pagamento: do texto da fatura ou das informações adicionais", () => {
    const semBoleto = com("PAGAMENTO VIA BOLETO BANCARIO. PEDIDO 4471.", "PEDIDO 4471.");
    expect(ler(semBoleto).lido.formaPagamento).toBe("NAO_INFORMADA");
    expect(ler(com("PAGAMENTO VIA BOLETO BANCARIO.", "PAGAMENTO VIA PIX.")).lido.formaPagamento).toBe("PIX");
    expect(ler(semBoleto.replace("Valor R$ 837,75   Num. 002", "PIX Valor R$ 837,75   Num. 002")).lido.formaPagamento).toBe("PIX");
  });

  it("fatura sem as seções seguintes lê no máximo as 6 linhas depois dela", () => {
    const mini = ["DESTINATARIO / REMETENTE", "FATURA", "Venc. 10/10/2026 Valor R$ 10,00", "Venc. 11/11/2026 Valor R$ 20,00", "x", "x", "x", "x", "Venc. 12/12/2026 Valor R$ 30,00"].join("\n");
    expect(ler(mini).lido.parcelas.map((p) => p.valor)).toEqual([10, 20]);
  });

  it("marcas do documento viram observação, junto com os demais avisos", () => {
    const lido = ler(DANFE.replace("FOLHA 1/1", "FOLHA 1/2\nSEM VALOR FISCAL\nNF-E CANCELADA\nDANFE EM CONTINGENCIA")).lido;
    expect(lido.observacoes).toBe(
      'O documento indica "sem valor fiscal" (homologação). O documento indica nota cancelada. Nota emitida em contingência: confira a autorização. O DANFE tem 2 folhas e só 1 foi(ram) lida(s); itens podem estar faltando.',
    );
  });
});

describe("DANFE: documento do emitente", () => {
  const texto = ["FORNECEDOR TESTE LTDA", "CNPJ", "98.765.432/0001-98", "DESTINATARIO / REMETENTE"].join("\n");
  const VALIDO_A = "98765432000198";
  const VALIDO_B = "45678901000175";
  const doc14 = (valor: string, linha: number, valido = true) => ({ valor, linha, valido }) as never;
  function emitente(documentos: unknown[], chave: string | null, t = texto) {
    const d = doc(t);
    return interpretarDanfe(d, { ...encontrarAncoras(d), chave, chaveInvalida: null, documentos: documentos as never }).lido.emitente.documento;
  }

  it("o CNPJ da chave vence quando aparece no topo do texto", () => {
    expect(emitente([doc14("11222333000181", 1)], CHAVE_NFE)).toBe("11222333000181");
  });

  it("o CNPJ da chave não aparece no topo: vale o CNPJ rotulado, se válido", () => {
    expect(emitente([doc14(VALIDO_B, 1)], CHAVE_NFE)).toBe(VALIDO_A);
    expect(emitente([doc14("11222333000181", 3)], CHAVE_NFE)).toBe(VALIDO_A);
  });

  it("sem rótulo válido, o da chave", () => {
    const semRotulo = ["FORNECEDOR TESTE LTDA", "DESTINATARIO / REMETENTE"].join("\n");
    expect(emitente([doc14(VALIDO_B, 0)], CHAVE_NFE, semRotulo)).toBe("11222333000181");
    const invalido = ["FORNECEDOR TESTE LTDA", "CNPJ", "98.765.432/0001-99", "DESTINATARIO / REMETENTE"].join("\n");
    expect(emitente([], CHAVE_NFE, invalido)).toBe("11222333000181");
  });

  it("sem chave: o rotulado (mesmo inválido), senão o primeiro válido do topo, senão o primeiro", () => {
    const invalido = ["FORNECEDOR TESTE LTDA", "CNPJ", "98.765.432/0001-99", "DESTINATARIO / REMETENTE"].join("\n");
    expect(emitente([doc14(VALIDO_B, 0)], null, invalido)).toBe("98765432000199");
    const semRotulo = ["FORNECEDOR TESTE LTDA", "DESTINATARIO / REMETENTE"].join("\n");
    expect(emitente([doc14("1", 0, false), doc14(VALIDO_B, 0)], null, semRotulo)).toBe(VALIDO_B);
    expect(emitente([doc14("1", 0, false), doc14("2", 0, false)], null, semRotulo)).toBe("1");
    expect(emitente([], null, semRotulo)).toBeNull();
  });

  it("documentos depois do topo não são candidatos", () => {
    const semRotulo = ["FORNECEDOR TESTE LTDA", "DESTINATARIO / REMETENTE", "x"].join("\n");
    expect(emitente([doc14(VALIDO_B, 1), doc14("9", 2)], null, semRotulo)).toBeNull();
  });
});
