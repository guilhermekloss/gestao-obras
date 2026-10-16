import { describe, expect, it } from "vitest";
import type { LeituraNormalizada } from "@/services/leitura-documento";
import type { CorrespondenciaFornecedor } from "@/services/correspondencia-fornecedor";
import type { CorrespondenciaItem } from "@/services/materiais";
import {
  adicionarItem,
  comMaterialIds,
  conferenciaDaReleitura,
  conferenciaInicial,
  errosConferencia,
  escolherVinculo,
  removerItem,
  vinculosParaAction,
  indiceAcerto,
  escolhaParaAction,
  situacaoDocumento,
  type Conferencia,
} from "../conferencia-model";

const LEITURA: LeituraNormalizada = {
  tipoDocumento: "NF",
  descricaoDocumento: "NF-e (DANFE)",
  fornecedor: { nome: "Casa do Construtor", documento: "11222333000181", documentoLido: "11222333000181", fone: null },
  destinatario: { nome: "Construtora", documento: null, documentoLido: null },
  numero: "12345",
  serie: "1",
  chaveNfe: null,
  dataEmissao: "2026-09-15",
  totalCents: 15050,
  formaPagto: "PIX",
  itens: [{ descricao: "Cimento", tipo: "MATERIAL", qtde: 3, unidade: "SC", unitCents: 5017, descontoCents: 1, totalCents: 15050 }],
  parcelas: [],
  avisos: [],
};
const CIMENTO = { id: "mat-1", nome: "Cimento CP II 50kg", unidade: "SC", tipo: "MATERIAL" as const, categoria: null };
const LIGADO: CorrespondenciaItem = { exato: CIMENTO, origem: "texto", candidatos: [] };
const OPTS = { anexoUrl: "/api/fotos/a.jpg", anexoNome: "a.jpg", hoje: "2026-10-14", obraPadrao: "obra-1", materiais: [LIGADO] };
const SEM_CORRESPONDENCIA: CorrespondenciaFornecedor = { exato: null, nomeDivergente: false, candidatos: [] };

function valida(parcial: Partial<Conferencia> = {}): Conferencia {
  return { ...conferenciaInicial(LEITURA, SEM_CORRESPONDENCIA, OPTS), conferido: true, ...parcial };
}

describe("conferenciaInicial", () => {
  it("fornecedor com mesmo CNPJ já vem escolhido", () => {
    const c = conferenciaInicial(
      LEITURA,
      { exato: { id: "f1", nome: "Casa do Construtor", cnpj: "11.222.333/0001-81" }, nomeDivergente: false, candidatos: [] },
      OPTS,
    );
    expect(c.fornecedor).toEqual({ modo: "existente", id: "f1", completarCom: null });
    expect(c.valores.fornecedorId).toBe("f1");
    expect(c.valores.rateios).toEqual([{ obraId: "obra-1", etapaId: "", percent: "100" }]);
    expect(c.conferido).toBe(false);
  });

  it("havendo parecidos, o usuário precisa decidir", () => {
    const c = conferenciaInicial(
      LEITURA,
      {
        exato: null,
        nomeDivergente: false,
        candidatos: [{ id: "f9", nome: "Casa do Construtor", cnpj: null, motivo: "NOME_SEM_DOCUMENTO", similaridade: 1 }],
      },
      OPTS,
    );
    expect(c.fornecedor).toEqual({ modo: "pendente" });
    expect(errosConferencia({ ...c, conferido: true })[0]).toMatch(/^Fornecedor: escolha/);
  });

  it("sem cadastro parecido: novo fornecedor com o que foi lido (mesmo inválido, para corrigir)", () => {
    const c = conferenciaInicial(
      { ...LEITURA, fornecedor: { ...LEITURA.fornecedor, documento: null, documentoLido: "11222333000182" } },
      SEM_CORRESPONDENCIA,
      OPTS,
    );
    expect(c.fornecedor).toEqual({ modo: "novo", nome: "Casa do Construtor", documento: "11222333000182" });
    expect(errosConferencia({ ...c, conferido: true })).toEqual([
      "Fornecedor: CNPJ/CPF inválido — confira os dígitos com o documento.",
    ]);
  });
});

