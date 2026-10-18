import { describe, expect, it } from "vitest";
import { construirDoc } from "../documento";
import { buscarRotulo, coberturaRotulos, dataDe, documentoDe, numeroDe, textoDe, unidadesDaLinha, valorDe } from "../rotulos";
import { montarTexto, type OpcoesTexto } from "./auxiliar";

const doc = (texto: string | string[], opcoes: OpcoesTexto = {}) => construirDoc(montarTexto(texto, opcoes));
const SEM_POSICAO: OpcoesTexto = { posicoes: false };

// Linha de valores alinhada embaixo dos rótulos (cada valor começa na coluna do seu rótulo).
function embaixo(cabecalho: string, porRotulo: Record<string, string>): string {
  let linha = "";
  for (const [rotulo, valor] of Object.entries(porRotulo)) {
    const col = cabecalho.indexOf(rotulo);
    expect(col).toBeGreaterThanOrEqual(0);
    linha = linha.padEnd(col) + valor;
  }
  return linha;
}

describe("valor na mesma linha do rótulo", () => {
  it.each([
    ["Valor Total R$ 10,00", 10],
    ["Valor Total: R$ 10,00", 10],
    ["Valor Total = 10,00", 10],
    ["Valor Total   :=  10,00", 10],
    ["Valor Total 1.234,56 reais", 1234.56],
  ])("'%s' → %s", (texto, valor) => {
    expect(valorDe(doc(texto), ["VALOR_TOTAL"])).toBe(valor);
  });

  it("traço no lugar do valor vale zero", () => {
    expect(valorDe(doc("Valor Total  -"), ["VALOR_TOTAL"])).toBe(0);
    expect(valorDe(doc("Valor Total: –"), ["VALOR_TOTAL"])).toBe(0);
    expect(valorDe(doc("Valor Total  -  10,00"), ["VALOR_TOTAL"])).toBe(0);
    expect(valorDe(doc("Valor Total - 10,00"), ["VALOR_TOTAL"])).toBe(-10);
  });

  it("sem valor depois do rótulo, nada", () => {
    expect(valorDe(doc("Valor Total"), ["VALOR_TOTAL"])).toBeNull();
    expect(valorDe(doc("Valor Total abc"), ["VALOR_TOTAL"])).toBeNull();
    expect(valorDe(doc("sem rótulo 10,00"), ["VALOR_TOTAL"])).toBeNull();
  });

  it("o valor vai até o próximo rótulo da linha", () => {
    const d = doc("Valor do Frete 5,00   Valor do Seguro 2,00");
    expect(valorDe(d, ["V_FRETE"])).toBe(5);
    expect(valorDe(d, ["V_SEGURO"])).toBe(2);
    expect(valorDe(doc("Valor do Frete  Valor do Seguro 2,00"), ["V_FRETE"])).toBeNull();
  });

  it("rótulos da lista 'ignorar' não cortam o valor", () => {
    const d = doc("Valor Total R$ 10,00 Desconto");
    expect(buscarRotulo(d, ["VALOR_TOTAL"], (s) => s.trim(), { ignorar: ["DESCONTO"] })?.valor).toBe("R$ 10,00 Desconto");
    expect(buscarRotulo(d, ["VALOR_TOTAL"], (s) => s.trim())?.valor).toBe("R$ 10,00");
  });

  it("a ordem das chaves manda: a primeira chave é procurada no documento todo antes da segunda", () => {
    const d = doc("Total 5,00\nValor Total 10,00");
    expect(valorDe(d, ["VALOR_TOTAL", "TOTAL"])).toBe(10);
    expect(valorDe(d, ["TOTAL", "VALOR_TOTAL"])).toBe(5);
    expect(valorDe(d, ["INEXISTENTE", "TOTAL"])).toBe(5);
  });

  it("devolve o primeiro rótulo que tem valor, indicando a linha", () => {
    const d = doc("Valor Total\nValor Total 7,00");
    expect(buscarRotulo(d, ["VALOR_TOTAL"], (s) => s.trim() || null, { abaixo: false })).toEqual({ valor: "7,00", linha: 1 });
  });
});

