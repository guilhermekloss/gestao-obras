import type { DocumentoLido } from "../../../leitura-documento";
import {
  avisosDeMarca,
  documentoVazio,
  formaPagamentoDoTexto,
  juntarObservacoes,
  positivoOuNull,
  tipoDoItem,
  type Ancoras,
  type FormaPagamento,
  type Item,
} from "../comum";
import { dadosChaveNfe, encontrarDocumentos } from "../digitos";
import { acharLinha, textoDasLinhas, type Doc } from "../documento";
import {
  arredondar2,
  encontrarDatas,
  encontrarValores,
  formatarReais,
  lerDecimal,
  lerValor,
  limparEspacos,
  montarData,
} from "../normalizacao";
import { coberturaRotulos, dataDe, documentoDe, valorDe } from "../rotulos";
import { telefoneDoTrecho, type Resultado } from "./auxiliares";
import { documentoDaChave } from "./danfe";

const DINHEIRO_TOKEN = /^-?\d[\d.]*,\d{2}$/;
const UNITARIO_TOKEN = /^\d[\d.]*,\d{2,4}$/;
const QTDE_TOKEN = /^\d+(?:[.,]\d{1,4})?$/;
const UNIDADE_TOKEN = /^[A-Za-z]{1,4}\d?$/;

type CaudaItem = {
  inicio: number;
  quantidade: number | null;
  unidade: string | null;
  unitario: number | null;
  total: number;
};

export function lerCaudaItem(tokens: string[]): CaudaItem | null {
  let j = tokens.length - 1;
  if (j >= 1 && /^[A-Z]{1,2}\d{0,2}$/.test(tokens[j]) && DINHEIRO_TOKEN.test(tokens[j - 1])) j--;
  if (j < 0 || !DINHEIRO_TOKEN.test(tokens[j])) return null;
  const total = lerValor(tokens[j]);
  j--;
  if (j < 0 || !UNITARIO_TOKEN.test(tokens[j]) || total === null) return null;
  const unitario = lerDecimal(tokens[j]);
  j--;
  if (j >= 0 && /^[xX×*]$/.test(tokens[j])) j--;
  let quantidade: number | null = null;
  let unidade: string | null = null;
  const colado = j >= 0 ? /^(\d+(?:[.,]\d{1,4})?)([A-Za-z]{1,4}\d?)$/.exec(tokens[j]) : null;
  if (colado) {
    quantidade = lerDecimal(colado[1]);
    unidade = colado[2].toUpperCase();
    j--;
  } else if (j >= 1 && UNIDADE_TOKEN.test(tokens[j]) && QTDE_TOKEN.test(tokens[j - 1])) {
    unidade = tokens[j].toUpperCase();
    quantidade = lerDecimal(tokens[j - 1]);
    j -= 2;
  } else if (j >= 1 && QTDE_TOKEN.test(tokens[j]) && UNIDADE_TOKEN.test(tokens[j - 1]) && j >= 2) {
    quantidade = lerDecimal(tokens[j]);
    unidade = tokens[j - 1].toUpperCase();
    j -= 2;
  } else {
    return null;
  }
  return { inicio: j + 1, quantidade, unidade, unitario, total };
}

function descricaoSemCodigo(tokens: string[]): string {
  let i = 0;
  if (tokens.length > 1 && /^\d{1,4}$/.test(tokens[0])) i++;
  if (tokens.length - i > 1 && /\d/.test(tokens[i]) && /^[0-9A-Za-z.\-/]{3,}$/.test(tokens[i])) i++;
  return limparEspacos(tokens.slice(i).join(" ")) || limparEspacos(tokens.join(" "));
}

const CABECALHO_ITENS = /CODIGO\s*DESCRICAO|DESCRICAO\s*QT|#\s*COD|\bITEM\s*COD|DESCRICAO\s*.*VL\.?\s*UNIT/;
const FIM_ITENS =
  /QT(?:DE|D)?\.?\s*TOTAL\s*DE\s*ITENS|^\s*VALOR\s*TOTAL|^\s*SUBTOTAL|VALOR\s*A\s*PAGAR|^\s*TOTAL\s*R?\$?/;

