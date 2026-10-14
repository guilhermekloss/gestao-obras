import { describe, expect, it } from "vitest";
import type { LeituraNormalizada } from "@/services/leitura-documento";
import type { CorrespondenciaFornecedor } from "@/services/correspondencia-fornecedor";
import {
  conferenciaInicial,
  errosConferencia,
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
const OPTS = { anexoUrl: "/api/fotos/a.jpg", anexoNome: "a.jpg", hoje: "2026-10-14", obraPadrao: "obra-1" };
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
