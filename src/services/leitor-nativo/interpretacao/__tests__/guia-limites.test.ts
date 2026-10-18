import { describe, expect, it } from "vitest";
import { encontrarAncoras, type Ancoras } from "../comum";
import { construirDoc } from "../documento";
import { interpretarGuia } from "../interpretes/guia";
import { formatarReais } from "../normalizacao";
import { montarTexto } from "./auxiliar";
import { DAS } from "./fixtures";

const doc = (texto: string) => construirDoc(montarTexto(texto));
const FILLER = "ALFA BRAVO CHARLIE DELTA ECO FOXTROT GOLF HOTEL INDIA JULIETT";

function ler(texto: string, tipo: "GUIA" | "OUTRO" = "GUIA", extra: Partial<Ancoras> = {}) {
  const d = doc(texto);
  return interpretarGuia(d, { ...encontrarAncoras(d), ...extra }, tipo).lido;
}
const arrecadacao = (valor: number | undefined) => ({ tipo: "ARRECADACAO", arrecadacao: { valor } }) as unknown as Ancoras["pagamento"];

describe("guia: órgão impresso", () => {
  it.each([
    ["Documento de Arrecadação do Simples Nacional", "Simples Nacional"],
    ["Documento  de  Arrecadação  do  Simples  Nacional", "Simples Nacional"],
    ["DAS-MEI", "Simples Nacional"],
    ["DAS - MEI", "Simples Nacional"],
    ["DAS MEI", "Simples Nacional"],
    ["DAS DE MEI", "Simples Nacional"],
    ["DAS  -  DE  MEI", "Simples Nacional"],
    ["MINISTERIO DA FAZENDA RECEITA FEDERAL DO BRASIL", "Receita Federal do Brasil"],
    ["Receita  Federal  do  Brasil", "Receita Federal do Brasil"],
    ["RECEITAS FEDERAIS", "Receita Federal"],
    ["Receitas  Federais", "Receita Federal"],
    ["RECEITA FEDERAL", "Receita Federal"],
    ["Receita  Federal", "Receita Federal"],
    ["Guia do FGTS", "FGTS"],
    ["Portal eSocial", "eSocial"],
    ["PREVIDENCIA SOCIAL", "Previdência Social (INSS)"],
    ["Previdência  Social", "Previdência Social (INSS)"],
  ])("%s → %s", (marca, orgao) => {
    expect(ler(`${marca}\n${FILLER}`).emitente.nome).toBe(orgao);
  });

  it("vale a primeira regra da lista quando o texto cita mais de um órgão", () => {
    expect(ler("DAS MEI\nRECEITA FEDERAL DO BRASIL\nFGTS").emitente.nome).toBe("Simples Nacional");
    expect(ler("RECEITA FEDERAL DO BRASIL\nFGTS").emitente.nome).toBe("Receita Federal do Brasil");
    expect(ler("RECEITAS FEDERAIS\nFGTS").emitente.nome).toBe("Receita Federal");
    expect(ler("FGTS\nESOCIAL").emitente.nome).toBe("FGTS");
    expect(ler("ESOCIAL\nPREVIDENCIA SOCIAL").emitente.nome).toBe("eSocial");
    expect(ler("PREVIDENCIA SOCIAL\nPREFEITURA DE CURITIBA").emitente.nome).toBe("Previdência Social (INSS)");
  });

  it.each([
    ["PREFEITURA MUNICIPAL DE CURITIBA", "PREFEITURA MUNICIPAL DE CURITIBA"],
    ["Secretaria Municipal da Fazenda", "Secretaria Municipal da Fazenda"],
    ["Secretaria Municipal de Fazenda", "Secretaria Municipal de Fazenda"],
    ["Secretaria da Fazenda", "Secretaria da Fazenda"],
    ["Secretaria de Fazenda", "Secretaria de Fazenda"],
    ["Governo do Estado de São Paulo", "Governo do Estado de São Paulo"],
    ["DETRAN SP", "DETRAN SP"],
  ])("órgão público '%s' vira o nome do emitente", (linha, nome) => {
    expect(ler(`${FILLER}\n${linha}\n${FILLER}`).emitente.nome).toBe(nome);
  });

  it("do órgão público, fica só o texto antes do primeiro vão", () => {
    expect(ler("PREFEITURA DE CURITIBA      Guia 123\nOUTRA PREFEITURA").emitente.nome).toBe("PREFEITURA DE CURITIBA");
  });

  it("escolhe a primeira linha que cita um órgão público", () => {
    expect(ler("DETRAN SP\nPREFEITURA DE CURITIBA").emitente.nome).toBe("DETRAN SP");
  });

  it("variações com espaços repetidos entre as palavras ainda são reconhecidas", () => {
    expect(ler("Secretaria  Municipal  da  Fazenda").emitente.nome).toBe("Secretaria");
    expect(ler("Secretaria  da  Fazenda").emitente.nome).toBe("Secretaria");
    expect(ler("Secretaria Municipal  da  Fazenda").emitente.nome).toBe("Secretaria Municipal");
    expect(ler("Secretaria Municipal da  Fazenda").emitente.nome).toBe("Secretaria Municipal da");
  });

  it("sem nenhum órgão conhecido, o emitente fica vazio", () => {
    expect(ler(`SIMPLES NACIONAL\n${FILLER}`).emitente.nome).toBeNull();
  });
});