function lerItens(doc: Doc, de: number, ate: number): Item[] {
  const itens: Item[] = [];
  let pendente: string | null = null;
  for (let i = de; i < ate; i++) {
    const l = doc.linhas[i];
    if (CABECALHO_ITENS.test(l.norm) || coberturaRotulos(l) > 0.6) continue;
    const desconto = /^\s*(?:DESCONTO|DESC\.?)(?:\s*(?:DO\s*)?ITEM)?\b[^\d-]*(-?\s?\d[\d.]*,\d{2})/.exec(l.norm);
    if (desconto && itens.length) {
      const v = Math.abs(lerValor(desconto[1].replace(/\s/g, "")) ?? 0);
      const ult = itens[itens.length - 1];
      if (v > 0 && ult.valorTotal !== null) {
        ult.desconto = arredondar2((ult.desconto ?? 0) + v);
        ult.valorTotal = arredondar2(ult.valorTotal - v);
      }
      continue;
    }
    let tokens = l.texto.trim().split(/\s+/);
    let cauda = lerCaudaItem(tokens);
    const prox = i + 1 < ate ? doc.linhas[i + 1] : null;
    if (!cauda && prox) {
      const seguinte = prox.texto.trim().split(/\s+/);
      if (!lerCaudaItem(seguinte)) {
        const candidatos = [[...tokens, ...seguinte]];
        const ultimo = tokens[tokens.length - 1];
        if (DINHEIRO_TOKEN.test(ultimo)) candidatos.push([...tokens.slice(0, -1), ...seguinte, ultimo]);
        for (const c of candidatos) {
          const cc = lerCaudaItem(c);
          if (cc) {
            tokens = c;
            cauda = cc;
            i++;
            break;
          }
        }
      }
    }
    if (!cauda) {
      pendente = pendente ? `${pendente} ${l.texto}` : l.texto;
      continue;
    }
    const antes = tokens.slice(0, cauda.inicio);
    let descricao: string;
    if (antes.length === 0 || (antes.length <= 2 && pendente && antes.every((t) => /\d/.test(t)))) {
      if (!pendente) continue;
      descricao = descricaoSemCodigo(pendente.trim().split(/\s+/));
    } else {
      descricao = descricaoSemCodigo(antes);
    }
    pendente = null;
    itens.push({
      descricao,
      quantidade: cauda.quantidade,
      unidade: cauda.unidade,
      valorUnitario: cauda.unitario,
      desconto: null,
      valorTotal: cauda.total,
      tipo: tipoDoItem(descricao),
    });
  }
  return itens;
}

function formaDePagamento(doc: Doc): {
  forma: FormaPagamento;
  varias: boolean;
} {
  const i = acharLinha(doc, /FORMAS?\s*(?:DE\s*)?PAGAMENTO|MEIO\s*DE\s*PAGAMENTO/);
  if (i === -1)
    return {
      forma: formaPagamentoDoTexto(doc.textoCompleto.split("\n").slice(-12).join("\n")),
      varias: false,
    };
  const meios: { forma: FormaPagamento; valor: number }[] = [];
  for (let k = i; k < Math.min(doc.linhas.length, i + 8); k++) {
    const l = doc.linhas[k];
    if (k > i && /\bTROCO\b|CONSULTE|CHAVE\s*DE\s*ACESSO/.test(l.norm)) break;
    const forma = formaPagamentoDoTexto(l.texto);
    if (forma === "NAO_INFORMADA") continue;
    const valores = encontrarValores(l.texto);
    meios.push({ forma, valor: valores[valores.length - 1]?.valor ?? 0 });
  }
  if (meios.length === 0) return { forma: "NAO_INFORMADA", varias: false };
  const maior = meios.reduce((m, x) => (x.valor > m.valor ? x : m), meios[0]);
  return {
    forma: maior.forma,
    varias: new Set(meios.map((m) => m.forma)).size > 1,
  };
}

