/**
 * Boleto de cobrança (ficha de compensação + recibo do pagador). Valor e
 * vencimento saem da linha digitável/código de barras validados (DV), e são
 * conferidos com o "Valor do Documento" e o "Vencimento" impressos.
 */
import type { DocumentoLido } from "../../../leitura-documento";
import { documentoVazio, juntarObservacoes, type Ancoras } from "../comum";
import { vencimentoDoFator } from "../codigos";
import type { Doc } from "../documento";
import { formatarReais } from "../normalizacao";
import { dataDe, documentoDe, numeroDe, textoDe, valorDe } from "../rotulos";
import type { Resultado } from "./auxiliares";

export function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function interpretarBoleto(doc: Doc, ancoras: Ancoras, dataReferencia?: string | null): Resultado {
  const lido: DocumentoLido = documentoVazio("BOLETO");
  const notas: string[] = [];
  const boleto = ancoras.pagamento?.tipo === "BOLETO" ? ancoras.pagamento.boleto : null;

  const valorImpresso = valorDe(doc, ["VALOR_DOCUMENTO"]);
  const vencimentoImpresso = dataDe(doc, ["VENCIMENTO", "DATA_VENCIMENTO"]);
  const dataDocumento = dataDe(doc, ["DATA_DOCUMENTO"]) ?? dataDe(doc, ["DATA_PROCESSAMENTO"]);
  lido.dataEmissao = dataDocumento;

  // Vencimento: fator do código (ciclo mais próximo da emissão) × impresso
  const referencia = dataDocumento ?? vencimentoImpresso ?? dataReferencia ?? null;
  const vencimentoCodigo = boleto ? vencimentoDoFator(boleto.fator, referencia) : null;
  const vencimento = vencimentoCodigo ?? vencimentoImpresso;
  if (vencimentoCodigo && vencimentoImpresso && vencimentoCodigo !== vencimentoImpresso) {
    notas.push(
      `O vencimento impresso (${formatarData(vencimentoImpresso)}) difere do código de barras (${formatarData(vencimentoCodigo)}); foi usado o do código — confira.`,
    );
  }

  // Valor: código (quando não é valor em aberto) × impresso
  const valor = boleto?.valor ?? (valorImpresso && valorImpresso > 0 ? valorImpresso : null);
  if (boleto?.valor && valorImpresso && Math.abs(boleto.valor - valorImpresso) > 0.005) {
    notas.push(
      `O valor impresso (${formatarReais(valorImpresso)}) difere do valor do código de barras (${formatarReais(boleto.valor)}); foi usado o do código.`,
    );
  }
  if (!boleto)
    notas.push("Linha digitável não lida com segurança; valor e vencimento vieram do texto impresso — confira.");
  lido.valorTotal = valor;

  // Beneficiário (emitente) e pagador (destinatário)
  lido.emitente.nome = textoDe(doc, ["BENEFICIARIO"]);
  const docBenef = documentoDe(doc, ["CNPJ_BENEFICIARIO"]) ?? documentoDe(doc, ["BENEFICIARIO"]);
  lido.emitente.documento = docBenef?.valor ?? null;
  lido.destinatario.nome = textoDe(doc, ["PAGADOR"]);
  lido.destinatario.documento = documentoDe(doc, ["PAGADOR"])?.valor ?? null;
  if (!lido.emitente.documento) {
    const outro = ancoras.documentos.find((d) => d.valido && d.valor !== lido.destinatario.documento);
    if (outro) lido.emitente.documento = outro.valor;
  }

  const sacador = textoDe(doc, ["SACADOR"], { abaixo: false });
  if (sacador) {
    notas.push(
      `Boleto com sacador/avalista (${sacador}): o beneficiário pode ser um banco ou securitizadora — confira o fornecedor.`,
    );
  }

  lido.numero = numeroDe(doc, ["NUM_DOCUMENTO"]);
  lido.formaPagamento = "BOLETO";
  if (vencimento && valor) lido.parcelas = [{ vencimento, valor }];

  lido.observacoes = juntarObservacoes(notas);
  return { lido };
}