describe("guia: composição do documento", () => {
  const item = (descricao: string, valorTotal: number) => ({
    descricao,
    quantidade: null,
    unidade: null,
    valorUnitario: null,
    desconto: null,
    valorTotal,
    tipo: "ENCARGO",
  });

  it("lê código, descrição e total de cada encargo", () => {
    const texto = `Guia\nComposição do Documento de Arrecadação\n1001   IRPJ - SIMPLES NACIONAL   25,12   -   -   25,12\n1002   CSLL   1.234,56   –   –   1.234,56\nTotais   1.259,68`;
    expect(ler(texto).itens).toEqual([item("IRPJ - SIMPLES NACIONAL", 25.12), item("CSLL", 1234.56)]);
  });

  it.each(["Composição do Documento", "Composição  do  Documento", "Código Denominação", "Código  Denominação", "Código da Receita Denominação", "Código  da  Receita  Denominação"])(
    "cabeçalho '%s' abre a tabela",
    (cabecalho) => {
      expect(ler(`Guia\n${cabecalho}\n1001   ITEM   5,00   5,00`).itens).toEqual([item("ITEM", 5)]);
    },
  );

  it("sem cabeçalho, linhas que parecem encargo não são lidas", () => {
    expect(ler("Guia\n1001   ITEM   5,00   5,00\n1002   OUTRO   6,00   6,00").itens).toEqual([]);
  });

  it("cabeçalho na segunda linha e linhas anteriores ao cabeçalho ficam de fora", () => {
    const texto = `1000   ANTES   1,00   1,00\nCódigo Denominação\n1001   ITEM   5,00   5,00`;
    expect(ler(texto).itens).toEqual([item("ITEM", 5)]);
    expect(ler(`Guia\nComposição do Documento\n1001   ITEM   5,00   5,00`).itens).toEqual([item("ITEM", 5)]);
  });

  it("para na linha de totais, mesmo sem itens antes", () => {
    expect(ler("Guia\nCódigo Denominação\nTotais   1,00\n1099   EXTRA   1,00   1,00").itens).toEqual([]);
    expect(ler("Guia\nCódigo Denominação\n1001   ITEM   5,00   5,00\nTotal   5,00\n1099   EXTRA   1,00   1,00").itens).toEqual([item("ITEM", 5)]);
  });

  it("uma tabela que vai até o fim do texto é lida inteira", () => {
    expect(ler("Guia\nCódigo Denominação\n1001   ITEM   5,00   5,00\n1002   OUTRO   6,00   6,00").itens).toEqual([item("ITEM", 5), item("OUTRO", 6)]);
  });

  it("linhas de cabeçalho repetidas no meio da tabela são puladas", () => {
    const texto = `Guia\nCódigo Denominação\n1001   ITEM   5,00   5,00\nCódigo Denominação   Principal   Multa\nPrincipal Multa Juros Total\n1002   OUTRO   6,00   6,00`;
    expect(ler(texto).itens).toEqual([item("ITEM", 5), item("OUTRO", 6)]);
    expect(ler(`Guia\nCódigo  Denominação\n1001   ITEM   5,00   5,00\nCódigo  Denominação   Principal\n1002   OUTRO   6,00   6,00`).itens).toHaveLength(2);
    expect(ler(`Guia\nCódigo Denominação\n1001   ITEM   5,00   5,00\nPrincipal  Multa  Juros\n1002   OUTRO   6,00   6,00`).itens).toHaveLength(2);
  });

  it("texto solto antes da primeira linha é ignorado; depois da última, encerra a tabela", () => {
    expect(ler("Guia\nCódigo Denominação\nObservação qualquer\n1001   ITEM   5,00   5,00").itens).toEqual([item("ITEM", 5)]);
    expect(ler("Guia\nCódigo Denominação\n1001   ITEM   5,00   5,00\nObservação qualquer\n1002   OUTRO   6,00   6,00").itens).toEqual([item("ITEM", 5)]);
  });

  it("só código de exatamente 4 dígitos abre uma linha", () => {
    const texto = `Guia\nCódigo Denominação\n12345   LONGO   1,00   1,00\n1234X   LETRA   2,00   2,00\nA1234   PREFIXO   3,00   3,00\n123   CURTO   4,00   4,00\n1001   ITEM   5,00   5,00`;
    expect(ler(texto).itens).toEqual([item("ITEM", 5)]);
  });

  it("valor só é valor com vírgula e dois decimais; traço sozinho também", () => {
    const texto = `Guia\nCódigo Denominação\n1001   COD 12,345   7,00   7,00\n1002   COD A12,34   8,00   8,00\n1003   PIS-COFINS-   9,00   9,00\n1004   -ABC   10,00   10,00`;
    expect(ler(texto).itens).toEqual([
      item("COD 12,345", 7),
      item("COD A12,34", 8),
      item("PIS-COFINS-", 9),
      item("-ABC", 10),
    ]);
  });

  it("linha sem descrição ou sem total é descartada, e a seguinte continua valendo", () => {
    const texto = `Guia\nCódigo Denominação\n1001   5,00   5,00\n1002   SEM TOTAL   5,00   -\n1003   COM TOTAL   6,00   6,00`;
    expect(ler(texto).itens).toEqual([item("COM TOTAL", 6)]);
  });

  it("coluna Principal em branco ('-') não deixa traço na descrição nem derruba o total", () => {
    const itens = ler(`Guia\nCódigo Denominação\n1004   COFINS - SIMPLES NACIONAL   -   5,00   -   5,00`).itens;
    expect(itens).toEqual([item("COFINS - SIMPLES NACIONAL", 5)]);
  });

  it("traço separador antes dos valores sai da descrição; descrição que só tem traço é mantida", () => {
    expect(ler(`Guia\nCódigo Denominação\n1004   IRPJ -   25,12   25,12`).itens).toEqual([item("IRPJ", 25.12)]);
    expect(ler(`Guia\nCódigo Denominação\n1004   -   5,00   5,00`).itens).toEqual([item("-", 5)]);
  });

  it("DAS completo: seis encargos", () => {
    expect(ler(DAS).itens.map((i) => i.valorTotal)).toEqual([25.12, 15.99, 58.47, 12.67, 194.13, 150.4]);
  });
});

