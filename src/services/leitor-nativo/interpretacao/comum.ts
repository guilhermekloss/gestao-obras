/**
 * Peças comuns aos intérpretes: âncoras com dígito verificador (procuradas
 * uma vez), documento vazio, forma de pagamento e tipo de item por
 * palavras-chave.
 */
import type { DocumentoLido } from "../../leitura-documento";
import {
  chaveDosCodigos,
  chaveNfseNoTexto,
  chaveNoTexto,
  codigoPagamentoDosCodigos,
  codigoPagamentoNoTexto,
  type CodigoPagamento,
  type DadosQrNfce,
} from "./codigos";
import { dadosChaveNfe, encontrarDocumentos, type DocumentoEncontrado } from "./digitos";
import { acharLinha, type Doc } from "./documento";
import { encontrarDatas, encontrarValores, normalizarTexto } from "./normalizacao";

export type Item = DocumentoLido["itens"][number];
export type Parcela = DocumentoLido["parcelas"][number];
export type FormaPagamento = DocumentoLido["formaPagamento"];

export type Ancoras = {
  /** chave de acesso 44 válida (códigos > texto) */
  chave: string | null;
  /** sequência no formato de chave que não fechou o DV (para o aviso do normalizador) */
  chaveInvalida: string | null;
  modelo: string | null;
  qr: DadosQrNfce | null;
  chaveNfse: string | null;
  pagamento: CodigoPagamento | null;
  /** CNPJ/CPF do texto todo, com a linha de cada um */
  documentos: (DocumentoEncontrado & { linha: number })[];
  temValor: boolean;
  temData: boolean;
};

export function encontrarAncoras(doc: Doc): Ancoras {
  const dosCodigos = chaveDosCodigos(doc.codigos);
  let chave = dosCodigos?.chave ?? null;
  let chaveInvalida: string | null = null;
  if (!chave) {
    // preferir o trecho perto de "CHAVE DE ACESSO"; juntar pares de linhas (chave quebrada)
    const iRotulo = acharLinha(doc, /CHAVE\s*DE\s*ACESSO|CONSULTE\s*PELA\s*CHAVE/);
    const ordem = doc.linhas.map((_, i) => i);
    if (iRotulo >= 0) ordem.sort((a, b) => Math.abs(a - iRotulo) - Math.abs(b - iRotulo));
    for (const i of ordem) {
      const l = doc.linhas[i];
      const proxima = doc.linhas[i + 1];
      for (const trecho of [l.texto, proxima ? `${l.texto} ${proxima.texto}` : null]) {
        if (!trecho) continue;
        const achada = chaveNoTexto(trecho);
        if (achada?.valida) {
          chave = achada.chave;
          break;
        }
        if (achada && !chaveInvalida) chaveInvalida = achada.chave;
      }
      if (chave) break;
    }
  }
  const pagamento = codigoPagamentoDosCodigos(doc.codigos) ?? pagamentoNoTexto(doc);
  const documentos: Ancoras["documentos"] = [];
  doc.linhas.forEach((l, i) => {
    const comRotulo = /CNPJ|CPF|C\.N\.P\.J/.test(l.norm);
    for (const d of encontrarDocumentos(l.texto, comRotulo)) documentos.push({ ...d, linha: i });
  });
  return {
    chave,
    chaveInvalida: chave ? null : chaveInvalida,
    modelo: chave ? dadosChaveNfe(chave).modelo : null,
    qr: dosCodigos?.qr ?? null,
    chaveNfse: doc.linhas.map((l) => chaveNfseNoTexto(l.texto)).find(Boolean) ?? null,
    pagamento,
    documentos,
    temValor: encontrarValores(doc.textoCompleto).length > 0,
    temData: encontrarDatas(doc.textoCompleto).length > 0,
  };
}

function pagamentoNoTexto(doc: Doc): CodigoPagamento | null {
  for (let i = 0; i < doc.linhas.length; i++) {
    const r = codigoPagamentoNoTexto(doc.linhas[i].texto);
    if (r) return r;
    const prox = doc.linhas[i + 1];
    if (prox) {
      const junto = codigoPagamentoNoTexto(`${doc.linhas[i].texto} ${prox.texto}`);
      if (junto) return junto;
    }
  }
  return null;
}

