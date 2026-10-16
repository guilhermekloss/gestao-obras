import type { DocumentoLido } from "../../leitura-documento";
import type { Ancoras } from "./comum";
import type { Doc } from "./documento";

type TipoDocumento = DocumentoLido["tipo"];

type Regra = [RegExp, number];

const PONTOS: Record<Exclude<TipoDocumento, "NAO_E_DOCUMENTO">, Regra[]> = {
  NFE: [
    [/\bDANFE\b(?!\s*NFC)/, 3],
    [/DOCUMENTO\s*AUXILIAR\s*DA\s*NOTA\s*FISCAL\s*ELETRONICA/, 3],
    [/DESTINATARIO\s*\/\s*REMETENTE/, 2],
    [/CALCULO\s*DO\s*IMPOSTO/, 2],
    [/NCM\s*\/\s*SH/, 2],
    [/\bCFOP\b/, 1],
    [/NATUREZA\s*DA\s*OPERACAO/, 1],
    [/TRANSPORTADOR/, 1],
    [/\bFOLHA\s*\d/, 1],
  ],
  NFCE: [
    [/\bNFC-?E\b/, 3],
    [/NOTA\s*FISCAL\s*DE\s*CONSUMIDOR/, 3],
    [/CONSULTE\s*PELA\s*CHAVE\s*DE\s*ACESSO/, 2],
    [/VALOR\s*A\s*PAGAR/, 2],
    [/QT(?:DE|D)?\.?\s*TOTAL\s*DE\s*ITENS/, 2],
    [/\bTROCO\b/, 1],
    [/\bCONSUMIDOR\b/, 1],
  ],
  NFSE: [
    [/\bNFS-?E\b/, 3],
    [/NOTA\s*FISCAL\s*(?:ELETRONICA\s*)?DE\s*SERVICOS?/, 3],
    [/\bDANFSE\b/, 3],
    [/\bPRESTADOR\b/, 2],
    [/\bTOMADOR\b/, 2],
    [/DISCRIMINACAO\s*DOS\s*SERVICOS|DESCRICAO\s*DO\s*SERVICO/, 2],
    [/\bISSQN\b|\bISS\b/, 2],
    [/CODIGO\s*DE\s*VERIFICACAO/, 1],
    [/\bCOMPETENCIA\b/, 1],
  ],
  BOLETO: [
    [/FICHA\s*DE\s*COMPENSACAO/, 3],
    [/NOSSO\s*NUMERO/, 2],
    [/\bBENEFICIARIO\b/, 2],
    [/\bPAGADOR\b/, 2],
    [/LOCAL\s*DE\s*PAGAMENTO/, 2],
    [/VALOR\s*DO\s*DOCUMENTO/, 1],
    [/\bCEDENTE\b|\bSACADO\b/, 1],
    [/AUTENTICACAO\s*MECANICA/, 1],
  ],
  GUIA: [
    [/DOCUMENTO\s*DE\s*ARRECADACAO/, 3],
    [
      /\bDAS\s*(?:-\s*)?(?:DE\s*)?MEI\b|\bDARF\b|\bGPS\b|GUIA\s*DA\s*PREVIDENCIA|\bGFD\b|GUIA\s*DO\s*FGTS|\bDAE\b|\bGARE\b|\bDAM\b/,
      3,
    ],
    [/PERIODO\s*DE\s*APURACAO/, 2],
    [/PAGAR\s*ESTE\s*DOCUMENTO\s*ATE/, 2],
    [/CODIGO\s*DA\s*RECEITA/, 2],
    [/RECEITA\s*FEDERAL/, 1],
    [/SIMPLES\s*NACIONAL/, 1],
    [/\bCOMPETENCIA\b/, 1],
  ],
  RECIBO: [
    [/\bRECIBO\b/, 2],
    [/RECEB(?:I|EMOS)\s*(?:DO|DA|DE)\b/, 2],
    [/(?:IMPORTANCIA|QUANTIA)\s*(?:LIQUIDA\s*)?DE/, 2],
    [/REFERENTE\s*(?:A|AO|AOS|AS)\b/, 1],
    [/_{5,}/, 1],
    [
      /\d{1,2}\s*DE\s*(?:JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*DE\s*\d{4}/,
      1,
    ],
  ],
  OUTRO: [
    [
      /\bCUPOM\b|\bCOMPROVANTE\b|\bPEDIDO\b|\bORCAMENTO\b|\bEXTRATO\b|\bFATURA\b|CONTA\s*DE\s*(?:LUZ|AGUA|ENERGIA|GAS|TELEFONE)/,
      3,
    ],
    [/\bTOTAL\b/, 1],
    [/R\$/, 1],
  ],
};

export function pontuar(doc: Doc): Record<Exclude<TipoDocumento, "NAO_E_DOCUMENTO">, number> {
  const n = doc.normCompleto;
  const r = {} as Record<Exclude<TipoDocumento, "NAO_E_DOCUMENTO">, number>;
  for (const [tipo, regras] of Object.entries(PONTOS) as [Exclude<TipoDocumento, "NAO_E_DOCUMENTO">, Regra[]][]) {
    r[tipo] = regras.reduce((s, [re, p]) => s + (re.test(n) ? p : 0), 0);
  }
  // "Recibo do Pagador" faz parte do boleto.
  const topo = doc.linhas
    .slice(0, 5)
    .map((l) => l.norm)
    .join("\n");
  if (/\bRECIBO\b(?!\s*DO\s*PAGADOR|\s*DO\s*SACADO)/.test(topo)) r.RECIBO += 2;
  if (/RECIBO\s*DO\s*(?:PAGADOR|SACADO)/.test(n)) r.RECIBO = Math.max(0, r.RECIBO - 2);
  // DANFE de NFC-e não é NF-e
  if (/NFC-?E|CONSUMIDOR\s*ELETRONICA/.test(n)) r.NFE = Math.max(0, r.NFE - 3);
  return r;
}

// Segmento 1 (prefeituras) ou 5 (órgãos governamentais) da arrecadação = tributo.
function tipoArrecadacao(segmento: string, doc: Doc): TipoDocumento {
  if (segmento === "5" || segmento === "1") return "GUIA";
  if (/IMPOSTO|TRIBUTO|\bTAXA\b|\bMULTA\b|\bDARF\b|\bIPTU\b|\bIPVA\b|DETRAN|PREFEITURA/.test(doc.normCompleto))
    return "GUIA";
  return "OUTRO";
}

export function classificar(doc: Doc, ancoras: Ancoras): TipoDocumento {
  if (ancoras.chave) {
    if (ancoras.modelo === "55") return "NFE";
    if (ancoras.modelo === "65") return "NFCE";
  }
  if (ancoras.chaveNfse || /\bDANFSE\b/.test(doc.normCompleto)) return "NFSE";

  const pontos = pontuar(doc);
  if (ancoras.pagamento?.tipo === "BOLETO" && pontos.NFE < 5 && pontos.NFSE < 5) return "BOLETO";
  if (ancoras.pagamento?.tipo === "ARRECADACAO") {
    return pontos.GUIA >= 3 ? "GUIA" : tipoArrecadacao(ancoras.pagamento.arrecadacao.segmento, doc);
  }

  const util = doc.textoCompleto.replace(/[^0-9A-Za-z]/g, "").length;
  const [melhor, maximo] = (Object.entries(pontos) as [TipoDocumento, number][]).reduce(
    (m, e) => (e[1] > m[1] ? e : m),
    ["OUTRO", -1] as [TipoDocumento, number],
  );
  if (util < 40) return "NAO_E_DOCUMENTO";
  const temDocumento = ancoras.documentos.length > 0;
  if (maximo >= 3) {
    if (melhor === "OUTRO" && !ancoras.temValor) return "NAO_E_DOCUMENTO";
    return melhor;
  }
  if (ancoras.temValor && (ancoras.temData || temDocumento || maximo >= 1)) return "OUTRO";
  return "NAO_E_DOCUMENTO";
}