describe("guia: valor, vencimento e identificação", () => {
  const COM_VALOR = (valor: string) => `Guia\nPagar este documento até  20/10/2026   Valor Total do Documento  ${valor}`;

  it("o valor do código de barras vale mais que o impresso, e a diferença vira observação", () => {
    const lido = ler(COM_VALOR("456,78"), "GUIA", { pagamento: arrecadacao(500) });
    expect(lido.valorTotal).toBe(500);
    expect(lido.observacoes).toBe(
      `O valor impresso (${formatarReais(456.78)}) difere do valor do código de barras (${formatarReais(500)}); foi usado o do código.`,
    );
  });

  it("valores iguais, ou diferentes em até meio centavo, não geram observação", () => {
    expect(ler(COM_VALOR("456,78"), "GUIA", { pagamento: arrecadacao(456.78) }).observacoes).toBeNull();
    expect(ler(COM_VALOR("456,78"), "GUIA", { pagamento: arrecadacao(456.784) }).observacoes).toBeNull();
    expect(ler(COM_VALOR("456,78"), "GUIA", { pagamento: arrecadacao(456.79) }).observacoes).not.toBeNull();
  });

  it("código sem valor, ou sem valor impresso, não gera comparação", () => {
    expect(ler(COM_VALOR("456,78"), "GUIA", { pagamento: arrecadacao(undefined) })).toMatchObject({ valorTotal: 456.78, observacoes: null });
    expect(ler("Guia\nPagar este documento até  20/10/2026", "GUIA", { pagamento: arrecadacao(300) })).toMatchObject({
      valorTotal: 300,
      observacoes: null,
    });
  });

  it("sem o código de barras, vale o valor impresso e vem um aviso", () => {
    const lido = ler(COM_VALOR("456,78"));
    expect(lido.valorTotal).toBe(456.78);
    expect(lido.observacoes).toBe("Código de barras da guia não lido com segurança; o valor veio do texto impresso — confira.");
  });

  it("valor impresso zerado não vale", () => {
    expect(ler(COM_VALOR("0,00")).valorTotal).toBeNull();
  });

  it("o vencimento vem de 'Pagar este documento até', ou do rótulo de vencimento", () => {
    expect(ler(COM_VALOR("456,78")).parcelas).toEqual([{ vencimento: "2026-10-20", valor: 456.78 }]);
    expect(ler("Guia\nData de Vencimento  15/11/2026\nValor Total do Documento  100,00").parcelas).toEqual([{ vencimento: "2026-11-15", valor: 100 }]);
    expect(ler("Guia\nVencimento  16/11/2026\nValor Total do Documento  100,00").parcelas).toEqual([{ vencimento: "2026-11-16", valor: 100 }]);
  });

  it("'Pagar até' vence o vencimento; sem valor ou sem data, não há parcela", () => {
    expect(ler("Guia\nPagar este documento até  20/10/2026\nData de Vencimento  15/11/2026\nValor Total do Documento  100,00").parcelas[0].vencimento).toBe("2026-10-20");
    expect(ler("Guia\nPagar este documento até  20/10/2026").parcelas).toEqual([]);
    expect(ler("Guia\nValor Total do Documento  100,00").parcelas).toEqual([]);
  });

  it("o valor impresso vem do primeiro rótulo que existir, na ordem de prioridade", () => {
    expect(ler("Guia\nValor Total do Documento  10,00\nValor Cobrado  20,00\nValor a Pagar  30,00").valorTotal).toBe(10);
    expect(ler("Guia\nValor Cobrado  20,00\nValor a Pagar  30,00").valorTotal).toBe(20);
    expect(ler("Guia\nValor a Pagar  30,00").valorTotal).toBe(30);
    expect(ler("Guia\nValor Total  40,00").valorTotal).toBe(40);
  });

  it("data de emissão e número do documento", () => {
    const lido = ler("Guia\nData de Emissão  05/10/2026\nNúmero do Documento  07.20.26291.2345678-9");
    expect(lido.dataEmissao).toBe("2026-10-05");
    expect(lido.numero).toBe("07.20.26291.2345678-9");
    expect(ler("Guia\nNúmero  4455").numero).toBe("4455");
  });

  it("contribuinte: documento do rótulo, senão o primeiro documento válido do texto; nome pelo rótulo", () => {
    const lido = ler(DAS);
    expect(lido.destinatario).toEqual({ nome: "ENGENHARIA FICTICIA SERVICOS LTDA", documento: "11222333000181" });
    const semRotulo = ler(`Guia\nContribuinte  ZE DA SILVA\n${FILLER}\n11.222.333/0001-81`);
    expect(semRotulo.destinatario.documento).toBe("11222333000181");
    expect(semRotulo.destinatario.nome).toBe("ZE DA SILVA");
    expect(ler(`Guia\n${FILLER}`).destinatario).toEqual({ nome: null, documento: null });
  });

  it("documento inválido no texto não é usado como contribuinte", () => {
    expect(ler(`Guia\n${FILLER}\n11.222.333/0001-82`).destinatario.documento).toBeNull();
  });
});

