import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage", () => ({ storage: {} }));

const { alertasDaCaptura, errosSeguidos, estadoDoCursor } = await import("../painel");

const AGORA = new Date("2026-10-17T13:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const em = (ms: number) => new Date(AGORA.getTime() + ms);

const base = {
  habilitado: true,
  validadeCertificado: em(200 * DIA),
  erroCertificado: null,
  cursores: [] as { cnpj: string; bloqueadoAte: Date | null; errosSeguidos: number }[],
  recebidasParadas: 0,
  paraAdmin: true,
};

describe("errosSeguidos", () => {
  it("conta erros a partir do mais recente, pulando as puladas", () => {
    expect(errosSeguidos([{ status: "ERRO" }, { status: "PULADA" }, { status: "ERRO" }, { status: "SUCESSO" }, { status: "ERRO" }])).toBe(2);
    expect(errosSeguidos([{ status: "SEM_NOVIDADES" }, { status: "ERRO" }])).toBe(0);
    expect(errosSeguidos([])).toBe(0);
  });
});

describe("estadoDoCursor", () => {
  const cursor = { proximaConsultaEm: null, bloqueadoAte: null, ultimaConsultaEm: em(-DIA) };

  it("nunca consultado", () => {
    expect(estadoDoCursor(null, null, AGORA)).toBe("NUNCA");
    expect(estadoDoCursor({ ...cursor, ultimaConsultaEm: null }, null, AGORA)).toBe("NUNCA");
  });

  it("bloqueio vence erro e janela", () => {
    expect(estadoDoCursor({ ...cursor, bloqueadoAte: em(1000) }, { status: "ERRO" }, AGORA)).toBe("BLOQUEADO");
  });

  it("erro na última execução", () => {
    expect(estadoDoCursor(cursor, { status: "ERRO" }, AGORA)).toBe("ERRO");
  });

  it("aguardando janela ou pronto", () => {
    expect(estadoDoCursor({ ...cursor, proximaConsultaEm: em(1000) }, { status: "SEM_NOVIDADES" }, AGORA)).toBe("AGUARDANDO");
    expect(estadoDoCursor(cursor, { status: "SUCESSO" }, AGORA)).toBe("ATIVO");
  });
});

describe("alertasDaCaptura", () => {
  it("tudo em dia: nenhum alerta", () => {
    expect(alertasDaCaptura(base, AGORA)).toEqual([]);
  });

  it("certificado perto de vencer: atenção; vencido: crítico", () => {
    expect(alertasDaCaptura({ ...base, validadeCertificado: em(10 * DIA) }, AGORA)).toMatchObject([
      { tipo: "SEFAZ_CERTIFICADO", severidade: "ATENCAO", mensagem: "Certificado A1 vence em 10 dias: renove para a captura de NF-e não parar" },
    ]);
    expect(alertasDaCaptura({ ...base, validadeCertificado: em(-DIA) }, AGORA)).toMatchObject([
      { tipo: "SEFAZ_CERTIFICADO", severidade: "CRITICA" },
    ]);
  });

  it("certificado com problema de configuração é crítico", () => {
    expect(alertasDaCaptura({ ...base, validadeCertificado: null, erroCertificado: "senha errada" }, AGORA)).toMatchObject([
      { severidade: "CRITICA", mensagem: "Captura de NF-e parada: senha errada" },
    ]);
  });

  it("bloqueio ativo e erros seguidos viram alerta crítico por CNPJ", () => {
    const a = alertasDaCaptura(
      {
        ...base,
        cursores: [
          { cnpj: "11222333000181", bloqueadoAte: em(1000), errosSeguidos: 0 },
          { cnpj: "11222333000262", bloqueadoAte: null, errosSeguidos: 3 },
          { cnpj: "11222333000343", bloqueadoAte: null, errosSeguidos: 2 },
        ],
      },
      AGORA,
    );
    expect(a.map((x) => x.id)).toEqual(["sefaz-bloqueio-11222333000181", "sefaz-erros-11222333000262"]);
  });

  it("NF-e paradas na caixa: atenção para todos; o resto só para o ADMIN", () => {
    const escritorio = alertasDaCaptura({ ...base, paraAdmin: false, recebidasParadas: 2, validadeCertificado: em(-DIA) }, AGORA);
    expect(escritorio).toMatchObject([{ tipo: "NFE_RECEBIDA", link: "/notas/recebidas", mensagem: "2 NF-e recebidas da Sefaz há mais de 7 dias sem lançar" }]);
  });

  it("captura desligada não gera alerta de certificado", () => {
    expect(alertasDaCaptura({ ...base, habilitado: false, validadeCertificado: em(-DIA) }, AGORA)).toEqual([]);
  });
});
