import { describe, expect, it } from "vitest";
import { encontrarAncoras, type Ancoras } from "../comum";
import { construirDoc } from "../documento";
import { interpretarNfse } from "../interpretes/nfse";
import { montarTexto } from "./auxiliar";
import { NFSE_NACIONAL, NFSE_SP } from "./fixtures";

const doc = (texto: string) => construirDoc(montarTexto(texto));
function ler(texto: string, extra: Partial<Ancoras> = {}) {
  const d = doc(texto);
  return interpretarNfse(d, { ...encontrarAncoras(d), ...extra }).lido;
}
const trocar = (texto: string, de: string, para: string) => {
  expect(texto).toContain(de);
  return texto.replace(de, para);
};

// Linha de valores alinhada embaixo dos rótulos, como no DANFSe.
function valores(cabecalho: string, porRotulo: Record<string, string>): string {
  let linha = "";
  for (const [rotulo, valor] of Object.entries(porRotulo)) {
    const col = cabecalho.indexOf(rotulo);
    expect(col).toBeGreaterThanOrEqual(0);
    linha = linha.padEnd(col) + valor;
  }
  return linha;
}

const CAB_TOTAL = "Valor do Serviço  Desconto Condicionado  Desconto Incondicionado  ISSQN Retido  Total das Retenções Federais  Valor Líquido da NFS-e";
const CAB_FED = "IRRF  Contribuição Previdenciária - Retida  Contribuições Sociais - Retidas";
const CAB_MUN = "Valor do Serviço  BC ISSQN     Alíquota Aplicada  Retenção do ISSQN          ISSQN Apurado";

// NFS-e mínima, só com o prestador e os quadros de valores pedidos.
function mini(totais: Record<string, string>, federais: Record<string, string> | null = null, municipal: Record<string, string> | null = null): string {
  const linhas = ["NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e", "PRESTADOR DE SERVIÇOS", "CNPJ: 11.222.333/0001-81", "DISCRIMINAÇÃO DOS SERVIÇOS", "SERVICO DE TESTE"];
  if (municipal) linhas.push("TRIBUTAÇÃO MUNICIPAL", CAB_MUNICIPAL(), valores(CAB_MUN, municipal));
  if (federais) linhas.push("TRIBUTAÇÃO FEDERAL", CAB_FED, valores(CAB_FED, federais));
  linhas.push("VALOR TOTAL DA NFS-E", CAB_TOTAL, valores(CAB_TOTAL, totais));
  return linhas.join("\n");
}
const CAB_MUNICIPAL = () => CAB_MUN;
const obs = (texto: string) => ler(texto).observacoes ?? "";
const BRUTO = { "Valor do Serviço": "R$ 5.000,00" };

describe("NFS-e: leitura completa", () => {
  it("modelo nacional: partes, número, data, total e item", () => {
    const lido = ler(NFSE_NACIONAL);
    expect(lido.emitente).toEqual({ nome: "ENGENHARIA FICTICIA SERVICOS LTDA", documento: "11222333000181", telefone: "(11) 3333-4444" });
    expect(lido.destinatario).toEqual({ nome: "CONSTRUTORA EXEMPLO LTDA", documento: "98765432000198" });
    expect(lido).toMatchObject({ numero: "123", dataEmissao: "2026-10-15", valorTotal: 5000, descontoGeral: null, formaPagamento: "NAO_INFORMADA" });
    expect(lido.itens).toHaveLength(1);
    expect(lido.itens[0]).toMatchObject({ valorTotal: 5000, tipo: "SERVICO", quantidade: null, unidade: null, valorUnitario: null, desconto: null });
    expect(lido.observacoes).toBe("Valor líquido R$ 4.200,00: ISS retido R$ 250,00 e INSS retido R$ 550,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).");
  });

  it("modelo municipal de São Paulo: sem retenção e sem observação", () => {
    const lido = ler(NFSE_SP);
    expect(lido).toMatchObject({ numero: "00004567", dataEmissao: "2026-10-08", valorTotal: 1800, observacoes: null });
    expect(lido.itens[0].descricao).toBe("LOCACAO DE BETONEIRA 400L COM OPERADOR - PERIODO 15/09/2026 A 30/09/2026 - OBRA RESIDENCIAL JARDIM");
  });
});

