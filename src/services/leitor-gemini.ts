/**
 * Análise de documento de custo com o Gemini (visão + PDF + saída estruturada),
 * acionada pelo usuário na conferência quando a leitura nativa
 * (`leitor-nativo/`) deixou muitos campos em dúvida. Só transcreve o documento
 * no formato `DocumentoLido`; as conferências (dígitos verificadores, somas,
 * cruzamento com a chave) continuam em `normalizarLeitura`.
 *
 * Configuração (variáveis de ambiente, só no servidor) — uma das duas:
 * - Vertex AI (produção no Cloud Run): `GEMINI_PROJETO` (ID do projeto GCP) e,
 *   opcional, `GEMINI_LOCAL` (padrão "global"). Autentica com a service account
 *   da instância — sem chave guardada;
 * - Gemini API (desenvolvimento): `GEMINI_API_KEY`.
 * `GEMINI_MODELO` troca o modelo (padrão abaixo).
 */
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { documentoLidoSchema, type DocumentoLido } from "./leitura-documento";
import type { MidiaDocumento } from "./leitor-nativo/tipos";

/** Estável na Vertex AI até maio de 2027, no mínimo. */
export const MODELO_PADRAO = "gemini-3.5-flash";

export function analiseIaDisponivel(): boolean {
  return Boolean(process.env.GEMINI_PROJETO || process.env.GEMINI_API_KEY);
}

export const INSTRUCOES = `Você transcreve documentos de despesa brasileiros (DANFE de NF-e, cupom NFC-e, NFS-e de prefeitura, recibo, boleto, guia de imposto) enviados por uma construtora — geralmente fotos de celular ou PDFs.

Regras:
- Transcreva só o que está impresso. Campo ausente, cortado ou ilegível = null. Nunca invente nem estime valores.
- Valores em reais como número com ponto decimal (R$ 1.234,56 → 1234.56). Datas em AAAA-MM-DD.
- CNPJ/CPF e chave de acesso só com dígitos. A chave tem 44 dígitos e aparece no DANFE em blocos de 4, perto do código de barras, ou no QR Code/rodapé da NFC-e. Se algum dígito estiver ilegível, devolva null. Em NFS-e, chaveAcesso = null.
- Emitente é quem vendeu ou prestou o serviço (em recibo, quem recebeu o pagamento; em guia de imposto, o órgão, ex.: "Simples Nacional"). Destinatário é quem comprou ou contratou (destinatário da NF-e, tomador da NFS-e, pagador do boleto/recibo, contribuinte da guia).
- Itens: uma entrada por linha do quadro de produtos/serviços, na ordem. valorTotal é o total da linha. Em NFS-e, a discriminação do serviço é um item SERVICO.
- valorTotal do documento: "Valor total da nota", "Valor a pagar" ou "Valor do documento". Em NFS-e, o valor bruto do serviço; o líquido e as retenções (ISS, INSS) vão em observacoes.
- Frete e IPI/ST/seguro/outras despesas do quadro de totais vão nos campos próprios, não como itens (exceto se já forem linhas do quadro de itens).
- Parcelas: duplicatas da fatura ou o vencimento do boleto. Deixe vazio se não houver vencimento impresso.
- Use observacoes para avisar o que impede a conferência (ex.: "foto cortada após o item 12").`;

/**
 * JSON Schema do `DocumentoLido` no subconjunto aceito pelo Gemini
 * (`responseJsonSchema`): sem `$schema`; anulável vira `anyOf` com `null`.
 */
export function schemaParaGemini(): Record<string, unknown> {
  const schema = { ...(z.toJSONSchema(documentoLidoSchema) as Record<string, unknown>) };
  delete schema.$schema;
  return schema;
}

/**
 * Converte o texto JSON devolvido pelo modelo em `DocumentoLido` validado.
 * Lança `Error` com mensagem para o usuário se vier fora do formato.
 */
export function interpretarResposta(texto: string | undefined): DocumentoLido {
  if (!texto?.trim()) throw new Error("A IA não devolveu dados para este documento. Preencha manualmente.");
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("A IA devolveu uma resposta incompleta. Tente de novo.");
  }
  const r = documentoLidoSchema.safeParse(json);
  if (!r.success) throw new Error("A IA devolveu os dados num formato inesperado. Tente de novo.");
  return r.data;
}

function cliente(): GoogleGenAI {
  const projeto = process.env.GEMINI_PROJETO;
  if (projeto) {
    return new GoogleGenAI({ vertexai: true, project: projeto, location: process.env.GEMINI_LOCAL || "global" });
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/**
 * Analisa o documento. Lança `Error` com mensagem para o usuário quando a API
 * falha ou não devolve um resultado aproveitável.
 */
export async function analisarComGemini(arquivo: Buffer, midia: MidiaDocumento): Promise<DocumentoLido> {
  if (!analiseIaDisponivel()) throw new Error("A análise com IA não está configurada neste servidor.");

  let resposta;
  try {
    resposta = await cliente().models.generateContent({
      model: process.env.GEMINI_MODELO || MODELO_PADRAO,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: midia, data: arquivo.toString("base64") } },
            { text: "Transcreva este documento no formato pedido." },
          ],
        },
      ],
      config: {
        systemInstruction: INSTRUCOES,
        responseMimeType: "application/json",
        responseJsonSchema: schemaParaGemini(),
        maxOutputTokens: 16000,
        abortSignal: AbortSignal.timeout(120_000),
      },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) {
        throw new Error("Análise com IA indisponível: sem permissão no Gemini (confira a configuração).");
      }
      if (e.status === 429) throw new Error("Muitas análises ao mesmo tempo — aguarde um minuto e tente de novo.");
      if (e.status === 400) {
        throw new Error("O arquivo não pôde ser analisado (formato ou tamanho não aceito). Tente outra foto ou PDF.");
      }
      throw new Error("O serviço de IA está instável — tente de novo em instantes.");
    }
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error("A análise com IA demorou demais — tente de novo.");
    }
    throw new Error("Sem conexão com o serviço de IA — tente de novo em instantes.");
  }

  const motivo = resposta.candidates?.[0]?.finishReason;
  if (motivo === "MAX_TOKENS") {
    throw new Error("Não foi possível analisar o documento inteiro. Preencha os dados manualmente.");
  }
  if (motivo && motivo !== "STOP") {
    throw new Error("O serviço de IA não processou este arquivo. Preencha os dados manualmente.");
  }
  return interpretarResposta(resposta.text);
}