export function interpretarNfce(doc: Doc, ancoras: Ancoras): Resultado {
  const lido: DocumentoLido = documentoVazio("NFCE");
  const notas: string[] = [...avisosDeMarca(doc)];
  const fim = doc.linhas.length;
  const qr = ancoras.qr;

  lido.chaveAcesso = ancoras.chave ?? ancoras.chaveInvalida;
  const docChave = documentoDaChave(ancoras.chave);

  const iCab = acharLinha(doc, CABECALHO_ITENS);
  const iFimItens = acharLinha(doc, FIM_ITENS, iCab === -1 ? 0 : iCab + 1);
  const fimTopo = iCab !== -1 ? iCab : Math.min(fim, 6);

  for (let i = 0; i < fimTopo; i++) {
    const l = doc.linhas[i];
    if (/DANFE|DOCUMENTO\s*AUXILIAR|NFC-?E|CNPJ|^\s*IE\b|CONSUMIDOR\s*ELETRONICA/.test(l.norm)) {
      if (/CNPJ/.test(l.norm)) break;
      continue;
    }
    if ((l.texto.match(/[A-Za-zÀ-ú]/g) ?? []).length >= 4) {
      lido.emitente.nome = limparEspacos(l.texto.split(/\s{2,}/)[0]);
      break;
    }
  }
  const rotulado = documentoDe(doc, ["CNPJ", "CNPJ_CPF"], {
    faixa: { de: 0, ate: fimTopo },
  });
  if (docChave && ancoras.documentos.some((d) => d.linha < fimTopo && d.valor === docChave))
    lido.emitente.documento = docChave;
  else if (rotulado?.valido) lido.emitente.documento = rotulado.valor;
  else lido.emitente.documento = docChave ?? rotulado?.valor ?? null;
  lido.emitente.telefone = telefoneDoTrecho(textoDasLinhas(doc, 0, fimTopo));

  if (iCab !== -1) lido.itens = lerItens(doc, iCab + 1, iFimItens === -1 ? fim : iFimItens);
  if (lido.itens.length === 0) notas.push("Itens não identificados na leitura; confira a lista de produtos do cupom.");

  const faixaTotais = {
    de: iFimItens !== -1 ? iFimItens : iCab !== -1 ? iCab : 0,
    ate: fim,
  };
  const aPagar = valorDe(doc, ["VALOR_A_PAGAR"], { faixa: faixaTotais });
  const vTotal = valorDe(doc, ["VALOR_TOTAL", "TOTAL"], { faixa: faixaTotais });
  const desconto = valorDe(doc, ["DESCONTO"], {
    faixa: faixaTotais,
    abaixo: false,
  });
  const acrescimo = valorDe(doc, ["ACRESCIMOS", "OUTRAS_DESPESAS"], {
    faixa: faixaTotais,
    abaixo: false,
  });
  let frete: number | null = valorDe(doc, ["V_FRETE"], {
    faixa: faixaTotais,
    abaixo: false,
  });
  if (frete === null) {
    const iFrete = acharLinha(doc, /^\s*FRETE\b/, faixaTotais.de);
    if (iFrete !== -1) frete = encontrarValores(doc.linhas[iFrete].texto)[0]?.valor ?? null;
  }
  lido.valorFrete = positivoOuNull(frete);
  lido.valorOutrasDespesas = positivoOuNull(acrescimo);
  const descontoNosItens = lido.itens.some((i) => i.desconto);
  lido.descontoGeral = descontoNosItens ? null : positivoOuNull(desconto);
  if (aPagar !== null && aPagar > 0) lido.valorTotal = aPagar;
  else if (vTotal !== null && vTotal > 0)
    lido.valorTotal = arredondar2(vTotal - (desconto ?? 0) + (acrescimo ?? 0) + (frete ?? 0));
  else if (qr?.valor) lido.valorTotal = qr.valor;
  if (qr?.valor && lido.valorTotal !== null && Math.abs(qr.valor - lido.valorTotal) > 0.01) {
    notas.push(`O valor do QR Code (${formatarReais(qr.valor)}) difere do total impresso; confira.`);
  }

  const pagamento = formaDePagamento(doc);
  lido.formaPagamento = pagamento.forma;
  if (pagamento.varias) notas.push("Pagamento em mais de um meio; foi considerado o de maior valor.");

  const iConsumidor = acharLinha(doc, /\bCONSUMIDOR\b(?!\s*ELETRONICA)/);
  if (iConsumidor !== -1 && !/NAO\s*IDENTIFICADO/.test(doc.linhas[iConsumidor].norm)) {
    const trecho = textoDasLinhas(doc, iConsumidor, iConsumidor + 2);
    const d = encontrarDocumentos(trecho, true)[0];
    if (d) lido.destinatario.documento = d.valor;
    const nome = /(?:NOME|CONSUMIDOR)\s*:\s*([A-Za-zÀ-ú][A-Za-zÀ-ú .'-]{3,})$/i.exec(doc.linhas[iConsumidor].texto);
    if (nome && !/CPF|CNPJ/i.test(nome[1])) lido.destinatario.nome = limparEspacos(nome[1]);
  }
  if (!lido.destinatario.documento && qr?.destinatario) lido.destinatario.documento = qr.destinatario;

  for (const l of doc.linhas) {
    const m =
      /NFC-?E\s*N?\s*[º°O.]?\s*:?\s*(\d{1,9})\s*S[EÉ]RIE\s*:?\s*(\d{1,3})/.exec(l.norm) ??
      /\bN(?:UMERO|º|°|O\.?)\s*:?\s*(\d{1,9})\s*S[EÉ]RIE\s*:?\s*(\d{1,3})/.exec(l.norm);
    if (m) {
      const ini = m.index + m[0].indexOf(m[1]);
      lido.numero = l.texto.slice(ini, ini + m[1].length);
      lido.serie = m[2];
      lido.dataEmissao = encontrarDatas(l.texto.slice(m.index))[0]?.valor ?? null;
      break;
    }
  }
  if (!lido.dataEmissao) lido.dataEmissao = dataDe(doc, ["DATA_EMISSAO"]);
  if (!lido.dataEmissao && qr?.dia && ancoras.chave) {
    const c = dadosChaveNfe(ancoras.chave);
    lido.dataEmissao = montarData(c.ano, c.mes, qr.dia);
  }

  lido.observacoes = juntarObservacoes(notas);
  return { lido };
}