describe("NFS-e: valores e retenções", () => {
  const FECHA = "O valor líquido não fecha com o bruto menos as retenções lidas; confira.";

  it("líquido diferente do bruto, sem retenções: só o valor líquido (e o aviso de que não fecha)", () => {
    expect(obs(mini({ ...BRUTO, "Valor Líquido da NFS-e": "R$ 4.000,00" }))).toBe(
      `Valor líquido R$ 4.000,00. O total lançado é o valor bruto do serviço (R$ 5.000,00). ${FECHA}`,
    );
  });

  it("líquido igual ao bruto, sem retenções: nenhuma observação", () => {
    const lido = ler(mini({ ...BRUTO, "Valor Líquido da NFS-e": "R$ 5.000,00" }));
    expect(lido.observacoes).toBeNull();
    expect(lido.valorTotal).toBe(5000);
  });

  it("só bruto, sem líquido nem retenções: nenhuma observação", () => {
    expect(ler(mini(BRUTO)).observacoes).toBeNull();
  });

  it("retenção sem valor líquido: 'Retenções: ...'", () => {
    expect(obs(mini({ ...BRUTO, "ISSQN Retido": "R$ 250,00" }))).toBe("Retenções: ISS retido R$ 250,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).");
  });

  it("lista de retenções: vírgulas e 'e' antes da última, ISS primeiro e depois INSS, IRRF, CSLL, COFINS e PIS", () => {
    const lido = ler(mini({ ...BRUTO, "ISSQN Retido": "R$ 250,00" }, { IRRF: "50,00", "Contribuição Previdenciária - Retida": "R$ 100,00" }));
    expect(lido.observacoes).toBe(
      "Retenções: ISS retido R$ 250,00, INSS retido R$ 100,00 e IRRF retido R$ 50,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).",
    );
  });

  it("CSLL, COFINS, PIS e contribuições sociais retidas", () => {
    const cab = "CSLL (R$)  COFINS (R$)  PIS/PASEP (R$)  Contribuições Sociais - Retidas";
    const texto = [
      "NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e",
      "PRESTADOR DE SERVIÇOS",
      "CNPJ: 11.222.333/0001-81",
      "DISCRIMINAÇÃO DOS SERVIÇOS",
      "SERVICO DE TESTE",
      cab,
      valores(cab, { "CSLL (R$)": "33,00", "COFINS (R$)": "44,00", "PIS/PASEP (R$)": "55,00", "Contribuições Sociais - Retidas": "66,00" }),
      "VALOR TOTAL DA NFS-E",
      CAB_TOTAL,
      valores(CAB_TOTAL, BRUTO),
    ].join("\n");
    expect(obs(texto)).toBe(
      "Retenções: CSLL retida R$ 33,00, COFINS retida R$ 44,00, PIS retido R$ 55,00 e contribuições sociais retidas R$ 66,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).",
    );
  });

  it("com líquido: 'Valor líquido ...: retenções'", () => {
    const lido = ler(mini({ ...BRUTO, "ISSQN Retido": "R$ 250,00", "Valor Líquido da NFS-e": "R$ 4.750,00" }));
    expect(lido.observacoes).toBe("Valor líquido R$ 4.750,00: ISS retido R$ 250,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).");
  });

  it("desconto incondicionado reduz o total lançado, aparece nas observações e entra na conferência", () => {
    const lido = ler(mini({ ...BRUTO, "Desconto Incondicionado": "R$ 100,00", "Valor Líquido da NFS-e": "R$ 4.900,00" }));
    expect(lido).toMatchObject({ valorTotal: 4900, descontoGeral: 100 });
    expect(lido.observacoes).toBe(
      `Valor líquido R$ 4.900,00: desconto incondicionado R$ 100,00. O total lançado é o valor bruto do serviço (R$ 5.000,00).`,
    );
    expect(ler(mini(BRUTO)).descontoGeral).toBeNull();
  });

  it("o líquido confere com bruto menos desconto, ISS e retenções federais; pequena folga de centavos", () => {
    const base = { ...BRUTO, "ISSQN Retido": "R$ 250,00" };
    const fed = { IRRF: "50,00", "Contribuição Previdenciária - Retida": "R$ 100,00" };
    expect(obs(mini({ ...base, "Valor Líquido da NFS-e": "R$ 4.600,00" }, fed))).not.toContain(FECHA);
    expect(obs(mini({ ...base, "Valor Líquido da NFS-e": "R$ 4.600,01" }, fed))).not.toContain(FECHA);
    expect(obs(mini({ ...base, "Valor Líquido da NFS-e": "R$ 4.600,03" }, fed))).toContain(FECHA);
    expect(obs(mini({ ...base, "Valor Líquido da NFS-e": "R$ 4.599,99" }, fed))).not.toContain(FECHA);
    expect(obs(mini({ ...base, "Valor Líquido da NFS-e": "R$ 4.599,97" }, fed))).toContain(FECHA);
    expect(obs(mini({ ...BRUTO, "Desconto Incondicionado": "R$ 100,00", "Valor Líquido da NFS-e": "R$ 4.900,00" }))).not.toContain(FECHA);
  });

  it("o total de retenções federais impresso vale mais que a soma das retenções lidas", () => {
    const totais = { ...BRUTO, "Total das Retenções Federais": "R$ 550,00", "Valor Líquido da NFS-e": "R$ 4.450,00" };
    expect(obs(mini(totais, { IRRF: "10,00" }))).not.toContain(FECHA);
  });

  it("sem o valor do serviço, só o líquido: avisa e não lança total", () => {
    const texto = ["NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e", "PRESTADOR DE SERVIÇOS", "CNPJ: 11.222.333/0001-81", "Valor Líquido da NFS-e", "R$ 4.200,00"].join("\n");
    const lido = ler(texto);
    expect(lido.valorTotal).toBeNull();
    expect(lido.observacoes).toContain("Valor bruto do serviço não encontrado; confira o total (foi lido só o valor líquido).");
  });

  it("ISS retido pelo texto da retenção usa o ISSQN apurado; 'não retido' não", () => {
    const municipal = (retencao: string) => ({ "Valor do Serviço": "R$ 5.000,00", "Retenção do ISSQN": retencao, "ISSQN Apurado": "R$ 250,00" });
    expect(obs(mini(BRUTO, null, municipal("Retido pelo Tomador")))).toContain("ISS retido R$ 250,00");
    expect(obs(mini(BRUTO, null, municipal("Não Retido")))).not.toContain("ISS retido");
    expect(obs(mini(BRUTO, null, municipal("Sim")))).toContain("ISS retido R$ 250,00");
    expect(obs(mini(BRUTO, null, municipal("2 - Retido")))).toContain("ISS retido R$ 250,00");
    expect(obs(mini(BRUTO, null, municipal("1 - Não")))).not.toContain("ISS retido");
  });

  it("valor do serviço, total da nota ou valor total, nessa ordem de preferência", () => {
    expect(ler(mini({ "Valor do Serviço": "R$ 1.000,00" })).valorTotal).toBe(1000);
    const soTotal = ["NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e", "PRESTADOR DE SERVIÇOS", "CNPJ: 11.222.333/0001-81", "Valor Total da NFS-e R$ 777,00"].join("\n");
    expect(ler(soTotal).valorTotal).toBe(777);
  });
});

