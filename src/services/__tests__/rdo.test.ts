import { describe, it, expect } from "vitest";
import {
  PRAZO_EDICAO_CAMPO_DIAS,
  dataDoRdo,
  diffFotos,
  normalizarEfetivo,
  normalizarEquipamentos,
  permissaoRdo,
  podeAlterarRdo,
  resumoClima,
  rotuloClima,
  rotuloCondicao,
  totalPessoas,
  urlFotoValida,
  validarEfetivo,
  validarEquipamentos,
} from "../rdo";

describe("normalizarEfetivo", () => {
  it("mantém itens válidos", () => {
    expect(normalizarEfetivo([{ funcao: "Pedreiro", qtd: 4 }])).toEqual([{ funcao: "Pedreiro", qtd: 4 }]);
  });

  it("Json nulo ou que não é lista vira lista vazia", () => {
    expect(normalizarEfetivo(null)).toEqual([]);
    expect(normalizarEfetivo(undefined)).toEqual([]);
    expect(normalizarEfetivo({ funcao: "Pedreiro", qtd: 1 })).toEqual([]);
    expect(normalizarEfetivo("Pedreiro")).toEqual([]);
  });

  it("descarta entradas malformadas, nome vazio e qtd não positiva", () => {
    expect(
      normalizarEfetivo([
        null,
        "x",
        { funcao: "", qtd: 2 },
        { funcao: "Servente", qtd: 0 },
        { funcao: "Pintor", qtd: -1 },
        { funcao: "Eletricista", qtd: "abc" },
        { qtd: 3 },
        { funcao: "Encanador", qtd: 2 },
      ]),
    ).toEqual([{ funcao: "Encanador", qtd: 2 }]);
  });

  it("apara espaços, trunca fração e aceita qtd numérica em texto", () => {
    expect(normalizarEfetivo([{ funcao: "  Mestre   de obras ", qtd: "2.7" }])).toEqual([
      { funcao: "Mestre de obras", qtd: 2 },
    ]);
  });

  it("soma duplicadas ignorando caixa e acento, mantendo a primeira grafia", () => {
    expect(
      normalizarEfetivo([
        { funcao: "Eletricista", qtd: 1 },
        { funcao: "eletricista", qtd: 2 },
        { funcao: "Servente", qtd: 1 },
      ]),
    ).toEqual([
      { funcao: "Eletricista", qtd: 3 },
      { funcao: "Servente", qtd: 1 },
    ]);
    expect(normalizarEquipamentos([{ nome: "Betoneira", qtd: 1 }, { nome: "betonéira", qtd: 1 }])).toEqual([
      { nome: "Betoneira", qtd: 2 },
    ]);
  });
});

describe("normalizarEquipamentos", () => {
  it("usa a chave nome", () => {
    expect(
      normalizarEquipamentos([
        { nome: "Betoneira", qtd: 1 },
        { funcao: "Pedreiro", qtd: 2 },
      ]),
    ).toEqual([{ nome: "Betoneira", qtd: 1 }]);
  });
});

