/**
 * Interpretação nativa (sem LLM) de documentos de despesa: transforma o
 * `TextoExtraido` (OCR ou camada de texto do PDF, com posições e códigos de
 * barras/QR decodificados) no `DocumentoLido`, que segue para
 * `normalizarLeitura` como a leitura feita pelo modelo.
 *
 * Puro e determinístico. Regras de transcrição (as mesmas do leitor com IA):
 * só o que está impresso; ausente/ilegível = null; nada é estimado; códigos
 * com dígito verificador (chave, linha digitável, CNPJ/CPF) são o árbitro
 * das correções de OCR.
 *
 *   documento.ts       linhas, texto normalizado, tokens com posição, células
 *   normalizacao.ts    valores em reais, decimais, datas, extenso, confusões de OCR
 *   digitos.ts         DVs (CNPJ alfanumérico, CPF, chave 44/50, mód. 10/11) e correção guiada
 *   codigos.ts         chave (texto/QR/Code-128), boleto 47/44, arrecadação 48/44, fator de vencimento
 *   rotulos.ts         dicionário de rótulos e pareamento rótulo → valor
 *   classificacao.ts   tipo do documento (âncoras + pontuação)
 *   legibilidade.ts    BOA / PARCIAL / RUIM
 *   interpretes/       um intérprete por tipo (DANFE, NFC-e, NFS-e, boleto, guia, recibo, genérico)
 */
import { documentoLidoSchema, type DocumentoLido } from "../../leitura-documento";
import type { TextoExtraido } from "../tipos";
import { classificar } from "./classificacao";
import { documentoVazio, encontrarAncoras } from "./comum";
import { construirDoc } from "./documento";
import { interpretarBoleto } from "./interpretes/boleto";
import { interpretarDanfe } from "./interpretes/danfe";
import { interpretarGenerico } from "./interpretes/generico";
import { interpretarGuia } from "./interpretes/guia";
import { interpretarNfce } from "./interpretes/nfce";
import { interpretarNfse } from "./interpretes/nfse";
import { interpretarRecibo } from "./interpretes/recibo";
import type { Resultado } from "./interpretes/auxiliares";
import { avaliarLegibilidade } from "./legibilidade";
import { encontrarDatas } from "./normalizacao";

export type OpcoesInterpretacao = {
  /**
   * Data de referência (AAAA-MM-DD) para decidir o ciclo do fator de
   * vencimento de boletos quando o documento não traz data de emissão.
   * Padrão: a data mais recente impressa no documento.
   */
  dataReferencia?: string | null;
};

/** Troca NaN/Infinity por null e strings vazias por null (o schema exige números finitos). */
function sanear(lido: DocumentoLido): DocumentoLido {
  const num = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null);
  const txt = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...lido,
    emitente: {
      nome: txt(lido.emitente.nome),
      documento: txt(lido.emitente.documento),
      telefone: txt(lido.emitente.telefone),
    },
    destinatario: {
      nome: txt(lido.destinatario.nome),
      documento: txt(lido.destinatario.documento),
    },
    numero: txt(lido.numero),
    serie: txt(lido.serie),
    chaveAcesso: txt(lido.chaveAcesso),
    dataEmissao: txt(lido.dataEmissao),
    valorTotal: num(lido.valorTotal),
    valorFrete: num(lido.valorFrete),
    valorOutrasDespesas: num(lido.valorOutrasDespesas),
    descontoGeral: num(lido.descontoGeral),
    itens: lido.itens
      .filter((i) => i.descricao.trim())
      .map((i) => ({
        ...i,
        descricao: i.descricao.trim(),
        quantidade: num(i.quantidade),
        unidade: txt(i.unidade),
        valorUnitario: num(i.valorUnitario),
        desconto: num(i.desconto),
        valorTotal: num(i.valorTotal),
      })),
    parcelas: lido.parcelas.map((p) => ({
      vencimento: txt(p.vencimento),
      valor: num(p.valor),
    })),
    observacoes: txt(lido.observacoes),
  };
}

/** Interpretação sem a rede de segurança (lança em caso de erro interno; usada nos testes). */
export function interpretarOuLancar(texto: TextoExtraido, opcoes: OpcoesInterpretacao = {}): DocumentoLido {
  const doc = construirDoc(texto);
  const ancoras = encontrarAncoras(doc);
  const tipo = classificar(doc, ancoras);
  const datas = encontrarDatas(doc.textoCompleto).map((d) => d.valor);
  const referencia = opcoes.dataReferencia ?? (datas.length ? datas.reduce((a, b) => (b > a ? b : a)) : null);

  let r: Resultado;
  switch (tipo) {
    case "NFE":
      r = interpretarDanfe(doc, ancoras);
      break;
    case "NFCE":
      r = interpretarNfce(doc, ancoras);
      break;
    case "NFSE":
      r = interpretarNfse(doc, ancoras);
      break;
    case "BOLETO":
      r = interpretarBoleto(doc, ancoras, referencia);
      break;
    case "GUIA":
      r = interpretarGuia(doc, ancoras, "GUIA");
      break;
    case "RECIBO":
      r = interpretarRecibo(doc, ancoras);
      break;
    case "OUTRO":
      r =
        ancoras.pagamento?.tipo === "ARRECADACAO"
          ? interpretarGuia(doc, ancoras, "OUTRO")
          : interpretarGenerico(doc, ancoras);
      break;
    default:
      r = { lido: documentoVazio("NAO_E_DOCUMENTO") };
  }
  const lido = sanear(r.lido);
  lido.legibilidade = avaliarLegibilidade(doc, lido, {
    temCodigoPagamento: ancoras.pagamento !== null,
    incompleto: r.incompleto,
  });
  return documentoLidoSchema.parse(lido);
}

export function interpretarDocumento(texto: TextoExtraido, opcoes: OpcoesInterpretacao = {}): DocumentoLido {
  try {
    return interpretarOuLancar(texto, opcoes);
  } catch {
    // nunca deve acontecer; se acontecer, o usuário preenche à mão
    const vazio = documentoVazio("OUTRO");
    vazio.legibilidade = "RUIM";
    vazio.observacoes = "Não foi possível interpretar o texto lido; preencha os dados manualmente.";
    return vazio;
  }
}

export type { DocumentoLido };
