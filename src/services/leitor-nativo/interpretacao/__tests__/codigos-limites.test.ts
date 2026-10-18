import { describe, expect, it } from "vitest";
import {
  arrecadacaoDaLinha,
  arrecadacaoDasBarras,
  boletoDaLinha,
  boletoDasBarras,
  chaveDosCodigos,
  chaveNfseNoTexto,
  chaveNoTexto,
  codigoPagamentoDosCodigos,
  codigoPagamentoNoTexto,
  lerQrNfce,
  vencimentoDoFator,
} from "../codigos";
import { CHAVE_NFCE, CHAVE_NFE, CHAVE_NFSE, LINHA_BOLETO, LINHA_DAS } from "./fixtures";

const BARRAS_BOLETO = "34191161500001234561091234567821234567890000";
const BARRAS_DAS = "85800000004567803280720260912345678901234567";
const grupos = (chave: string, sep = " ") => (chave.match(/.{1,4}/g) ?? []).join(sep);
const codigo = (texto: string, formato: "QR" | "CODE128" | "ITF" | "OUTRO" = "CODE128") => ({ formato, texto, pagina: 1 });

describe("chaveNoTexto", () => {
  it("11 grupos de 4, contígua, com ponto ou espaço duplo entre grupos", () => {
    const esperado = { chave: CHAVE_NFE, valida: true };
    expect(chaveNoTexto(grupos(CHAVE_NFE))).toEqual(esperado);
    expect(chaveNoTexto(CHAVE_NFE)).toEqual(esperado);
    expect(chaveNoTexto(grupos(CHAVE_NFE, "."))).toEqual(esperado);
    expect(chaveNoTexto(grupos(CHAVE_NFE, "  "))).toEqual(esperado);
    expect(chaveNoTexto(grupos(CHAVE_NFE, " . "))).toBeNull();
    expect(chaveNoTexto(grupos(CHAVE_NFE, "   "))).toBeNull();
  });

  it("no meio de outro texto, desde que não colada a letra ou dígito", () => {
    expect(chaveNoTexto(`Chave: ${grupos(CHAVE_NFE)} fim`)?.chave).toBe(CHAVE_NFE);
    expect(chaveNoTexto(`x${CHAVE_NFE}`)).toBeNull();
    expect(chaveNoTexto(`${CHAVE_NFE}9`)).toBeNull();
    expect(chaveNoTexto(`${CHAVE_NFE}x`)).toBeNull();
  });

  it("tamanho errado ou poucos dígitos: nada", () => {
    expect(chaveNoTexto(CHAVE_NFE.slice(0, 43))).toBeNull();
    expect(chaveNoTexto(grupos(CHAVE_NFE).slice(0, 40))).toBeNull();
    expect(chaveNoTexto("ABCD ".repeat(10) + "ABCD")).toBeNull();
    expect(chaveNoTexto("")).toBeNull();
  });

  it("dígito errado: devolvida como inválida, só se for toda numérica; a primeira válida vence", () => {
    const errada = CHAVE_NFE.slice(0, 43) + "9";
    expect(chaveNoTexto(errada)).toEqual({ chave: errada, valida: false });
    expect(chaveNoTexto(`${errada} e ${CHAVE_NFE}`)).toEqual({ chave: CHAVE_NFE, valida: true });
    expect(chaveNoTexto(`${CHAVE_NFE} e ${errada}`)).toEqual({ chave: CHAVE_NFE, valida: true });
    expect(chaveNoTexto(`${errada} e ${CHAVE_NFCE}`)).toEqual({ chave: CHAVE_NFCE, valida: true });
  });

  it("a primeira chave inválida é a devolvida quando nenhuma fecha", () => {
    const e1 = CHAVE_NFE.slice(0, 43) + "9";
    const e2 = CHAVE_NFCE.slice(0, 43) + "9";
    expect(chaveNoTexto(`${e1} ${e2}`)).toEqual({ chave: e1, valida: false });
  });
});