describe("guia: tipo OUTRO (boleto genérico)", () => {
  it("emitente é a primeira linha com pelo menos 4 letras, cortada no primeiro vão", () => {
    const lido = ler("12/10/2026 R$ 10,00\nABC 123\nLOJA DO ZE LTDA      Av. Central 100\nOutra Linha", "OUTRO");
    expect(lido.emitente.nome).toBe("LOJA DO ZE LTDA");
    expect(ler("ABCD", "OUTRO").emitente.nome).toBe("ABCD");
    expect(ler("ÀÉíú 12", "OUTRO").emitente.nome).toBe("ÀÉíú 12");
    expect(ler("ABC 123\n---", "OUTRO").emitente.nome).toBeNull();
  });

  it("documento do emitente é o primeiro válido; forma de pagamento é boleto; não lê composição nem contribuinte", () => {
    const lido = ler(`Loja Exemplo\n11.222.333/0001-81\nCódigo Denominação\n1001   ITEM   5,00   5,00\nContribuinte  ZE`, "OUTRO");
    expect(lido.emitente.documento).toBe("11222333000181");
    expect(lido.formaPagamento).toBe("BOLETO");
    expect(lido.itens).toEqual([]);
    expect(lido.destinatario).toEqual({ nome: null, documento: null });
    expect(ler("Loja Exemplo", "OUTRO").emitente.documento).toBeNull();
  });

  it("a guia de tipo GUIA não marca forma de pagamento", () => {
    expect(ler("Guia\nPagar este documento até 20/10/2026").formaPagamento).toBe("NAO_INFORMADA");
  });

  it("tipo padrão é GUIA", () => {
    const d = doc("Guia do FGTS");
    expect(interpretarGuia(d, encontrarAncoras(d)).lido.tipo).toBe("GUIA");
    expect(interpretarGuia(d, encontrarAncoras(d), "OUTRO").lido.tipo).toBe("OUTRO");
  });
});