describe("errosConferencia", () => {
  it("leitura coerente e conferida: nenhum erro", () => {
    expect(errosConferencia(valida())).toEqual([]);
  });

  it("exige marcar que conferiu", () => {
    expect(errosConferencia(valida({ conferido: false }))).toEqual([
      'Marque "Conferi os dados com o documento" para confirmar.',
    ]);
  });

  it("NF exige número e CNPJ/CPF do fornecedor novo; recibo não", () => {
    const c = valida({ fornecedor: { modo: "novo", nome: "Fulano", documento: "" } });
    c.valores = { ...c.valores, numero: "" };
    expect(errosConferencia(c)).toEqual([
      "Fornecedor: informe o CNPJ/CPF do emitente da nota.",
      "Documento: informe o número da nota.",
    ]);
    c.valores = { ...c.valores, tipoDocumento: "RECIBO" };
    expect(errosConferencia(c)).toEqual([]);
  });

  it("completar cadastro só com CNPJ/CPF válido", () => {
    expect(errosConferencia(valida({ fornecedor: { modo: "existente", id: "f1", completarCom: "123" } }))).toHaveLength(1);
    expect(errosConferencia(valida({ fornecedor: { modo: "existente", id: "f1", completarCom: "11222333000181" } }))).toEqual([]);
  });

  it("itens, parcelas e obra precisam fechar", () => {
    const c = valida();
    c.valores = {
      ...c.valores,
      total: "200,00",
      itens: [{ ...c.valores.itens[0], descricao: " " }],
      rateios: [{ obraId: "", etapaId: "", percent: "50" }],
    };
    const erros = errosConferencia(c);
    expect(erros).toContain("Itens: a linha 1 está sem descrição.");
    expect(erros.some((e) => e.startsWith("Itens: a soma"))).toBe(true);
    expect(erros.some((e) => e.startsWith("Pagamento: a soma"))).toBe(true);
    expect(erros).toContain("Obra: selecione a obra em todas as linhas.");
    expect(erros).toContain("Obra: os percentuais devem somar 100%.");
  });
});

describe("auxiliares", () => {
  it("situação do documento", () => {
    expect(situacaoDocumento("")).toBe("vazio");
    expect(situacaoDocumento("11.222.333/0001-81")).toBe("valido");
    expect(situacaoDocumento("11.222.333/0001-80")).toBe("invalido");
  });

  it("escolha para a action", () => {
    expect(escolhaParaAction({ modo: "pendente" })).toBeNull();
    expect(escolhaParaAction({ modo: "existente", id: "f1", completarCom: null })).toEqual({
      modo: "existente",
      id: "f1",
      completarDocumento: undefined,
    });
    expect(escolhaParaAction({ modo: "novo", nome: "X", documento: "" })).toEqual({ modo: "novo", nome: "X", documento: undefined });
  });
});

describe("indiceAcerto", () => {
  it("leitura completa e coerente: 100% (alto)", () => {
    const r = indiceAcerto({ ...LEITURA, chaveNfe: "35260911222333000181550010000123451876543218" });
    expect(r).toEqual({ percentual: 100, nivel: "alto", faltas: [] });
  });

  it("cada campo não lido baixa o índice e aparece nas faltas", () => {
    const r = indiceAcerto(LEITURA);
    expect(r.faltas).toEqual(["chave de acesso válida"]);
    expect(r.percentual).toBe(86);
    expect(r.nivel).toBe("alto");
  });

  it("avisos penalizam (8 pontos cada, até 40)", () => {
    const base = { ...LEITURA, chaveNfe: "35260911222333000181550010000123451876543218" };
    expect(indiceAcerto({ ...base, avisos: ["a", "b"] }).percentual).toBe(84);
    expect(indiceAcerto({ ...base, avisos: Array(10).fill("x") }).percentual).toBe(60);
  });

  it("foto ruim: sem CNPJ válido, sem número e itens que não fecham → baixo", () => {
    const r = indiceAcerto({
      ...LEITURA,
      fornecedor: { ...LEITURA.fornecedor, documento: null },
      numero: "",
      itens: [{ ...LEITURA.itens[0], totalCents: 9000 }],
      avisos: ["A soma dos itens difere do total"],
    });
    expect(r.nivel).toBe("baixo");
    expect(r.faltas).toEqual(["CNPJ/CPF do emitente válido", "número da nota", "chave de acesso válida", "itens que somam o total"]);
  });

  it("recibo não cobra CNPJ, número nem chave", () => {
    const r = indiceAcerto({
      ...LEITURA,
      tipoDocumento: "RECIBO",
      descricaoDocumento: "Recibo",
      fornecedor: { ...LEITURA.fornecedor, documento: null },
      numero: "",
    });
    expect(r).toEqual({ percentual: 100, nivel: "alto", faltas: [] });
  });
});