describe("chaveNfseNoTexto", () => {
  it("50 dígitos contíguos, em grupos, com pontos", () => {
    expect(chaveNfseNoTexto(CHAVE_NFSE)).toBe(CHAVE_NFSE);
    expect(chaveNfseNoTexto(grupos(CHAVE_NFSE))).toBe(CHAVE_NFSE);
    expect(chaveNfseNoTexto(grupos(CHAVE_NFSE, "."))).toBe(CHAVE_NFSE);
    expect(chaveNfseNoTexto(`Chave de acesso: ${grupos(CHAVE_NFSE)}.`)).toBe(CHAVE_NFSE);
  });

  it("começa no meio da corrida: palavras antes não atrapalham", () => {
    expect(chaveNfseNoTexto(`NFS-e numero 12 ${CHAVE_NFSE}`)).toBe(CHAVE_NFSE);
  });

  it("49 ou 51 dígitos, dígito errado ou texto sem chave: nada", () => {
    expect(chaveNfseNoTexto(CHAVE_NFSE.slice(0, 49))).toBeNull();
    expect(chaveNfseNoTexto(CHAVE_NFSE + "1")).toBeNull();
    expect(chaveNfseNoTexto(CHAVE_NFSE.slice(0, 49) + "9")).toBeNull();
    expect(chaveNfseNoTexto("")).toBeNull();
    expect(chaveNfseNoTexto("sem chave aqui")).toBeNull();
  });
});

describe("lerQrNfce", () => {
  const chave = CHAVE_NFCE;

  it("versão 2 (online): só chave, versão e ambiente", () => {
    expect(lerQrNfce(`https://x/qrcode?p=${chave}|2|1|1|ABCDEF`)).toEqual({
      chave,
      versao: "2",
      ambiente: "1",
      dia: null,
      valor: null,
      destinatario: null,
    });
  });

  it("versão 3 (offline, 8 campos ou mais): dia, valor e destinatário", () => {
    expect(lerQrNfce(`https://x/qr?p=${chave}|3|1|15|98.50|2|12345678909|QVNTSU5B`)).toEqual({
      chave,
      versao: "3",
      ambiente: "1",
      dia: 15,
      valor: 98.5,
      destinatario: "12345678909",
    });
  });

  it("destinatário só nos tipos 1 e 2, só na versão 3, e só dígitos", () => {
    const qr = (v: string, tipo: string, doc: string) => lerQrNfce(`https://x/qr?p=${chave}|${v}|1|15|98.50|${tipo}|${doc}|ASS`);
    expect(qr("3", "1", "123.456.789-09")?.destinatario).toBe("12345678909");
    expect(qr("3", "2", "12345678909")?.destinatario).toBe("12345678909");
    expect(qr("3", "3", "12345678909")?.destinatario).toBeNull();
    expect(qr("2", "2", "12345678909")?.destinatario).toBeNull();
    expect(qr("3", "2", "")?.destinatario).toBeNull();
  });

  it("dia com 1 ou 2 dígitos; valor positivo com ponto decimal, arredondado", () => {
    const qr = (dia: string, valor: string) => lerQrNfce(`https://x/qr?p=${chave}|3|1|${dia}|${valor}|0|0|ASS`);
    expect(qr("5", "10.005")).toMatchObject({ dia: 5, valor: 10.01 });
    expect(qr("31", "1")).toMatchObject({ dia: 31, valor: 1 });
    expect(qr("123", "10")).toMatchObject({ dia: null });
    expect(qr("ab", "10")).toMatchObject({ dia: null });
    expect(qr("", "10")).toMatchObject({ dia: null });
    expect(qr("5", "0")).toMatchObject({ valor: null });
    expect(qr("5", "-3")).toMatchObject({ valor: null });
    expect(qr("5", "abc")).toMatchObject({ valor: null });
  });

  it("com menos de 8 campos não há dia nem valor", () => {
    expect(lerQrNfce(`https://x/qr?p=${chave}|3|1|15|98.50|2|12345678909`)).toMatchObject({ dia: null, valor: null, destinatario: null });
  });

  it("chave com letras de OCR, minúsculas e separadores é limpa; chave inválida: nada", () => {
    expect(lerQrNfce(`https://x/qr?p=${chave.toLowerCase()}|2|1`)?.chave).toBe(chave);
    expect(lerQrNfce(`https://x/qr?p=${chave.slice(0, 43)}9|2|1`)).toBeNull();
    expect(lerQrNfce(`https://x/qr?P=${chave}|2|1`)?.chave).toBe(chave);
    expect(lerQrNfce(`https://x/qr?a=1&p=${chave}|2|1`)?.chave).toBe(chave);
  });

  it("URL codificada é decodificada; codificação quebrada é usada como veio", () => {
    expect(lerQrNfce(`https://x/qr?p=${chave}%7C2%7C1`)).toMatchObject({ versao: "2", ambiente: "1" });
    expect(lerQrNfce(`  https://x/qr?p=${chave}|2|1  `)?.chave).toBe(chave);
    expect(lerQrNfce(`https://x/qr?p=${chave}|2|1%ZZ`)).toMatchObject({ chave });
  });

  it("formato antigo (chNFe=): valor, destinatário e ambiente opcionais", () => {
    expect(lerQrNfce(`https://x/qr?chNFe=${chave}&nVersao=100&tpAmb=1&vNF=98.50&cDest=12345678909`)).toEqual({
      chave,
      versao: "1",
      ambiente: "1",
      dia: null,
      valor: 98.5,
      destinatario: "12345678909",
    });
    expect(lerQrNfce(`https://x/qr?chNFe=${chave}`)).toEqual({ chave, versao: "1", ambiente: null, dia: null, valor: null, destinatario: null });
    expect(lerQrNfce(`https://x/qr?CHNFE=${chave.toLowerCase()}&VNF=10.005`)).toMatchObject({ chave, valor: 10.01 });
    expect(lerQrNfce(`https://x/qr?chNFe=${chave.slice(0, 43)}9`)).toBeNull();
    expect(lerQrNfce(`https://x/qr?chNFe=${chave}1`)).toMatchObject({ chave });
  });

  it("sem chave nenhuma: nada", () => {
    expect(lerQrNfce("https://x/qr")).toBeNull();
    expect(lerQrNfce("")).toBeNull();
  });
});

