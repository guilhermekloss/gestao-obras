import { describe, expect, it } from "vitest";
import { avisoItensDiferemDoTotal, linhasDeConferencia } from "../conferencia-lancamento";

const base = { totalCents: 120000, somaItensCents: 120000, somaRateioBp: 10000, parcelas: 1, somaParcelasCents: 120000 };
const por = (e: Parameters<typeof linhasDeConferencia>[0]) => Object.fromEntries(linhasDeConferencia(e).map((l) => [l.id, l]));

describe("linhasDeConferencia", () => {
  it("tudo fechado: três linhas ok", () => {
    const l = linhasDeConferencia(base);
    expect(l.map((x) => x.situacao)).toEqual(["ok", "ok", "ok"]);
    expect(l[0].detalhe).toBe("Fecha com o total");
  });

  it("itens abaixo do total é aviso e diz quanto falta", () => {
    const l = por({ ...base, somaItensCents: 116000 });
    expect(l.itens.situacao).toBe("aviso");
    expect(l.itens.detalhe).toMatch(/^Faltam R\$\s40,00 do total$/);
  });

  it("itens acima do total é aviso e diz quanto passa", () => {
    const l = por({ ...base, somaItensCents: 120050 });
    expect(l.itens.situacao).toBe("aviso");
    expect(l.itens.detalhe).toMatch(/^Passam R\$\s0,50 do total$/);
  });

  it("sem total, itens e parcelas pedem o valor em vez de reclamar da diferença", () => {
    const l = por({ ...base, totalCents: 0, somaItensCents: 5000 });
    expect(l.itens.situacao).toBe("vazio");
    expect(l.itens.detalhe).toBe("Informe o valor total");
  });

  it("rateio fora de 100% é erro", () => {
    const l = por({ ...base, somaRateioBp: 9000 });
    expect(l.rateio.situacao).toBe("erro");
    expect(l.rateio.detalhe).toBe("Faltam 10,00% para 100%");
    expect(por({ ...base, somaRateioBp: 10500 }).rateio.detalhe).toBe("Passam 5,00% para 100%");
  });

  it("parcelas: vazio sem parcelas, erro quando não fecham", () => {
    expect(por({ ...base, parcelas: 0, somaParcelasCents: 0 }).parcelas.situacao).toBe("vazio");
    const erro = por({ ...base, parcelas: 2, somaParcelasCents: 100000 }).parcelas;
    expect(erro.situacao).toBe("erro");
    expect(erro.detalhe).toMatch(/^Faltam R\$\s200,00 do total$/);
    expect(por({ ...base, parcelas: 3 }).parcelas.detalhe).toBe("3 parcelas fecham com o total");
  });
});

describe("avisoItensDiferemDoTotal", () => {
  it("só avisa quando há total, há itens e eles diferem", () => {
    expect(avisoItensDiferemDoTotal({ totalCents: 100, somaItensCents: 100 })).toBeNull();
    expect(avisoItensDiferemDoTotal({ totalCents: 0, somaItensCents: 100 })).toBeNull();
    expect(avisoItensDiferemDoTotal({ totalCents: 100, somaItensCents: 0 })).toBeNull();
    expect(avisoItensDiferemDoTotal({ totalCents: 100, somaItensCents: 90 })).toMatch(/diferente do valor total/);
  });
});