describe("valor embaixo do rótulo", () => {
  const CAB = "Valor do Frete   Valor do Seguro   Desconto";

  it("pega o valor da mesma coluna, com posições reais", () => {
    const texto = `${CAB}\n${embaixo(CAB, { "Valor do Frete": "80,00", "Valor do Seguro": "2,00", Desconto: "3,00" })}`;
    const d = doc(texto);
    expect(valorDe(d, ["V_FRETE"])).toBe(80);
    expect(valorDe(d, ["V_SEGURO"])).toBe(2);
    expect(valorDe(d, ["DESCONTO"])).toBe(3);
  });

  it("coluna sem valor não pega o da vizinha", () => {
    const texto = `${CAB}\n${embaixo(CAB, { "Valor do Frete": "80,00", Desconto: "3,00" })}`;
    const d = doc(texto);
    expect(valorDe(d, ["V_SEGURO"])).toBeNull();
    expect(valorDe(d, ["DESCONTO"])).toBe(3);
  });

  it("sem posições, usa as células da linha de baixo, uma por rótulo", () => {
    const d = doc(`${CAB}\n80,00             2,00              3,00`, SEM_POSICAO);
    expect(valorDe(d, ["V_FRETE"])).toBe(80);
    expect(valorDe(d, ["V_SEGURO"])).toBe(2);
    expect(valorDe(d, ["DESCONTO"])).toBe(3);
  });

  it("sem posições e com menos células que rótulos, cai para a coluna pela posição dos caracteres", () => {
    const d = doc(`${CAB}\n80,00   3,00`, SEM_POSICAO);
    expect(valorDe(d, ["V_FRETE"])).toBe(80);
    expect(valorDe(d, ["V_SEGURO"])).toBeNull();
    expect(valorDe(d, ["DESCONTO"])).toBeNull();
  });

  it("sem posições, junta o 'R$' ao número quando conta as unidades", () => {
    const d = doc("Valor do Frete  Valor do Seguro\nR$ 80,00  R$ 2,00", SEM_POSICAO);
    expect(valorDe(d, ["V_FRETE"])).toBe(80);
    expect(valorDe(d, ["V_SEGURO"])).toBe(2);
  });

  it("a linha de baixo só vale se for da mesma página e não for outra linha de rótulos", () => {
    expect(valorDe(doc(["Valor Total", "10,00"]), ["VALOR_TOTAL"])).toBeNull();
    expect(valorDe(doc("Valor Total\n10,00"), ["VALOR_TOTAL"])).toBe(10);
    expect(valorDe(doc("Valor Total\nDesconto"), ["VALOR_TOTAL"])).toBeNull();
  });

  it("mesmaLinha e abaixo podem ser desligados", () => {
    const d = doc("Valor Total 5,00\n7,00");
    expect(valorDe(d, ["VALOR_TOTAL"])).toBe(5);
    expect(valorDe(d, ["VALOR_TOTAL"], { mesmaLinha: false })).toBe(7);
    expect(valorDe(doc("Valor Total\n7,00"), ["VALOR_TOTAL"], { abaixo: false })).toBeNull();
    expect(valorDe(doc("Valor Total\n7,00"), ["VALOR_TOTAL"], { mesmaLinha: false, abaixo: false })).toBeNull();
  });

  it("a faixa limita as linhas procuradas", () => {
    const d = doc("Valor Total 1,00\nx\nValor Total 2,00\nx\nValor Total 3,00");
    expect(valorDe(d, ["VALOR_TOTAL"], { faixa: { de: 1, ate: 4 } })).toBe(2);
    expect(valorDe(d, ["VALOR_TOTAL"], { faixa: { de: 3, ate: 99 } })).toBe(3);
    expect(valorDe(d, ["VALOR_TOTAL"], { faixa: { de: 0, ate: 2 } })).toBe(1);
    expect(valorDe(d, ["VALOR_TOTAL"], { faixa: { de: 3, ate: 4 } })).toBeNull();
  });

  it("o valor embaixo não pode estar fora da faixa", () => {
    const d = doc("Valor Total\n9,00");
    expect(valorDe(d, ["VALOR_TOTAL"], { faixa: { de: 0, ate: 1 } })).toBeNull();
    expect(valorDe(d, ["VALOR_TOTAL"], { faixa: { de: 0, ate: 2 } })).toBe(9);
  });
});