describe("NFS-e: descrição do serviço", () => {
  it("sem descrição, avisa e não cria item", () => {
    const sem = trocar(NFSE_NACIONAL, "Descrição do Serviço", "XXXX");
    const lido = ler(sem);
    expect(lido.itens).toEqual([]);
    expect(lido.observacoes).toContain("Discriminação do serviço não identificada na leitura.");
  });

  it("texto na mesma linha do rótulo conta; depois do rótulo, até a seção seguinte", () => {
    const texto = [
      "NOTA FISCAL DE SERVIÇOS",
      "PRESTADOR DE SERVIÇOS",
      "CNPJ: 11.222.333/0001-81",
      "DISCRIMINAÇÃO DOS SERVIÇOS: REFORMA DO TELHADO",
      "COM TROCA DE TELHAS",
      "VALOR TOTAL DO SERVIÇO = R$ 900,00",
    ].join("\n");
    expect(ler(texto).itens[0].descricao).toBe("REFORMA DO TELHADO COM TROCA DE TELHAS");
  });

  it("rótulo sozinho na linha: só as linhas seguintes", () => {
    const texto = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS", "REFORMA DO TELHADO", "VALOR TOTAL DO SERVIÇO = R$ 900,00"].join("\n");
    expect(ler(texto).itens[0].descricao).toBe("REFORMA DO TELHADO");
  });

  it("linha com menos de 3 letras depois do rótulo não entra", () => {
    const texto = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS: 12", "REFORMA DO TELHADO", "VALOR TOTAL DO SERVIÇO = R$ 900,00"].join("\n");
    expect(ler(texto).itens[0].descricao).toBe("REFORMA DO TELHADO");
  });

  it("para em 'pedido', 'dados bancários', 'PIX' e 'obs' depois de ter texto", () => {
    for (const quebra of ["PEDIDO DE COMPRA 12", "DADOS BANCARIOS XX", "BANCO 341", "CHAVE PIX 123", "PIX 123", "OBS: nada"]) {
      const texto = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS", "REFORMA DO TELHADO", quebra, "VALOR TOTAL DO SERVIÇO = R$ 900,00"].join("\n");
      expect(ler(texto).itens[0].descricao).toBe("REFORMA DO TELHADO");
    }
  });

  it("'pedido' logo no começo ainda é texto da descrição", () => {
    const texto = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS", "PEDIDO DE COMPRA 12", "REFORMA", "VALOR TOTAL DO SERVIÇO = R$ 900,00"].join("\n");
    expect(ler(texto).itens[0].descricao).toBe("PEDIDO DE COMPRA 12 REFORMA");
  });

  it("lê no máximo 11 linhas depois do rótulo e 500 caracteres", () => {
    const linhas = Array.from({ length: 14 }, (_, i) => `LINHA${i + 1}`);
    const texto = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS", ...linhas, "VALOR TOTAL DO SERVIÇO = R$ 900,00"].join("\n");
    expect(ler(texto).itens[0].descricao).toBe(linhas.slice(0, 11).join(" "));
    const longa = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS", "A".repeat(600), "VALOR TOTAL DO SERVIÇO = R$ 900,00"].join("\n");
    expect(ler(longa).itens[0].descricao).toHaveLength(500);
  });

  it("descrição sem valor do serviço não vira item", () => {
    const texto = ["NOTA FISCAL DE SERVIÇOS", "DISCRIMINAÇÃO DOS SERVIÇOS", "REFORMA DO TELHADO"].join("\n");
    const lido = ler(texto);
    expect(lido.itens).toEqual([]);
    expect(lido.observacoes ?? "").not.toContain("Discriminação do serviço não identificada");
  });
});

