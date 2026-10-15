/**
 * OCR gerenciado: Cloud Vision `DOCUMENT_TEXT_DETECTION` via REST.
 *
 * Autenticação pelo ADC (`google-auth-library`): no Cloud Run é a conta de
 * serviço da revisão, pelo servidor de metadados, sem chave; em dev, o
 * `gcloud auth application-default login`. Basta a API
 * `vision.googleapis.com` ativa no projeto — o Vision não exige papel IAM
 * específico para anotar conteúdo enviado inline.
 *
 * - foto: `images:annotate` com o JPEG já girado pelo EXIF;
 * - PDF escaneado: `files:annotate` síncrono com o PDF inline (o Vision lê
 *   as 5 primeiras páginas; não precisa renderizar nada no servidor).
 *
 * Opcional: `OCR_VISION_ENDPOINT` troca o endpoint (ex.:
 * `https://eu-vision.googleapis.com` para processar na União Europeia).
 */
import { GoogleAuth } from "google-auth-library";
import { ErroLeitura, unicoNoProcesso } from "./semaforo";
import {
  anotacoesDoArquivo,
  ErroVisionResposta,
  mensagemErroVision,
  type AnotacaoVision,
  type RespostaArquivosVision,
  type RespostaImagensVision,
} from "./vision-conversao";

const ESCOPO = "https://www.googleapis.com/auth/cloud-vision";
const PRAZO_MS = 60_000;

/** O JSON da requisição tem limite de 10 MB; em base64 o arquivo cresce ~37 %. */
export const MAX_BYTES_INLINE = 7 * 1024 * 1024;

const auth = unicoNoProcesso("vision-auth", () => new GoogleAuth({ scopes: [ESCOPO] }));

function endpoint() {
  return (process.env.OCR_VISION_ENDPOINT || "https://vision.googleapis.com").replace(/\/+$/, "");
}

const RECURSOS = [{ type: "DOCUMENT_TEXT_DETECTION" }];
const CONTEXTO = { languageHints: ["pt"] };

async function postar<T>(caminho: string, corpo: unknown): Promise<T> {
  try {
    const cliente = await auth.getClient();
    const resposta = await cliente.request<T>({
      url: `${endpoint()}${caminho}`,
      method: "POST",
      data: corpo,
      timeout: PRAZO_MS,
      retry: true,
      retryConfig: { retry: 2, httpMethodsToRetry: ["POST"], statusCodesToRetry: [[500, 599]] },
    });
    return resposta.data;
  } catch (e) {
    const err = e as { status?: number; response?: { status?: number }; code?: string | number; message?: string };
    const http = err.response?.status ?? err.status;
    console.error("[leitor-nativo] falha no Cloud Vision", http ?? err.code, err.message);
    throw new ErroLeitura(
      mensagemErroVision({
        http,
        rede: typeof err.code === "string" ? err.code : undefined,
        mensagem: err.message,
      }),
      { cause: e },
    );
  }
}

/** Converte o erro que veio no corpo da resposta (HTTP 200) em `ErroLeitura`. */
export function tratarErroResposta(e: unknown): never {
  if (e instanceof ErroVisionResposta) {
    console.error("[leitor-nativo] Cloud Vision devolveu erro", e.status);
    throw new ErroLeitura(mensagemErroVision({ rpc: e.status.code, mensagem: e.status.message }), { cause: e });
  }
  throw e;
}

/** OCR de uma imagem (JPEG/PNG). */
export async function anotarImagem(imagem: Buffer): Promise<AnotacaoVision[]> {
  if (imagem.length > MAX_BYTES_INLINE) {
    throw new ErroLeitura("A imagem é grande demais para a leitura automática. Envie uma foto menor.");
  }
  const resposta = await postar<RespostaImagensVision>("/v1/images:annotate", {
    requests: [{ image: { content: imagem.toString("base64") }, features: RECURSOS, imageContext: CONTEXTO }],
  });
  return resposta.responses ?? [];
}

/**
 * OCR das imagens de várias páginas (página n = n-ésima imagem), agrupadas
 * em chamadas que respeitem o limite de tamanho da requisição.
 */
export async function anotarImagens(imagens: Buffer[]): Promise<AnotacaoVision[]> {
  const grupos: Buffer[][] = [];
  let tamanho = Infinity;
  for (const img of imagens) {
    if (img.length > MAX_BYTES_INLINE) {
      throw new ErroLeitura("A imagem é grande demais para a leitura automática. Envie uma foto menor.");
    }
    if (tamanho + img.length > MAX_BYTES_INLINE) {
      grupos.push([]);
      tamanho = 0;
    }
    grupos[grupos.length - 1].push(img);
    tamanho += img.length;
  }
  const anotacoes: AnotacaoVision[] = [];
  for (const grupo of grupos) {
    const resposta = await postar<RespostaImagensVision>("/v1/images:annotate", {
      requests: grupo.map((img) => ({
        image: { content: img.toString("base64") },
        features: RECURSOS,
        imageContext: CONTEXTO,
      })),
    });
    for (const r of resposta.responses ?? []) {
      anotacoes.push({ ...r, context: { ...r.context, pageNumber: anotacoes.length + 1 } });
    }
  }
  return anotacoes;
}

/** OCR de um PDF (até 5 páginas, síncrono). */
export async function anotarPdf(pdf: Buffer): Promise<AnotacaoVision[]> {
  const resposta = await postar<RespostaArquivosVision>("/v1/files:annotate", {
    requests: [
      {
        inputConfig: { content: pdf.toString("base64"), mimeType: "application/pdf" },
        features: RECURSOS,
        imageContext: CONTEXTO,
      },
    ],
  });
  try {
    return anotacoesDoArquivo(resposta);
  } catch (e) {
    tratarErroResposta(e);
  }
}
