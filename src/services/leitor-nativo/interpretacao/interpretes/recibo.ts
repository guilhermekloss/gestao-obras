/**
 * Recibo: "Recebi(emos) de <pagador>, CPF/CNPJ ..., a importância de R$ X
 * (extenso), referente a <serviço>", local e data por extenso e, abaixo da
 * assinatura, o nome e o CPF/CNPJ de quem recebeu (emitente).
 */
import type { DocumentoLido } from "../../../leitura-documento";
import { documentoVazio, formaPagamentoDoTexto, juntarObservacoes, tipoDoItem, type Ancoras } from "../comum";
import { encontrarDocumentos } from "../digitos";
import { acharLinha, textoDasLinhas, type Doc } from "../documento";
import {
  encontrarDatas,
  encontrarValores,
  extensoParaNumero,
  formatarReais,
  lerData,
  limparEspacos,
  normalizarTexto,
} from "../normalizacao";
import { dataDe, valorDe } from "../rotulos";
import { telefoneDoTrecho, type Resultado } from "./auxiliares";

const CIDADE_DATA =
  /,\s*(?:\d{1,2}\s*[º°]?\s*(?:DE\s+)?[A-Z]{3,9}\.?\s*(?:DE\s+)?\d{4}|\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4})/;

/** Trecho original correspondente a um grupo casado no texto normalizado (mesmo comprimento). */
function trechoOriginal(original: string, m: RegExpExecArray, grupo: number): string {
  const ini = m.index + m[0].indexOf(m[grupo]);
  return original.slice(ini, ini + m[grupo].length);
}