describe("data, número, texto e documento", () => {
  it("data depois do rótulo, em qualquer formato", () => {
    expect(dataDe(doc("Data da Emissão 15/10/2026"), ["DATA_EMISSAO"])).toBe("2026-10-15");
    expect(dataDe(doc("Data da Emissão: 15 de outubro de 2026"), ["DATA_EMISSAO"])).toBe("2026-10-15");
    expect(dataDe(doc("Data da Emissão sem data"), ["DATA_EMISSAO"])).toBeNull();
    expect(dataDe(doc("Data da Emissão\n15/10/2026"), ["DATA_EMISSAO"])).toBe("2026-10-15");
  });

  describe("número", () => {
    it.each([
      ["Número 123", "123"],
      ["Número: 000.012.345", "000.012.345"],
      ["Número #45", "45"],
      ["Número Nº 45", "45"],
      ["Número 12-A/3", "12-A/3"],
      ["Número 123,", "123"],
      ["Número 123;", "123"],
      ["Número 123.", "123"],
      ["Número :7", "7"],
      ["Número 15/10/2026 99", "99"],
      ["Número 10,00 55", "55"],
      ["Número abc 77", "77"],
      ["Número -9", "9"],
    ])("'%s' → %s", (texto, numero) => {
      expect(numeroDe(doc(texto), ["NUMERO"])).toBe(numero);
    });

    it("sem número aproveitável, nada", () => {
      for (const texto of ["Número", "Número abc", "Número 15/10/2026", "Número 10,00", "Número ---", "Número @12"]) {
        expect(numeroDe(doc(texto), ["NUMERO"])).toBeNull();
      }
    });
  });

  describe("texto", () => {
    it.each([
      ["Nome: JOSE DA SILVA", "JOSE DA SILVA"],
      ["Nome - JOSE DA SILVA", "JOSE DA SILVA"],
      ["Nome = JOSE DA SILVA", "JOSE DA SILVA"],
      ["Nome . JOSE DA SILVA", "JOSE DA SILVA"],
      ["Nome: JOSE DA SILVA   Endereço: RUA A", "JOSE DA SILVA"],
      ["Nome: ACME LTDA CNPJ: 11.222.333/0001-81", "ACME LTDA"],
      ["Nome: ACME LTDA - CNPJ 11.222.333/0001-81", "ACME LTDA"],
      ["Nome: ACME LTDA, CNPJ", "ACME LTDA"],
      ["Nome: ACME LTDA CNPJ/MF:", "ACME LTDA"],
      ["Nome: ACME LTDA CPF/CNPJ", "ACME LTDA"],
      ["Nome: ACME LTDA /", "ACME LTDA"],
      ["Nome: ACME LTDA;", "ACME LTDA"],
      ["Nome: ACME   LTDA", "ACME"],
      ["Nome: ZE", "ZE"],
    ])("'%s' → %s", (texto, nome) => {
      expect(textoDe(doc(texto), ["NOME"])).toBe(nome);
    });

    it("precisa de duas letras seguidas", () => {
      for (const texto of ["Nome: 12", "Nome: A 1", "Nome: -", "Nome:"]) expect(textoDe(doc(texto), ["NOME"])).toBeNull();
    });

    it("texto embaixo do rótulo", () => {
      expect(textoDe(doc("Nome\nJOSE DA SILVA"), ["NOME"])).toBe("JOSE DA SILVA");
      const cab = "Nome                    Telefone";
      expect(textoDe(doc(`${cab}\n${embaixo(cab, { Nome: "JOSE DA SILVA", Telefone: "(11) 3333-4444" })}`), ["NOME"])).toBe("JOSE DA SILVA");
    });
  });

  describe("documento", () => {
    it("CNPJ e CPF depois do rótulo, com valor, máscara e validade", () => {
      expect(documentoDe(doc("CNPJ: 11.222.333/0001-81"), ["CNPJ"])).toMatchObject({ valor: "11222333000181", valido: true });
      expect(documentoDe(doc("CPF 529.982.247-25"), ["CPF"])).toMatchObject({ valor: "52998224725", valido: true });
      expect(documentoDe(doc("CPF/CNPJ do Beneficiário: 11.222.333/0001-81"), ["CNPJ_BENEFICIARIO"])?.valor).toBe("11222333000181");
      expect(documentoDe(doc("CNPJ: 11.222.333/0001-82"), ["CNPJ"])).toMatchObject({ valido: false });
      expect(documentoDe(doc("CNPJ sem número"), ["CNPJ"])).toBeNull();
    });

    it("rótulos de CNPJ e CPF na mesma linha não cortam um ao outro", () => {
      expect(documentoDe(doc("CNPJ CPF 11.222.333/0001-81"), ["CNPJ"])?.valor).toBe("11222333000181");
      expect(documentoDe(doc("CNPJ / CPF  CNPJ 11.222.333/0001-81"), ["CNPJ_CPF"])?.valor).toBe("11222333000181");
    });

    it("documento embaixo do rótulo, na coluna certa", () => {
      const cab = "Nome                    CNPJ / CPF";
      const texto = `${cab}\n${embaixo(cab, { Nome: "ACME LTDA", "CNPJ / CPF": "98.765.432/0001-98" })}`;
      expect(documentoDe(doc(texto), ["CNPJ_CPF"])?.valor).toBe("98765432000198");
    });
  });
});

