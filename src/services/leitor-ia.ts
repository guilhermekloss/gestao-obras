/**
 * Leitura de foto/PDF de documento de custo com o Claude (visão + PDF nativo
 * + saída estruturada). Só transcreve o documento no formato
 * `DocumentoLido`; a conferência e a conversão para o lançamento ficam em
 * `leitura-documento.ts` (puro, testado).
 *
 * Configuração (variáveis de ambiente, só no servidor):
 * - `ANTHROPIC_API_KEY` — sem ela a leitura automática fica desligada e a
 *   tela segue com anexo + preenchimento manual;
 * - `LEITURA_NF_MODELO` — opcional, troca o modelo (padrão abaixo).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { documentoLidoSchema, type DocumentoLido } from "./leitura-documento";

const MODELO_PADRAO = "claude-opus-5-5";

export type MidiaDocumento = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export function leituraAutomaticaDisponivel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const INSTRUCOES = `Você transcreve documentos de despesa brasileiros (DANFE de NF-e, cupom NFC-e, NFS-e de prefeitura, recibo, boleto, guia de imposto) enviados por uma construtora — geralmente fotos de celular ou PDFs.

Regras:
- Transcreva só o que está impresso. Campo ausente, cortado ou ilegível = null. Nunca invente nem estime valores.
- Valores em reais como número com ponto decimal (R$ 1.234,56 → 1234.56). Datas em AAAA-MM-DD.
- CNPJ/CPF e chave de acesso só com dígitos. A chave tem 44 dígitos e aparece no DANFE em blocos de 4, perto do código de barras, ou no QR Code/rodapé da NFC-e. Se algum dígito estiver ilegível, devolva null.
- Emitente é quem vendeu ou prestou o serviço (não o destinatário/comprador).
- Itens: uma entrada por linha do quadro de produtos/serviços, na ordem. valorTotal é o total da linha. Em NFS-e, a discriminação do serviço é um item SERVICO.
- valorTotal do documento: "Valor total da nota", "Valor a pagar" ou "Valor do documento".
- Frete e IPI/ST/seguro/outras despesas do quadro de totais vão nos campos próprios, não como itens (exceto se já forem linhas do quadro de itens).
- Parcelas: duplicatas da fatura ou o vencimento do boleto. Deixe vazio se não houver vencimento impresso.
- Use observacoes para avisar o que impede a conferência (ex.: "foto cortada após o item 12").`;

/**
 * Lê o documento. Lança `Error` com mensagem para o usuário quando a API
 * falha ou não devolve um resultado aproveitável.
 */
export async function lerDocumentoComIa(arquivo: Buffer, midia: MidiaDocumento): Promise<DocumentoLido> {
  const client = new Anthropic({ timeout: 120_000, maxRetries: 2 });
  const dados = arquivo.toString("base64");
  const conteudo: Anthropic.Beta.BetaContentBlockParam =
    midia === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: midia, data: dados } }
      : { type: "image", source: { type: "base64", media_type: midia, data: dados } };

  let resposta;
  try {
    resposta = await client.beta.messages.parse({
      model: process.env.LEITURA_NF_MODELO || MODELO_PADRAO,
      max_tokens: 16000,
      system: INSTRUCOES,
      messages: [
        {
          role: "user",
          content: [conteudo, { type: "text", text: "Transcreva este documento no formato pedido." }],
        },
      ],
      output_config: { effort: "medium", format: betaZodOutputFormat(documentoLidoSchema) },
      // Se o modelo principal recusar, a API repete a leitura num modelo de reserva.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new Error("Leitura automática indisponível: chave da API inválida ou sem permissão.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error("Muitas leituras ao mesmo tempo — aguarde um minuto e tente de novo.");
    }
    if (e instanceof Anthropic.BadRequestError) {
      throw new Error("O arquivo não pôde ser lido (formato ou tamanho não aceito). Tente outra foto ou PDF.");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new Error("Sem conexão com o serviço de leitura — tente de novo em instantes.");
    }
    if (e instanceof Anthropic.APIError) {
      throw new Error("O serviço de leitura está instável — tente de novo em instantes.");
    }
    throw e;
  }

  if (resposta.stop_reason === "refusal") {
    throw new Error("O serviço de leitura não processou este arquivo. Preencha os dados manualmente.");
  }
  if (resposta.stop_reason === "max_tokens" || !resposta.parsed_output) {
    throw new Error("Não foi possível ler o documento inteiro. Preencha os dados manualmente.");
  }
  return resposta.parsed_output;
}