export function documentoVazio(tipo: DocumentoLido["tipo"]): DocumentoLido {
  return {
    tipo,
    legibilidade: "BOA",
    emitente: { nome: null, documento: null, telefone: null },
    destinatario: { nome: null, documento: null },
    numero: null,
    serie: null,
    chaveAcesso: null,
    dataEmissao: null,
    valorTotal: null,
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "NAO_INFORMADA",
    itens: [],
    parcelas: [],
    observacoes: null,
  };
}

/** Meio de pagamento citado num trecho (o primeiro reconhecido), ou NAO_INFORMADA. */
export function formaPagamentoDoTexto(texto: string): FormaPagamento {
  const n = normalizarTexto(texto);
  const regras: [RegExp, FormaPagamento][] = [
    [/\bPIX\b|PAGAMENTO\s*INSTANTANEO/, "PIX"],
    [/CARTAO\s*DE\s*DEBITO|\bDEBITO\b/, "DEBITO"],
    [/CARTAO\s*DE\s*CREDITO|\bCREDITO\b|\bCARTAO\b/, "CARTAO"],
    [/\bDINHEIRO\b|\bEM\s*ESPECIE\b/, "DINHEIRO"],
    [/\bBOLETO\b/, "BOLETO"],
    [/TRANSFERENCIA|\bTED\b|\bDOC\b|DEPOSITO\s*(?:BANCARIO|EM\s*CONTA)|CARTEIRA\s*DIGITAL/, "TRANSFERENCIA"],
  ];
  let melhor: { forma: FormaPagamento; pos: number } | null = null;
  for (const [re, forma] of regras) {
    const m = re.exec(n);
    if (m && (!melhor || m.index < melhor.pos)) melhor = { forma, pos: m.index };
  }
  return melhor?.forma ?? "NAO_INFORMADA";
}

/** Tipo do item pela descrição (e CFOP de serviço, quando houver). */
export function tipoDoItem(descricao: string, padrao: Item["tipo"] = "MATERIAL", cfop?: string): Item["tipo"] {
  const n = normalizarTexto(descricao);
  if (/^\s*(?:FRETE|CARRETO|TRANSPORTE)\b/.test(n)) return "FRETE";
  if (/^\s*(?:TAXA|TARIFA|IMPOSTO|JUROS|MULTA|ENCARGO)S?\b/.test(n)) return "ENCARGO";
  if (cfop && /^[56]933$/.test(cfop)) return "SERVICO";
  if (/\bSERVICOS?\b|MAO\s*DE\s*OBRA|\bEMPREITADA\b|\bDIARIAS?\b|\bLOCACAO\b/.test(n)) return "SERVICO";
  return padrao;
}

/** Junta as observações não vazias numa frase só (ou null). */
export function juntarObservacoes(notas: (string | null | undefined)[]): string | null {
  const r = notas.map((n) => n?.trim()).filter((n): n is string => !!n);
  return r.length ? [...new Set(r)].join(" ") : null;
}

/** Remove zeros e negativos de um valor de totais (campo impresso "0,00" = não há). */
export function positivoOuNull(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : null;
}

/** Marcas de documento sem valor fiscal / cancelado / contingência. */
export function avisosDeMarca(doc: Doc): string[] {
  const n = doc.normCompleto;
  const r: string[] = [];
  if (/SEM\s*VALOR\s*FISCAL|AMBIENTE\s*DE\s*HOMOLOGACAO/.test(n))
    r.push('O documento indica "sem valor fiscal" (homologação).');
  if (/\b(?:NF-?E|NFC-?E|NOTA)\s*CANCELADA\b/.test(n)) r.push("O documento indica nota cancelada.");
  if (/EMITIDA\s*EM\s*CONTINGENCIA|DANFE\s*EM\s*CONTINGENCIA/.test(n))
    r.push("Nota emitida em contingência: confira a autorização.");
  return r;
}