describe("conferenciaDaReleitura", () => {
  it("troca os dados pela nova leitura e mantém obra e rateio escolhidos", () => {
    const anterior = valida();
    anterior.valores.rateios = [
      { obraId: "obra-2", etapaId: "et-1", percent: "60" },
      { obraId: "obra-3", etapaId: "", percent: "40" },
    ];
    anterior.valores.numero = "editado";
    const nova = conferenciaDaReleitura(anterior, { ...LEITURA, numero: "999" }, SEM_CORRESPONDENCIA, OPTS);
    expect(nova.valores.numero).toBe("999");
    expect(nova.valores.rateios).toEqual(anterior.valores.rateios);
    expect(nova.conferido).toBe(false);
  });
});

describe("materiais dos itens", () => {
  it("ligação exata já vem escolhida e o materialId segue no item", () => {
    const c = conferenciaInicial(LEITURA, SEM_CORRESPONDENCIA, OPTS);
    expect(c.vinculos).toEqual([{ modo: "existente", id: "mat-1", automatico: true }]);
    expect(c.valores.itens[0].materialId).toBe("mat-1");
  });

  it("sem ligação exata o item fica pendente e bloqueia a confirmação", () => {
    const c = conferenciaInicial(LEITURA, SEM_CORRESPONDENCIA, { ...OPTS, materiais: [{ exato: null, origem: null, candidatos: [] }] });
    expect(c.vinculos).toEqual([{ modo: "pendente", candidatos: [] }]);
    expect(errosConferencia({ ...c, conferido: true })).toEqual([
      "Itens: a linha 1 precisa de um material — ligue a um existente, cadastre como novo ou deixe avulso.",
    ]);
  });

  it("depois de decidir (ligar, cadastrar ou avulso) a nota pode ser confirmada", () => {
    const pendente = conferenciaInicial(LEITURA, SEM_CORRESPONDENCIA, { ...OPTS, materiais: [] });
    for (const vinculo of [
      { modo: "existente" as const, id: "mat-9", automatico: false },
      { modo: "novo" as const, nome: "Cimento Votoran 50kg", unidade: "SC" },
      { modo: "nenhum" as const },
    ]) {
      expect(errosConferencia({ ...escolherVinculo(pendente, 0, vinculo), conferido: true })).toEqual([]);
    }
    expect(escolherVinculo(pendente, 0, { modo: "existente", id: "mat-9", automatico: false }).valores.itens[0].materialId).toBe("mat-9");
    expect(escolherVinculo(pendente, 0, { modo: "nenhum" }).valores.itens[0].materialId).toBe("");
  });

  it("item de frete não pede material", () => {
    const leitura = { ...LEITURA, itens: [{ ...LEITURA.itens[0], descricao: "FRETE", tipo: "FRETE" as const }] };
    const c = conferenciaInicial(leitura, SEM_CORRESPONDENCIA, { ...OPTS, materiais: [] });
    expect(c.vinculos).toEqual([{ modo: "nenhum" }]);
  });

  it("remover e adicionar item mantém os vínculos alinhados", () => {
    const base = conferenciaInicial(LEITURA, SEM_CORRESPONDENCIA, OPTS);
    const com2 = adicionarItem(base);
    expect(com2.valores.itens).toHaveLength(2);
    expect(com2.vinculos).toEqual([{ modo: "existente", id: "mat-1", automatico: true }, { modo: "nenhum" }]);
    const sem1 = removerItem(com2, 0);
    expect(sem1.valores.itens).toHaveLength(1);
    expect(sem1.vinculos).toEqual([{ modo: "nenhum" }]);
  });

  it("monta as escolhas para a action e aplica os ids devolvidos", () => {
    expect(
      vinculosParaAction([
        { modo: "existente", id: "a", automatico: true },
        { modo: "novo", nome: "Tubo", unidade: "M" },
        { modo: "pendente", candidatos: [] },
        { modo: "nenhum" },
      ]),
    ).toEqual([{ modo: "existente", id: "a" }, { modo: "novo", nome: "Tubo", unidade: "M" }, { modo: "nenhum" }, { modo: "nenhum" }]);

    const c = adicionarItem(conferenciaInicial(LEITURA, SEM_CORRESPONDENCIA, OPTS));
    expect(comMaterialIds(c.valores, ["x", ""]).itens.map((i) => i.materialId)).toEqual(["x", ""]);
    expect(comMaterialIds(c.valores, ["x"]).itens.map((i) => i.materialId)).toEqual(["x", ""]);
  });
});
