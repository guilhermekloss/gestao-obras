import type { DocumentoLido } from "../../../leitura-documento";
import { documentoVazio, formaPagamentoDoTexto, juntarObservacoes, type Ancoras } from "../comum";
import type { Doc } from "../documento";
import { encontrarDatas, limparEspacos } from "../normalizacao";
import { dataDe, numeroDe, valorDe } from "../rotulos";
import { telefoneDoTrecho, type Resultado } from "./auxiliares";

export function interpretarGenerico(doc: Doc, ancoras: Ancoras): Resultado {
  const lido: DocumentoLido = documentoVazio("OUTRO");
  const notas: string[] = [];

  lido.valorTotal =
    valorDe(doc, [
      "VALOR_A_PAGAR",
      "VALOR_TOTAL",
      "TOTAL",
      "VALOR_DOCUMENTO",
      "VALOR_COBRADO",
      "VALOR_PAGO",
      "VALOR",
    ]) || null;
  lido.dataEmissao =
    dataDe(doc, ["DATA_EMISSAO", "DATA_DOCUMENTO"]) ?? encontrarDatas(doc.textoCompleto)[0]?.valor ?? null;
  lido.numero = numeroDe(doc, ["NUM_DOCUMENTO", "NUMERO"]);

  const emitente = ancoras.documentos.find((d) => d.valido) ?? ancoras.documentos[0];
  if (emitente) {
    lido.emitente.documento = emitente.valor;
    const linha = doc.linhas[emitente.linha];
    const antes = linha.texto
      .slice(0, emitente.inicio)
      .replace(/\b(?:CNPJ|CPF)\b.*$/i, "")
      .replace(/[\s:\-–]+$/, "");
    const candidatos = [antes, doc.linhas[emitente.linha - 1]?.texto ?? ""];
    const nome = candidatos.find((c) => (c.match(/[A-Za-zÀ-ú]/g) ?? []).length >= 4);
    if (nome) lido.emitente.nome = limparEspacos(nome.split(/\s{2,}/)[0]);
  }
  lido.emitente.telefone = telefoneDoTrecho(doc.textoCompleto);

  const arrecadacao = ancoras.pagamento?.tipo === "ARRECADACAO" ? ancoras.pagamento.arrecadacao : null;
  if (arrecadacao?.valor) lido.valorTotal = arrecadacao.valor;
  lido.formaPagamento = arrecadacao ? "BOLETO" : formaPagamentoDoTexto(doc.textoCompleto);

  if (/\bORCAMENTO\b|\bPEDIDO\b|SEM\s*VALOR\s*FISCAL|NAO\s*E\s*DOCUMENTO\s*FISCAL/.test(doc.normCompleto)) {
    notas.push("Documento sem valor fiscal (orçamento/pedido/comprovante): confira se é mesmo uma despesa.");
  }
  if (lido.valorTotal === null) notas.push("Valor total não identificado com rótulo claro.");
  lido.observacoes = juntarObservacoes(notas);
  return { lido };
}
