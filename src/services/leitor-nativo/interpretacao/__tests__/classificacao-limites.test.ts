import { describe, expect, it } from "vitest";
import { classificar, pontuar } from "../classificacao";
import type { Ancoras } from "../comum";
import { construirDoc } from "../documento";
import { montarTexto } from "./auxiliar";

const doc = (texto: string) => construirDoc(montarTexto(texto));
const FILLER = "ALFA BRAVO CHARLIE DELTA ECO FOXTROT GOLF HOTEL INDIA JULIETT";

function ancoras(extra: Partial<Ancoras> = {}): Ancoras {
  return {
    chave: null,
    chaveInvalida: null,
    modelo: null,
    qr: null,
    chaveNfse: null,
    pagamento: null,
    documentos: [],
    temValor: false,
    temData: false,
    ...extra,
  };
}
const arrecadacao = (segmento: string) => ({ tipo: "ARRECADACAO", arrecadacao: { segmento } }) as unknown as Ancoras["pagamento"];
const boleto = { tipo: "BOLETO", boleto: {} } as unknown as Ancoras["pagamento"];
const unDocumento = [{ linha: 0 }] as unknown as Ancoras["documentos"];

describe("pontuar: recibo", () => {
  it("RECIBO nas cinco primeiras linhas vale 2 a mais", () => {
    expect(pontuar(doc(`RECIBO\n${FILLER}`)).RECIBO).toBe(4);
    expect(pontuar(doc(`A\nB\nC\nD\nRECIBO`)).RECIBO).toBe(4);
  });

  it("RECIBO a partir da sexta linha vale só os 2 do texto", () => {
    expect(pontuar(doc(`A\nB\nC\nD\nE\nRECIBO`)).RECIBO).toBe(2);
  });

  it("'Recibo do Pagador/Sacado' no topo não conta como recibo e tira 2 do total", () => {
    for (const rotulo of ["RECIBO DO PAGADOR", "RECIBO  DO  PAGADOR", "RECIBO DO SACADO", "Recibo  do  Sacado"]) {
      // 2 (palavra) + 2 (RECEBI DE) − 2 (recibo do pagador) = 2; sem os 2 do topo
      expect(pontuar(doc(`${rotulo}\nRECEBI DE FULANO`)).RECIBO).toBe(2);
    }
  });

  it("recibo do pagador no meio do texto também tira 2", () => {
    expect(pontuar(doc(`A\nB\nC\nD\nE\nF\nRECIBO DO PAGADOR\nRECEBI DE FULANO`)).RECIBO).toBe(2);
  });
});

describe("pontuar: DANFE de NFC-e não é NF-e", () => {
  const NFE_4 = "DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA\nCFOP";

  it("sem menção a NFC-e, os pontos da NF-e ficam", () => {
    expect(pontuar(doc(NFE_4)).NFE).toBe(4);
  });

  it.each(["NFCE", "NFC-E", "CONSUMIDOR ELETRONICA", "CONSUMIDOR   ELETRONICA"])("%s tira 3 da NF-e", (marca) => {
    expect(pontuar(doc(`${NFE_4}\n${marca}`)).NFE).toBe(1);
  });

  it("não fica negativa", () => {
    expect(pontuar(doc("CFOP\nNFCE")).NFE).toBe(0);
  });
});

describe("classificar: âncoras fortes", () => {
  it("chave de modelo 55 é NF-e e de modelo 65 é NFC-e", () => {
    expect(classificar(doc(FILLER), ancoras({ chave: "1".repeat(44), modelo: "55" }))).toBe("NFE");
    expect(classificar(doc(FILLER), ancoras({ chave: "1".repeat(44), modelo: "65" }))).toBe("NFCE");
  });

  it("modelo sem chave, ou chave de outro modelo, não decide", () => {
    expect(classificar(doc(FILLER), ancoras({ modelo: "55" }))).toBe("NAO_E_DOCUMENTO");
    expect(classificar(doc(FILLER), ancoras({ modelo: "65" }))).toBe("NAO_E_DOCUMENTO");
    expect(classificar(doc(FILLER), ancoras({ chave: "1".repeat(44), modelo: "57" }))).toBe("NAO_E_DOCUMENTO");
  });

  it("chave de NFS-e, ou a palavra DANFSE, basta para ser NFS-e", () => {
    expect(classificar(doc(FILLER), ancoras({ chaveNfse: "1".repeat(50) }))).toBe("NFSE");
    expect(classificar(doc(`${FILLER}\nDANFSE`), ancoras())).toBe("NFSE");
  });
});