describe("chaveDosCodigos", () => {
  it("QR Code: pela marca do formato ou pelo texto com 'p=' ou 'chNFe='", () => {
    const qr = `https://x/qr?p=${CHAVE_NFCE}|2|1`;
    expect(chaveDosCodigos([codigo(qr, "QR")])).toMatchObject({ chave: CHAVE_NFCE, qr: { versao: "2" } });
    expect(chaveDosCodigos([codigo(qr, "OUTRO")])?.chave).toBe(CHAVE_NFCE);
    expect(chaveDosCodigos([codigo(`chNFe=${CHAVE_NFCE}`, "OUTRO")])?.chave).toBe(CHAVE_NFCE);
    expect(chaveDosCodigos([codigo("sem nada", "QR")])).toBeNull();
  });

  it("código de barras com a chave de 44 posições", () => {
    expect(chaveDosCodigos([codigo(CHAVE_NFE)])).toEqual({ chave: CHAVE_NFE, qr: null });
    expect(chaveDosCodigos([codigo(grupos(CHAVE_NFE))])).toEqual({ chave: CHAVE_NFE, qr: null });
    expect(chaveDosCodigos([codigo(CHAVE_NFE.slice(0, 43) + "9")])).toBeNull();
    expect(chaveDosCodigos([codigo(CHAVE_NFE.slice(0, 40))])).toBeNull();
    expect(chaveDosCodigos([])).toBeNull();
  });

  it("código de boleto ou de arrecadação de 44 posições não é chave", () => {
    expect(chaveDosCodigos([codigo(BARRAS_BOLETO)])).toBeNull();
    expect(chaveDosCodigos([codigo(BARRAS_DAS)])).toBeNull();
  });

  it("o QR vale mais que a chave de barras, mesmo que venha depois", () => {
    const qr = codigo(`https://x/qr?p=${CHAVE_NFCE}|2|1`, "QR");
    expect(chaveDosCodigos([codigo(CHAVE_NFE), qr])?.chave).toBe(CHAVE_NFCE);
  });
});