describe("NFS-e: partes, número e data", () => {
  it("sem a data de emissão, usa a competência e avisa", () => {
    const sem = trocar(NFSE_NACIONAL, "Data e Hora da emissão da NFS-e", "XXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    const lido = ler(sem);
    expect(lido.dataEmissao).toBe("2026-10-01");
    expect(lido.observacoes).toContain("Data de emissão não encontrada; foi usada a data de competência.");
    expect(ler(NFSE_NACIONAL).observacoes ?? "").not.toContain("data de competência");
  });

  it("sem o número impresso, usa o número da chave de acesso", () => {
    const sem = trocar(NFSE_NACIONAL, "Número da NFS-e", "XXXXXXXXXXXXXX");
    expect(ler(sem).numero).toBe("123");
    expect(ler(sem, { chaveNfse: null }).numero).toBeNull();
  });

  it("sem bloco do tomador, o destinatário fica vazio", () => {
    const sem = trocar(NFSE_NACIONAL, "TOMADOR DO SERVIÇO", "XXXX");
    expect(ler(sem).destinatario).toEqual({ nome: null, documento: null });
  });

  it("documento do prestador: o rotulado; senão o primeiro válido do bloco; senão o da chave", () => {
    const sem = trocar(NFSE_NACIONAL, "CNPJ / CPF / NIF       Inscrição Municipal   Telefone\n11.222.333/0001-81     1.234.567-8           (11) 3333-4444", "Inscrição Municipal   Telefone\n1.234.567-8           (11) 3333-4444");
    const doc14 = (valor: string, linha: number, valido = true) => ({ valor, linha, valido }) as never;
    expect(ler(sem, { documentos: [doc14("1", 9, false), doc14("98765432000198", 9)] }).emitente.documento).toBe("98765432000198");
    expect(ler(sem, { documentos: [doc14("1", 9, false)] }).emitente.documento).toBe("11222333000181");
  });

  it("telefone do prestador", () => {
    expect(ler(NFSE_NACIONAL).emitente.telefone).toBe("(11) 3333-4444");
    expect(ler(NFSE_SP).emitente.telefone).toBeNull();
  });
});