describe("classificar: boleto", () => {
  it("código de boleto vence quando NF-e e NFS-e têm menos de 5 pontos", () => {
    expect(classificar(doc(`DANFE\nCFOP\n${FILLER}`), ancoras({ pagamento: boleto }))).toBe("BOLETO");
    expect(classificar(doc(`NFSE\nCOMPETENCIA\n${FILLER}`), ancoras({ pagamento: boleto }))).toBe("BOLETO");
  });

  it("com 5 pontos de NF-e ou de NFS-e, o boleto cede", () => {
    expect(classificar(doc(`DANFE\nNCM/SH\n${FILLER}`), ancoras({ pagamento: boleto }))).toBe("NFE");
    expect(classificar(doc(`NFSE\nPRESTADOR\n${FILLER}`), ancoras({ pagamento: boleto }))).toBe("NFSE");
  });
});

describe("classificar: arrecadação", () => {
  it("3 pontos de guia bastam, qualquer que seja o segmento", () => {
    expect(classificar(doc(`DOCUMENTO DE ARRECADACAO\n${FILLER}`), ancoras({ pagamento: arrecadacao("8") }))).toBe("GUIA");
  });

  it("com 2 pontos, decide o segmento: 1 (prefeituras) e 5 (governo) são tributo", () => {
    const d = doc(`PERIODO DE APURACAO\n${FILLER}`);
    expect(classificar(d, ancoras({ pagamento: arrecadacao("1") }))).toBe("GUIA");
    expect(classificar(d, ancoras({ pagamento: arrecadacao("5") }))).toBe("GUIA");
    expect(classificar(d, ancoras({ pagamento: arrecadacao("2") }))).toBe("OUTRO");
  });

  it.each(["IMPOSTO", "TRIBUTO", "TAXA", "MULTA", "IPTU", "IPVA", "DETRAN", "PREFEITURA"])(
    "outro segmento com a palavra %s no texto também é guia",
    (palavra) => {
      expect(classificar(doc(`PERIODO DE APURACAO\n${palavra}\n${FILLER}`), ancoras({ pagamento: arrecadacao("2") }))).toBe("GUIA");
    },
  );

  it("palavra solta dentro de outra não conta (TAXAS, MULTAS não são TAXA/MULTA)", () => {
    const d = doc(`PERIODO DE APURACAO\nTAXAS MULTAS\n${FILLER}`);
    expect(classificar(d, ancoras({ pagamento: arrecadacao("2") }))).toBe("OUTRO");
  });
});

describe("classificar: pontuação", () => {
  it("texto com menos de 40 letras e dígitos não é documento; com 40 já vale", () => {
    const comTotal = (n: number) => `ORCAMENTO ${"X".repeat(n)}`;
    expect(classificar(doc(comTotal(30)), ancoras({ temValor: true }))).toBe("NAO_E_DOCUMENTO");
    expect(classificar(doc(comTotal(31)), ancoras({ temValor: true }))).toBe("OUTRO");
  });

  it("só letras e dígitos entram na conta (espaços e pontuação não)", () => {
    const d = doc(`ORCAMENTO ${"X.".repeat(30)}`);
    expect(classificar(d, ancoras({ temValor: true }))).toBe("NAO_E_DOCUMENTO");
  });

  it("3 pontos já decidem o tipo", () => {
    expect(classificar(doc(`NFSE\n${FILLER}`), ancoras())).toBe("NFSE");
  });

  it("2 pontos não decidem sozinhos", () => {
    expect(classificar(doc(`PRESTADOR\n${FILLER}`), ancoras())).toBe("NAO_E_DOCUMENTO");
  });

  it("empate fica com o primeiro tipo da lista", () => {
    expect(classificar(doc(`NFCE\nNFSE\n${FILLER}`), ancoras())).toBe("NFCE");
  });

  it("tipo OUTRO só vale se o texto tem valor", () => {
    const d = doc(`ORCAMENTO\n${FILLER}`);
    expect(classificar(d, ancoras({ temValor: false }))).toBe("NAO_E_DOCUMENTO");
    expect(classificar(d, ancoras({ temValor: true }))).toBe("OUTRO");
  });
});

describe("classificar: pontuação fraca", () => {
  it("valor mais data, ou valor mais número de documento, ou valor mais 1 ponto, é OUTRO", () => {
    expect(classificar(doc(FILLER), ancoras({ temValor: true, temData: true }))).toBe("OUTRO");
    expect(classificar(doc(FILLER), ancoras({ temValor: true, documentos: unDocumento }))).toBe("OUTRO");
    expect(classificar(doc(`TOTAL\n${FILLER}`), ancoras({ temValor: true }))).toBe("OUTRO");
  });

  it("valor sozinho, sem nenhum outro sinal, não basta", () => {
    expect(classificar(doc(FILLER), ancoras({ temValor: true }))).toBe("NAO_E_DOCUMENTO");
  });

  it("sem valor, nem data e número de documento bastam", () => {
    expect(classificar(doc(`TOTAL\n${FILLER}`), ancoras({ temData: true, documentos: unDocumento }))).toBe("NAO_E_DOCUMENTO");
  });
});