describe("vencimentoDoFator", () => {
  it("fator inválido: nada", () => {
    for (const f of [0, -1, 1.5, NaN, Infinity]) expect(vencimentoDoFator(f)).toBeNull();
  });

  it("fator abaixo de 1000 conta a partir de 07/10/1997", () => {
    expect(vencimentoDoFator(1)).toBe("1997-10-08");
    expect(vencimentoDoFator(999)).toBe("2000-07-02");
    expect(vencimentoDoFator(999, "2026-01-01")).toBe("2000-07-02");
  });

  it("sem referência, vale o ciclo novo (a partir de 22/02/2025)", () => {
    expect(vencimentoDoFator(1000)).toBe("2025-02-22");
    expect(vencimentoDoFator(1615)).toBe("2026-10-30");
    expect(vencimentoDoFator(1615, null)).toBe("2026-10-30");
    expect(vencimentoDoFator(1615, "")).toBe("2026-10-30");
  });

  it("com referência, escolhe a data mais próxima entre o ciclo antigo e o novo", () => {
    expect(vencimentoDoFator(1615, "2026-09-15")).toBe("2026-10-30");
    expect(vencimentoDoFator(1615, "2002-03-01")).toBe("2002-03-10");
    expect(vencimentoDoFator(9999, "2025-02-01")).toBe("2025-02-21");
    expect(vencimentoDoFator(1000, "2025-03-01")).toBe("2025-02-22");
    expect(vencimentoDoFator(1000, "1999-01-01")).toBe("2000-07-03");
  });
});

describe("boleto de cobrança", () => {
  it("barras: banco, fator, valor e linha vazia", () => {
    expect(boletoDasBarras(BARRAS_BOLETO)).toEqual({ barras: BARRAS_BOLETO, linha: null, banco: "341", fator: 1615, valor: 1234.56 });
  });

  it("barras zeradas no valor: valor nulo", () => {
    const sem = BARRAS_BOLETO.slice(0, 9) + "0000000000" + BARRAS_BOLETO.slice(19);
    expect(boletoDasBarras(sem)).toBeNull();
  });

  it("barras inválidas: não é número de 44, começa com 8, moeda diferente de 9, DV errado", () => {
    expect(boletoDasBarras(BARRAS_BOLETO.slice(0, 43))).toBeNull();
    expect(boletoDasBarras(BARRAS_BOLETO + "0")).toBeNull();
    expect(boletoDasBarras("x" + BARRAS_BOLETO.slice(1))).toBeNull();
    expect(boletoDasBarras("8" + BARRAS_BOLETO.slice(1))).toBeNull();
    expect(boletoDasBarras(BARRAS_BOLETO.slice(0, 3) + "8" + BARRAS_BOLETO.slice(4))).toBeNull();
    expect(boletoDasBarras(BARRAS_BOLETO.slice(0, 4) + "9" + BARRAS_BOLETO.slice(5))).toBeNull();
  });

  it("linha digitável de 47 dígitos, com ou sem pontuação", () => {
    const esperado = { barras: BARRAS_BOLETO, linha: LINHA_BOLETO.replace(/\D/g, ""), banco: "341", fator: 1615, valor: 1234.56 };
    expect(boletoDaLinha(LINHA_BOLETO)).toEqual(esperado);
    expect(boletoDaLinha(LINHA_BOLETO.replace(/\D/g, ""))).toEqual(esperado);
  });

  it("DV de cada campo é conferido", () => {
    const d = LINHA_BOLETO.replace(/\D/g, "");
    const troca = (i: number) => d.slice(0, i) + String((Number(d[i]) + 1) % 10) + d.slice(i + 1);
    expect(boletoDaLinha(troca(9))).toBeNull();
    expect(boletoDaLinha(troca(20))).toBeNull();
    expect(boletoDaLinha(troca(31))).toBeNull();
    expect(boletoDaLinha(troca(32))).toBeNull();
    expect(boletoDaLinha(d.slice(0, 46))).toBeNull();
    expect(boletoDaLinha(d + "0")).toBeNull();
    expect(boletoDaLinha("")).toBeNull();
  });
});