describe("validarEfetivo / validarEquipamentos", () => {
  it("aceita lista válida e descarta itens zerados", () => {
    const r = validarEfetivo([
      { funcao: "Pedreiro", qtd: 3 },
      { funcao: "Servente", qtd: 0 },
    ]);
    expect(r).toEqual({ ok: true, itens: [{ funcao: "Pedreiro", qtd: 3 }] });
  });

  it("ausente vale lista vazia", () => {
    expect(validarEquipamentos(undefined)).toEqual({ ok: true, itens: [] });
  });

  it("rejeita nome vazio", () => {
    const r = validarEquipamentos([{ nome: "  ", qtd: 1 }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita qtd fracionária, negativa ou em texto", () => {
    expect(validarEfetivo([{ funcao: "Pedreiro", qtd: 1.5 }]).ok).toBe(false);
    expect(validarEfetivo([{ funcao: "Pedreiro", qtd: -1 }]).ok).toBe(false);
    expect(validarEfetivo([{ funcao: "Pedreiro", qtd: "2" }]).ok).toBe(false);
  });

  it("rejeita quantidade absurda", () => {
    expect(validarEquipamentos([{ nome: "Andaime", qtd: 1000 }]).ok).toBe(false);
  });

  it("rejeita formato que não é lista", () => {
    expect(validarEfetivo({ funcao: "Pedreiro", qtd: 1 }).ok).toBe(false);
  });

  it("junta duplicadas ao validar", () => {
    expect(
      validarEquipamentos([
        { nome: "Betoneira", qtd: 1 },
        { nome: "BETONEIRA", qtd: 1 },
      ]),
    ).toEqual({ ok: true, itens: [{ nome: "Betoneira", qtd: 2 }] });
  });
});

describe("totalPessoas", () => {
  it("soma as quantidades do efetivo", () => {
    expect(
      totalPessoas([
        { funcao: "Pedreiro", qtd: 4 },
        { funcao: "Servente", qtd: 3 },
      ]),
    ).toBe(7);
  });

  it("Json vazio ou inválido soma zero", () => {
    expect(totalPessoas(null)).toBe(0);
    expect(totalPessoas([{ funcao: "Pedreiro", qtd: -2 }])).toBe(0);
  });
});

describe("rótulos", () => {
  it("rotuloClima traduz valores conhecidos e repassa desconhecidos", () => {
    expect(rotuloClima("SOL")).toBe("Sol");
    expect(rotuloClima("CHUVA_FORTE")).toBe("Chuva forte");
    expect(rotuloClima("GRANIZO")).toBe("GRANIZO");
    expect(rotuloClima(null)).toBeNull();
    expect(rotuloClima("")).toBeNull();
  });

  it("rotuloCondicao", () => {
    expect(rotuloCondicao("PRATICAVEL")).toBe("Praticável");
    expect(rotuloCondicao("PARCIAL")).toBe("Parcialmente praticável");
    expect(rotuloCondicao("IMPRATICAVEL")).toBe("Impraticável");
    expect(rotuloCondicao(null)).toBeNull();
  });
});

describe("resumoClima", () => {
  it("mostra os dois turnos quando diferem", () => {
    expect(resumoClima({ climaManha: "SOL", climaTarde: "CHUVA" })).toBe("Manhã: Sol · Tarde: Chuva");
  });

  it("colapsa turnos iguais", () => {
    expect(resumoClima({ climaManha: "NUBLADO", climaTarde: "NUBLADO" })).toBe("Nublado");
  });

  it("mostra só o turno preenchido", () => {
    expect(resumoClima({ climaManha: "SOL" })).toBe("Manhã: Sol");
    expect(resumoClima({ climaTarde: "CHUVA" })).toBe("Tarde: Chuva");
  });

  it("cai no texto legado e prefere os turnos quando existem", () => {
    expect(resumoClima({ clima: "☀️ Sol" })).toBe("☀️ Sol");
    expect(resumoClima({ clima: "☀️ Sol", climaManha: "CHUVA", climaTarde: "CHUVA" })).toBe("Chuva");
    expect(resumoClima({ clima: "  " })).toBeNull();
    expect(resumoClima({})).toBeNull();
  });
});

describe("permissaoRdo", () => {
  const criadoEm = new Date("2026-10-01T10:00:00");
  const rdo = { autorId: "u-campo", createdAt: criadoEm };
  const dia = 24 * 60 * 60 * 1000;

  it("ADMIN e ESCRITORIO sempre podem, de qualquer autor e a qualquer tempo", () => {
    const muitoDepois = new Date(criadoEm.getTime() + 365 * dia);
    expect(podeAlterarRdo({ id: "x", role: "ADMIN" }, rdo, muitoDepois)).toBe(true);
    expect(podeAlterarRdo({ id: "y", role: "ESCRITORIO" }, rdo, muitoDepois)).toBe(true);
    expect(podeAlterarRdo({ id: "y", role: "ESCRITORIO" }, { autorId: null, createdAt: criadoEm })).toBe(true);
  });

  it("CAMPO pode alterar o próprio RDO dentro do prazo", () => {
    const dentro = new Date(criadoEm.getTime() + PRAZO_EDICAO_CAMPO_DIAS * dia);
    expect(permissaoRdo({ id: "u-campo", role: "CAMPO" }, rdo, dentro)).toEqual({ ok: true });
  });

  it("CAMPO não altera RDO de outro autor nem sem autor", () => {
    expect(podeAlterarRdo({ id: "outro", role: "CAMPO" }, rdo, criadoEm)).toBe(false);
    expect(podeAlterarRdo({ id: "u-campo", role: "CAMPO" }, { autorId: null, createdAt: criadoEm }, criadoEm)).toBe(
      false,
    );
  });

  it("CAMPO perde a permissão depois do prazo", () => {
    const fora = new Date(criadoEm.getTime() + PRAZO_EDICAO_CAMPO_DIAS * dia + 1);
    const r = permissaoRdo({ id: "u-campo", role: "CAMPO" }, rdo, fora);
    expect(r.ok).toBe(false);
  });
});

describe("dataDoRdo", () => {
  it("mantém o dia civil gravado em @db.Date (meia-noite UTC)", () => {
    const d = dataDoRdo(new Date("2026-10-14T00:00:00.000Z"));
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 10, 14, 12]);
  });
});

describe("urlFotoValida", () => {
  it("aceita caminho do app e https", () => {
    expect(urlFotoValida("/api/fotos/123-abc.jpg")).toBe(true);
    expect(urlFotoValida("https://cdn.exemplo.com/a.jpg")).toBe(true);
  });

  it("rejeita esquemas perigosos e URLs relativas a protocolo", () => {
    expect(urlFotoValida("javascript:alert(1)")).toBe(false);
    expect(urlFotoValida("//evil.com/a.jpg")).toBe(false);
    expect(urlFotoValida("http://exemplo.com/a.jpg")).toBe(false);
    expect(urlFotoValida("")).toBe(false);
  });
});

describe("diffFotos", () => {
  const atuais = [
    { id: "f1", url: "/api/fotos/1.jpg" },
    { id: "f2", url: "/api/fotos/2.jpg" },
  ];

  it("remove as que saíram e cria as novas", () => {
    expect(diffFotos(atuais, [{ url: "/api/fotos/2.jpg" }, { url: "/api/fotos/3.jpg", legenda: " Laje " }])).toEqual({
      removerIds: ["f1"],
      criar: [{ url: "/api/fotos/3.jpg", legenda: "Laje" }],
    });
  });

  it("sem mudança não remove nem cria", () => {
    expect(diffFotos(atuais, atuais)).toEqual({ removerIds: [], criar: [] });
  });

  it("não cria a mesma URL duas vezes", () => {
    expect(diffFotos([], [{ url: "/a.jpg" }, { url: "/a.jpg" }]).criar).toHaveLength(1);
  });
});
