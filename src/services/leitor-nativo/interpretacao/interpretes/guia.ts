import type { DocumentoLido } from "../../../leitura-documento";
import { documentoVazio, juntarObservacoes, type Ancoras, type Item } from "../comum";
import { acharLinha, type Doc } from "../documento";
import { formatarReais, lerValor, limparEspacos } from "../normalizacao";
import { dataDe, documentoDe, numeroDe, textoDe, valorDe } from "../rotulos";
import type { Resultado } from "./auxiliares";

function orgaoImpresso(doc: Doc): string | null {
  const n = doc.normCompleto;
  if (/ARRECADACAO\s*DO\s*SIMPLES\s*NACIONAL|\bDAS\b\s*(?:-\s*)?(?:DE\s*)?MEI\b/.test(n)) return "Simples Nacional";
  if (/RECEITA\s*FEDERAL\s*DO\s*BRASIL/.test(n)) return "Receita Federal do Brasil";
  if (/RECEITAS\s*FEDERAIS|RECEITA\s*FEDERAL/.test(n)) return "Receita Federal";
  if (/FGTS/.test(n)) return "FGTS";
  if (/ESOCIAL/.test(n)) return "eSocial";
  if (/PREVIDENCIA\s*SOCIAL/.test(n)) return "Previdência Social (INSS)";
  const i = acharLinha(doc, /PREFEITURA|SECRETARIA\s*(?:MUNICIPAL\s*)?D[AE]\s*FAZENDA|GOVERNO\s*DO\s*ESTADO|DETRAN/);
  if (i !== -1) return limparEspacos(doc.linhas[i].texto.split(/\s{2,}/)[0]);
  return null;
}

function composicao(doc: Doc): Item[] {
  const i = acharLinha(doc, /COMPOSICAO\s*DO\s*DOCUMENTO|CODIGO\s*DENOMINACAO|CODIGO\s*DA\s*RECEITA\s*DENOMINACAO/);
  if (i === -1) return [];
  const itens: Item[] = [];
  for (let k = i + 1; k < doc.linhas.length; k++) {
    const l = doc.linhas[k];
    if (/^\s*TOTA(?:IS|L)\b/.test(l.norm)) break;
    if (/CODIGO\s*DENOMINACAO|PRINCIPAL\s*MULTA/.test(l.norm)) continue;
    const tokens = l.texto.trim().split(/\s+/);
    if (!/^\d{4}$/.test(tokens[0] ?? "")) {
      if (itens.length) break;
      continue;
    }
    const ehValor = (t: string) => /^\d[\d.]*,\d{2}$/.test(t) || /^[-–]$/.test(t);
    let iNum = tokens.length;
    while (iNum > 1 && ehValor(tokens[iNum - 1])) iNum--;
    while (iNum < tokens.length && !/\d/.test(tokens[iNum])) iNum++;
    const ultimo = tokens[tokens.length - 1];
    const total = /\d/.test(ultimo) ? lerValor(ultimo) : null;
    if (iNum <= 1 || total === null) continue;
    itens.push({
      descricao: limparEspacos(tokens.slice(1, iNum).join(" ")),
      quantidade: null,
      unidade: null,
      valorUnitario: null,
      desconto: null,
      valorTotal: total,
      tipo: "ENCARGO",
    });
  }
  return itens;
}

export function interpretarGuia(doc: Doc, ancoras: Ancoras, tipo: "GUIA" | "OUTRO" = "GUIA"): Resultado {
  const lido: DocumentoLido = documentoVazio(tipo);
  const notas: string[] = [];
  const arrecadacao = ancoras.pagamento?.tipo === "ARRECADACAO" ? ancoras.pagamento.arrecadacao : null;

  const impresso = valorDe(doc, [
    "VALOR_TOTAL_DOCUMENTO",
    "VALOR_DOCUMENTO",
    "VALOR_COBRADO",
    "VALOR_A_PAGAR",
    "VALOR_TOTAL",
  ]);
  const valor = arrecadacao?.valor ?? (impresso && impresso > 0 ? impresso : null);
  if (arrecadacao?.valor && impresso && Math.abs(arrecadacao.valor - impresso) > 0.005) {
    notas.push(
      `O valor impresso (${formatarReais(impresso)}) difere do valor do código de barras (${formatarReais(arrecadacao.valor)}); foi usado o do código.`,
    );
  }
  if (!arrecadacao)
    notas.push("Código de barras da guia não lido com segurança; o valor veio do texto impresso — confira.");
  lido.valorTotal = valor;

  const vencimento = dataDe(doc, ["PAGAR_ATE"]) ?? dataDe(doc, ["DATA_VENCIMENTO", "VENCIMENTO"]);
  if (vencimento && valor) lido.parcelas = [{ vencimento, valor }];
  lido.dataEmissao = dataDe(doc, ["DATA_EMISSAO"]);
  lido.numero = numeroDe(doc, ["NUM_DOCUMENTO", "NUMERO"]);

  if (tipo === "GUIA") {
    lido.emitente.nome = orgaoImpresso(doc);
    const contribuinte = documentoDe(doc, [
      "CNPJ",
      "CNPJ_CPF",
      "CPF",
      "NUMERO_CPF_CNPJ",
      "IDENTIFICADOR",
      "CONTRIBUINTE",
    ]);
    lido.destinatario.documento = contribuinte?.valor ?? ancoras.documentos.find((d) => d.valido)?.valor ?? null;
    lido.destinatario.nome = textoDe(doc, ["NOME_RAZAO", "CONTRIBUINTE", "NOME_TELEFONE", "NOME"]);
    lido.itens = composicao(doc);
  } else {
    const primeira = doc.linhas.find((l) => (l.texto.match(/[A-Za-zÀ-ú]/g) ?? []).length >= 4);
    lido.emitente.nome = primeira ? limparEspacos(primeira.texto.split(/\s{2,}/)[0]) : null;
    lido.emitente.documento = ancoras.documentos.find((d) => d.valido)?.valor ?? null;
    lido.formaPagamento = "BOLETO";
  }

  lido.observacoes = juntarObservacoes(notas);
  return { lido };
}