describe("arrecadação", () => {
  it("barras: segmento, identificador do valor, valor e órgão", () => {
    expect(arrecadacaoDasBarras(BARRAS_DAS)).toEqual({
      barras: BARRAS_DAS,
      linha: null,
      segmento: "5",
      identificadorValor: "8",
      valor: 456.78,
      orgao: "0328",
    });
  });

  it("valor de referência (identificador 7 ou 9) não é valor em reais", () => {
    // o DV precisa fechar com o outro módulo (10 para 6/7, 11 para 8/9)
    const comId = (id: string) => {
      for (let dv = 0; dv < 10; dv++) {
        const barras = BARRAS_DAS.slice(0, 2) + id + String(dv) + BARRAS_DAS.slice(4);
        const a = arrecadacaoDasBarras(barras);
        if (a) return a;
      }
      return null;
    };
    expect(comId("6")?.valor).not.toBeNull();
    expect(comId("8")?.valor).toBe(456.78);
    expect(comId("7")).toMatchObject({ identificadorValor: "7", valor: null });
    expect(comId("9")).toMatchObject({ identificadorValor: "9", valor: null });
  });

  it("barras inválidas: tamanho, primeiro dígito, identificador desconhecido, DV errado", () => {
    expect(arrecadacaoDasBarras(BARRAS_DAS.slice(0, 43))).toBeNull();
    expect(arrecadacaoDasBarras(BARRAS_DAS + "0")).toBeNull();
    expect(arrecadacaoDasBarras("9" + BARRAS_DAS.slice(1))).toBeNull();
    expect(arrecadacaoDasBarras(BARRAS_DAS.slice(0, 2) + "5" + BARRAS_DAS.slice(3))).toBeNull();
    expect(arrecadacaoDasBarras(BARRAS_DAS.slice(0, 3) + "1" + BARRAS_DAS.slice(4))).toBeNull();
    expect(arrecadacaoDasBarras("8" + "x".repeat(43))).toBeNull();
  });

  it("linha digitável de 48 dígitos", () => {
    const esperado = { barras: BARRAS_DAS, linha: LINHA_DAS.replace(/\D/g, ""), segmento: "5", identificadorValor: "8", valor: 456.78, orgao: "0328" };
    expect(arrecadacaoDaLinha(LINHA_DAS)).toEqual(esperado);
    expect(arrecadacaoDaLinha(LINHA_DAS.replace(/\D/g, ""))).toEqual(esperado);
  });

  it("DV de cada bloco é conferido; tamanho e primeiro dígito também", () => {
    const d = LINHA_DAS.replace(/\D/g, "");
    const troca = (i: number) => d.slice(0, i) + String((Number(d[i]) + 1) % 10) + d.slice(i + 1);
    for (const i of [11, 23, 35, 47]) expect(arrecadacaoDaLinha(troca(i))).toBeNull();
    expect(arrecadacaoDaLinha(d.slice(0, 47))).toBeNull();
    expect(arrecadacaoDaLinha(d + "0")).toBeNull();
    expect(arrecadacaoDaLinha("9" + d.slice(1))).toBeNull();
    expect(arrecadacaoDaLinha(d.slice(0, 2) + "5" + d.slice(3))).toBeNull();
    expect(arrecadacaoDaLinha("")).toBeNull();
  });
});