describe("unidadesDaLinha", () => {
  const unidades = (texto: string) => unidadesDaLinha(doc(texto).linhas[0]).map((u) => u.texto);

  it("palavras da mesma célula formam uma unidade; números ficam sozinhos", () => {
    expect(unidades("JOSE DA SILVA")).toEqual(["JOSE DA SILVA"]);
    expect(unidades("JOSE 123")).toEqual(["JOSE", "123"]);
    expect(unidades("10,00 20,00")).toEqual(["10,00", "20,00"]);
    expect(unidades("A1 B2")).toEqual(["A1", "B2"]);
    expect(unidades("ACME 12B")).toEqual(["ACME", "12B"]);
  });

  it("vãos largos separam as células", () => {
    expect(unidades("JOSE DA SILVA   MARIA SOUZA")).toEqual(["JOSE DA SILVA", "MARIA SOUZA"]);
  });

  it("'R$' gruda no número, e data gruda na hora, telefone no DDD, percentual no número", () => {
    expect(unidades("R$ 10,00")).toEqual(["R$ 10,00"]);
    expect(unidades("RS 10,00")).toEqual(["RS 10,00"]);
    expect(unidades("R$. 10,00")).toEqual(["R$. 10,00"]);
    expect(unidades("R$ abc")).toEqual(["R$ abc"]);
    expect(unidades("15/10/2026 10:30")).toEqual(["15/10/2026 10:30"]);
    expect(unidades("15/10/2026 10:30:15")).toEqual(["15/10/2026 10:30:15"]);
    expect(unidades("15-10-26 10:30")).toEqual(["15-10-26 10:30"]);
    expect(unidades("(11) 98888-7777")).toEqual(["(11) 98888-7777"]);
    expect(unidades("(11) 3333-4444")).toEqual(["(11) 3333-4444"]);
    expect(unidades("5,00 %")).toEqual(["5,00 %"]);
  });

  it("o que não casa com esses padrões não gruda", () => {
    expect(unidades("15/10/2026 abc")).toEqual(["15/10/2026", "abc"]);
    expect(unidades("(11) abc")).toEqual(["(11)", "abc"]);
    expect(unidades("abc %")).toEqual(["abc %"]);
    expect(unidades("R$ 10,00 20,00")).toEqual(["R$ 10,00", "20,00"]);
  });

  it("traço e e-mail ficam sozinhos", () => {
    expect(unidades("NOME - ")).toEqual(["NOME", "-"]);
    expect(unidades("MAIL a@b.com")).toEqual(["MAIL", "a@b.com"]);
  });

  it("guarda posição inicial e final de cada unidade", () => {
    const u = unidadesDaLinha(doc("AB CD   EF").linhas[0]);
    expect(u.map((x) => [x.inicio, x.fim])).toEqual([
      [0, 5],
      [8, 10],
    ]);
  });
});

describe("coberturaRotulos", () => {
  const cob = (t: string) => coberturaRotulos(doc(t).linhas[0]);

  it("fração das letras e dígitos da linha que são rótulo", () => {
    expect(cob("VALOR TOTAL")).toBe(1);
    expect(cob("Valor Total 12345")).toBeCloseTo(10 / 15);
    expect(cob("só texto livre")).toBe(0);
    expect(cob("VALOR TOTAL   DESCONTO")).toBe(1);
  });

  it("linha sem letras nem dígitos: zero", () => {
    expect(cob("--- ...")).toBe(0);
  });

  it("pontuação e espaços não entram na conta", () => {
    expect(cob("VALOR: TOTAL")).toBe(1);
    expect(cob("(R$) VALOR (R$)")).toBeCloseTo(6 / 7);
  });
});