export function interpretarRecibo(doc: Doc, ancoras: Ancoras): Resultado {
  const lido: DocumentoLido = documentoVazio("RECIBO");
  const notas: string[] = [];
  const corpo = doc.linhas
    .map((l) => l.texto)
    .join(" ")
    .replace(/\s+/g, " ");
  const corpoNorm = normalizarTexto(corpo);

  // Número: "RECIBO Nº 042" (na mesma linha ou na seguinte)
  const topo = doc.linhas
    .slice(0, 4)
    .map((l) => l.norm)
    .join(" ");
  const num = /RECIBO\b.{0,25}?\bN\s*[º°O.]?\s*:?\s*(\d[0-9A-Z\-/]{0,11})/.exec(topo);
  if (num) {
    const topoOriginal = doc.linhas
      .slice(0, 4)
      .map((l) => l.texto)
      .join(" ");
    lido.numero = trechoOriginal(topoOriginal, num, 1);
  }

  // Pagador (destinatário)
  const pag =
    /RECEB(?:I|EMOS)\s+(?:DO\(?A?\)?|DA|DE)\s+(?:SR\.?\(?A?\)?\s+|SRA\.?\s+|EMPRESA\s+)?(.+?)(?=\s*,|\s+(?:INSCRIT|PORTADOR|CPF|CNPJ)|\s+A\s+(?:IMPORTANCIA|QUANTIA))/.exec(
      corpoNorm,
    );
  const iImportancia = corpoNorm.search(/(?:IMPORTANCIA|QUANTIA)\s+(?:LIQUIDA\s+)?DE/);
  if (pag) {
    lido.destinatario.nome = limparEspacos(trechoOriginal(corpo, pag, 1)) || null;
    const fimPag = pag.index + pag[0].length;
    const ate = iImportancia > fimPag ? iImportancia : fimPag + 40;
    lido.destinatario.documento = encontrarDocumentos(corpo.slice(fimPag, ate), true)[0]?.valor ?? null;
  }

  // Valor: rótulo "VALOR R$" no topo > "a importância de R$" > extenso
  const valorTopo = valorDe(doc, ["VALOR"], {
    faixa: { de: 0, ate: Math.min(doc.linhas.length, 6) },
  });
  const valorCorpo =
    iImportancia !== -1 ? (encontrarValores(corpo.slice(iImportancia, iImportancia + 60))[0]?.valor ?? null) : null;
  const extenso = /\(([^)]*\bREA(?:IS|L)\b[^)]*)\)/.exec(corpoNorm);
  const valorExtenso = extenso ? extensoParaNumero(extenso[1]) : null;
  lido.valorTotal = valorTopo || valorCorpo || null;
  if (!lido.valorTotal && valorExtenso) {
    lido.valorTotal = valorExtenso;
    notas.push(`Valor lido só por extenso (${formatarReais(valorExtenso)}) — confira.`);
  }
  if (valorTopo && valorCorpo && Math.abs(valorTopo - valorCorpo) > 0.005) {
    notas.push(
      `O valor do cabeçalho (${formatarReais(valorTopo)}) difere do valor no texto (${formatarReais(valorCorpo)}); confira.`,
    );
  } else if (lido.valorTotal && valorExtenso && Math.abs(lido.valorTotal - valorExtenso) > 0.005) {
    notas.push(`O valor por extenso (${formatarReais(valorExtenso)}) difere do valor em algarismos; confira.`);
  }

  // Referente a ... (descrição do item)
  const ref =
    /\b(?:REFERENTE|CORRESPONDENTE|RELATIV[OA])\s+(?:AOS|AO|AS|A)\s+(.+?)(?:\.(?=\s|$)|,\s*(?:DANDO|PARA\s+MAIOR|PELO\s+QUE)|$)/.exec(
      corpoNorm,
    );
  const referente = ref ? limparEspacos(trechoOriginal(corpo, ref, 1)) : null;

  // Data: "Cidade, 10 de outubro de 2026" > rótulo > primeira data fora do texto do serviço
  let iData = -1;
  for (let i = 0; i < doc.linhas.length; i++) {
    if (CIDADE_DATA.test(doc.linhas[i].norm) && lerData(doc.linhas[i].texto)) {
      const datas = encontrarDatas(doc.linhas[i].texto);
      lido.dataEmissao = datas[datas.length - 1]?.valor ?? null;
      iData = i;
    }
  }
  if (!lido.dataEmissao) lido.dataEmissao = dataDe(doc, ["DATA_EMISSAO"]);
  if (!lido.dataEmissao) {
    const foraDaRef = encontrarDatas(corpo).find((d) => !referente || !referente.includes(d.texto));
    lido.dataEmissao = foraDaRef?.valor ?? null;
  }

  // Emitente: abaixo da data / da linha de assinatura
  const iAssinatura = acharLinha(doc, /_{5,}/);
  const inicioEmitente = Math.max(iData, iAssinatura) + 1;
  if (inicioEmitente > 0) {
    for (let i = inicioEmitente; i < doc.linhas.length; i++) {
      const l = doc.linhas[i];
      if (/^\s*(?:CPF|CNPJ|RG|FONE|TEL|ASSINATURA|_+\s*$)/.test(l.norm)) continue;
      const nome = l.texto.replace(/^\s*(?:NOME|EMITENTE|RECEBEDOR)\s*:\s*/i, "");
      if ((nome.match(/[A-Za-zÀ-ú]/g) ?? []).length >= 4 && !encontrarDocumentos(nome).length) {
        lido.emitente.nome = limparEspacos(nome);
        break;
      }
    }
    const depois = ancoras.documentos.filter((d) => d.linha >= inicioEmitente);
    lido.emitente.documento = depois.find((d) => d.valido)?.valor ?? depois[0]?.valor ?? null;
    lido.emitente.telefone = telefoneDoTrecho(textoDasLinhas(doc, inicioEmitente, doc.linhas.length));
  }
  if (!lido.emitente.nome) {
    const eu = /\bEU\s*,?\s+(.+?),\s*(?:PORTADOR|INSCRIT|BRASILEIR|CPF|RG)/.exec(corpoNorm);
    if (eu) lido.emitente.nome = limparEspacos(trechoOriginal(corpo, eu, 1));
  }

  // Forma de pagamento
  if (/\bCHEQUE\b/.test(corpoNorm)) notas.push("Pagamento em cheque — confira o meio de pagamento.");
  else lido.formaPagamento = formaPagamentoDoTexto(corpo.slice(Math.max(0, iImportancia)));

  if (referente && lido.valorTotal) {
    lido.itens = [
      {
        descricao: referente,
        quantidade: null,
        unidade: null,
        valorUnitario: null,
        desconto: null,
        valorTotal: lido.valorTotal,
        tipo: tipoDoItem(referente, "MATERIAL"),
      },
    ];
  }

  lido.observacoes = juntarObservacoes(notas);
  return { lido };
}