describe("codigoPagamentoNoTexto", () => {
  it("acha o boleto e a arrecadação no meio do texto", () => {
    expect(codigoPagamentoNoTexto(`Linha digitável ${LINHA_BOLETO} fim`)).toMatchObject({ tipo: "BOLETO", boleto: { banco: "341", valor: 1234.56 } });
    expect(codigoPagamentoNoTexto(`Código ${LINHA_DAS}`)).toMatchObject({ tipo: "ARRECADACAO", arrecadacao: { segmento: "5", valor: 456.78 } });
  });

  it("separadores variados e letras que o OCR confunde com dígitos", () => {
    const solto = LINHA_BOLETO.replace(/\D/g, "");
    expect(codigoPagamentoNoTexto(solto)?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace(/ /g, " - "))?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace(/0/g, "O"))?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace(/0/g, "o"))?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace(/1/g, "l"))?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace(/1/g, "I"))?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace(/1/g, "|"))?.tipo).toBe("BOLETO");
  });

  it("o código pode vir depois de dígitos soltos, desde que a janela fecha", () => {
    expect(codigoPagamentoNoTexto(`12345 ${LINHA_BOLETO}`)?.tipo).toBe("BOLETO");
    expect(codigoPagamentoNoTexto(`${LINHA_BOLETO} 999`)?.tipo).toBe("BOLETO");
  });

  it("arrecadação de 48 dígitos vem antes da janela de boleto; começando por outro dígito vai direto ao boleto", () => {
    expect(codigoPagamentoNoTexto(LINHA_DAS.replace(/\D/g, ""))?.tipo).toBe("ARRECADACAO");
  });

  it("sem código válido: nada", () => {
    expect(codigoPagamentoNoTexto("")).toBeNull();
    expect(codigoPagamentoNoTexto("texto qualquer")).toBeNull();
    expect(codigoPagamentoNoTexto(LINHA_BOLETO.replace("34191.09123", "34191.09124"))).toBeNull();
    expect(codigoPagamentoNoTexto("1".repeat(41))).toBeNull();
  });
});

describe("codigoPagamentoDosCodigos", () => {
  it("barras de 44 dígitos: arrecadação ou boleto", () => {
    expect(codigoPagamentoDosCodigos([codigo(BARRAS_BOLETO)])).toMatchObject({ tipo: "BOLETO", boleto: { barras: BARRAS_BOLETO } });
    expect(codigoPagamentoDosCodigos([codigo(BARRAS_DAS)])).toMatchObject({ tipo: "ARRECADACAO", arrecadacao: { barras: BARRAS_DAS } });
    expect(codigoPagamentoDosCodigos([codigo(grupos(BARRAS_BOLETO))])).toMatchObject({ tipo: "BOLETO" });
  });

  it("linha de 47 ou 48 dígitos lida como texto", () => {
    expect(codigoPagamentoDosCodigos([codigo(LINHA_BOLETO.replace(/\D/g, ""), "ITF")])?.tipo).toBe("BOLETO");
    expect(codigoPagamentoDosCodigos([codigo(LINHA_DAS.replace(/\D/g, ""), "ITF")])?.tipo).toBe("ARRECADACAO");
  });

  it("código que não é de pagamento, ou vazio, é ignorado; vale o primeiro que servir", () => {
    expect(codigoPagamentoDosCodigos([])).toBeNull();
    expect(codigoPagamentoDosCodigos([codigo(CHAVE_NFE)])).toBeNull();
    expect(codigoPagamentoDosCodigos([codigo("12345")])).toBeNull();
    expect(codigoPagamentoDosCodigos([codigo(CHAVE_NFE), codigo(BARRAS_DAS)])?.tipo).toBe("ARRECADACAO");
    expect(codigoPagamentoDosCodigos([codigo(BARRAS_BOLETO), codigo(BARRAS_DAS)])?.tipo).toBe("BOLETO");
  });
});
