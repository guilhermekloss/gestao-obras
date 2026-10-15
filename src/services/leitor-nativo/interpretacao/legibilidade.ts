/**
 * Legibilidade (BOA / PARCIAL / RUIM) a partir da confiança do OCR, da
 * cobertura dos campos essenciais de cada tipo e da consistência entre
 * eles (DVs, somas).
 */
import type { DocumentoLido } from "../../leitura-documento";
import { documentoValido } from "./digitos";
import type { Doc } from "./documento";

/** Confiança média 0..1 (camada de texto do PDF = 1). */
export function confianca(doc: Doc): number {
  if (doc.confiancaMedia !== null && doc.confiancaMedia !== undefined) {
    // aceita também a escala 0..100 do Tesseract
    return doc.confiancaMedia > 1 ? doc.confiancaMedia / 100 : doc.confiancaMedia;
  }
  if (doc.origem === "pdf-texto") return 1;
  const comConf = doc.linhas.filter((l) => l.confianca !== null);
  if (comConf.length === 0) return 0.8;
  const peso = comConf.reduce((s, l) => s + l.texto.length, 0);
  const media = comConf.reduce((s, l) => s + (l.confianca ?? 0) * l.texto.length, 0) / (peso || 1);
  return media > 1 ? media / 100 : media;
}

/** Fração dos campos essenciais do tipo que foram encontrados. */
export function cobertura(lido: DocumentoLido, temCodigoPagamento: boolean): number {
  const vencimento = lido.parcelas.some((p) => p.vencimento);
  const campos: boolean[] = (() => {
    switch (lido.tipo) {
      case "NFE":
        return [
          !!lido.chaveAcesso,
          !!lido.emitente.documento,
          !!lido.numero,
          !!lido.dataEmissao,
          lido.valorTotal !== null,
          lido.itens.length > 0,
        ];
      case "NFCE":
        return [
          !!lido.chaveAcesso,
          !!lido.emitente.documento,
          !!lido.dataEmissao,
          lido.valorTotal !== null,
          lido.itens.length > 0,
        ];
      case "NFSE":
        return [!!lido.numero, !!lido.emitente.documento, !!lido.dataEmissao, lido.valorTotal !== null];
      case "BOLETO":
        return [temCodigoPagamento, lido.valorTotal !== null, vencimento, !!lido.emitente.nome];
      case "GUIA":
        return [temCodigoPagamento, lido.valorTotal !== null, vencimento, !!lido.destinatario.documento];
      case "RECIBO":
        return [lido.valorTotal !== null, !!lido.dataEmissao, !!lido.emitente.nome];
      case "OUTRO":
        return [lido.valorTotal !== null, !!lido.dataEmissao, !!(lido.emitente.nome || lido.emitente.documento)];
      default:
        return [true];
    }
  })();
  return campos.filter(Boolean).length / campos.length;
}

const perto = (a: number, b: number) => Math.abs(a - b) < 0.015;

/** Os validadores aplicáveis passaram? (DV dos documentos, parcelas × total, itens × total) */
export function consistente(lido: DocumentoLido): boolean {
  if (lido.emitente.documento && !documentoValido(lido.emitente.documento)) return false;
  if (lido.destinatario.documento && !documentoValido(lido.destinatario.documento)) return false;
  const total = lido.valorTotal;
  if (total !== null && lido.parcelas.length > 0) {
    const soma = lido.parcelas.reduce((s, p) => s + (p.valor ?? 0), 0);
    if (!perto(soma, total)) return false;
  }
  if (total !== null && lido.itens.length > 0) {
    const itens = lido.itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
    const esperado = itens + (lido.valorFrete ?? 0) + (lido.valorOutrasDespesas ?? 0) - (lido.descontoGeral ?? 0);
    if (!perto(esperado, total)) return false;
  }
  return true;
}

type Legibilidade = DocumentoLido["legibilidade"];

/**
 * BOA: confiança ≥ 0,80, cobertura ≥ 0,9 e tudo consistente.
 * RUIM: confiança < 0,55, cobertura < 0,35 ou quase nenhum texto.
 * PARCIAL: o resto — e sempre que faltam páginas.
 */
export function avaliarLegibilidade(
  doc: Doc,
  lido: DocumentoLido,
  opcoes: { temCodigoPagamento: boolean; incompleto?: boolean },
): Legibilidade {
  const conf = confianca(doc);
  const util = doc.textoCompleto.replace(/[^0-9A-Za-z]/g, "").length;
  if (lido.tipo === "NAO_E_DOCUMENTO") return conf < 0.55 || util < 40 ? "RUIM" : conf >= 0.8 ? "BOA" : "PARCIAL";
  const cob = cobertura(lido, opcoes.temCodigoPagamento);
  if (conf < 0.55 || cob < 0.35 || util < 80) return "RUIM";
  if (conf >= 0.8 && cob >= 0.9 && consistente(lido) && !opcoes.incompleto) return "BOA";
  return "PARCIAL";
}
