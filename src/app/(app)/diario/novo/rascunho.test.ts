import { describe, expect, it } from "vitest";
import {
  assinaturaDoConteudo,
  chaveRascunho,
  lerRascunho,
  quandoSalvo,
  serializarRascunho,
  VALIDADE_RASCUNHO_MS,
  type ConteudoRdo,
} from "./rascunho";

const AGORA = new Date(2026, 9, 16, 15, 0).getTime();

const conteudo: ConteudoRdo = {
  obraId: "obra-1",
  data: "2026-10-16",
  climaManha: "SOL",
  climaTarde: "CHUVA",
  condicao: "PARCIAL",
  efetivo: [{ nome: "Pedreiro", qtd: 4 }],
  equipamentos: [{ nome: "Betoneira", qtd: 1 }],
  atividades: "Concretagem da laje",
  ocorrencias: "",
  fotos: [{ url: "/api/arquivos/abc" }],
};

describe("rascunho do RDO", () => {
  it("guarda uma chave por RDO em edição e uma para o novo", () => {
    expect(chaveRascunho()).toBe("rdo:rascunho:novo");
    expect(chaveRascunho("abc")).toBe("rdo:rascunho:abc");
  });

  it("devolve o que foi guardado, com a hora do salvamento", () => {
    const lido = lerRascunho(serializarRascunho(conteudo, AGORA - 1000), AGORA);
    expect(lido).toEqual({ ...conteudo, salvoEm: AGORA - 1000 });
  });

  it("descarta texto ausente, corrompido ou de outro formato", () => {
    expect(lerRascunho(null, AGORA)).toBeNull();
    expect(lerRascunho("", AGORA)).toBeNull();
    expect(lerRascunho("{quebrado", AGORA)).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 2, salvoEm: AGORA, ...conteudo }), AGORA)).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 1, salvoEm: AGORA, ...conteudo, climaManha: "NEVE" }), AGORA)).toBeNull();
    expect(
      lerRascunho(JSON.stringify({ v: 1, salvoEm: AGORA, ...conteudo, efetivo: [{ nome: "X", qtd: 0 }] }), AGORA),
    ).toBeNull();
  });

  it("descarta rascunho com mais de 7 dias", () => {
    const velho = serializarRascunho(conteudo, AGORA - VALIDADE_RASCUNHO_MS - 1);
    expect(lerRascunho(velho, AGORA)).toBeNull();
    const quaseVelho = serializarRascunho(conteudo, AGORA - VALIDADE_RASCUNHO_MS + 1000);
    expect(lerRascunho(quaseVelho, AGORA)).not.toBeNull();
  });

  it("descarta rascunho com data no futuro (relógio errado)", () => {
    expect(lerRascunho(serializarRascunho(conteudo, AGORA + 3_600_000), AGORA)).toBeNull();
  });

  it("no RDO novo, obra e data preenchidas sozinhas não contam como edição", () => {
    const vazio: ConteudoRdo = {
      ...conteudo,
      climaManha: "",
      climaTarde: "",
      condicao: "",
      efetivo: [],
      equipamentos: [],
      atividades: "",
      fotos: [],
    };
    const comObra = { ...vazio, obraId: "obra-9", data: "2026-10-17" };
    expect(assinaturaDoConteudo(comObra, true)).toBe(assinaturaDoConteudo(vazio, true));
    expect(assinaturaDoConteudo(comObra, false)).not.toBe(assinaturaDoConteudo(vazio, false));
    expect(assinaturaDoConteudo({ ...comObra, atividades: "x" }, true)).not.toBe(assinaturaDoConteudo(vazio, true));
  });

  it("descreve quando foi salvo", () => {
    expect(quandoSalvo(new Date(2026, 9, 16, 9, 5).getTime(), AGORA)).toBe("hoje às 09:05");
    expect(quandoSalvo(new Date(2026, 9, 15, 18, 40).getTime(), AGORA)).toBe("ontem às 18:40");
    expect(quandoSalvo(new Date(2026, 9, 12, 7, 0).getTime(), AGORA)).toBe("12/10 às 07:00");
  });
});
