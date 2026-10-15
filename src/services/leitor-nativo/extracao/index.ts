/**
 * Etapa de EXTRAÇÃO do leitor nativo (sem LLM): arquivo → `TextoExtraido`.
 *
 *   PDF com camada de texto ─► unpdf (texto + posição), exato e barato
 *   PDF escaneado ──────────► "vision": Cloud Vision `files:annotate`
 *                             "local":  imagens embutidas + Tesseract
 *   Foto (jpeg/png/webp) ───► sharp (EXIF, tamanho) ─► "vision" ou Tesseract
 *   Códigos de barras/QR ───► zxing-wasm, sempre local (foto e imagens do PDF)
 *
 * Configuração (variáveis de ambiente, só no servidor):
 * - `OCR_MOTOR` — `local` (padrão: tesseract.js, 100 % na instância) ou
 *   `vision` (Cloud Vision; a instância só prepara a imagem e lê códigos);
 * - `OCR_VISION_ENDPOINT` — opcional, endpoint regional do Vision.
 *
 * A parte pesada (sharp, pdf.js, zxing, Tesseract) passa por uma fila do
 * processo com UMA execução por vez e no máximo `MAX_NA_FILA` esperando —
 * ver `semaforo.ts`. As chamadas ao Vision têm fila própria, mais larga,
 * porque só esperam a rede.
 *
 * Falhas viram `Error` com mensagem em português para o usuário.
 */
import type { CodigoLido, MidiaDocumento, Pagina, TextoExtraido } from "../tipos";
import { lerCodigos, descartarZxing, semRepetidos } from "./codigos";
import { abrirImagem, imagemDeRaw, jpegParaVision, varianteParaOcr, type ImagemTrabalho } from "./imagem";
import { caracteresUteis, confiancaMedia, montarLinhas } from "./linhas";
import { abrirPdf, imagensDaPagina, MAX_PAGINAS, MIN_CARACTERES_PAGINA, paginasDoTexto, type ImagemPdf } from "./pdf";
import { ErroLeitura, Semaforo, unicoNoProcesso } from "./semaforo";
import { descartarTesseract, reconhecer } from "./tesseract";
import { anotarImagem, anotarImagens, anotarPdf, MAX_BYTES_INLINE, tratarErroResposta } from "./vision";
import { paginasDoVision, type AnotacaoVision } from "./vision-conversao";

type MotorOcr = "local" | "vision";

/** Motor de OCR configurado em `OCR_MOTOR` (padrão "local"). */
export function motorOcr(): MotorOcr {
  return (process.env.OCR_MOTOR || "").trim().toLowerCase() === "vision" ? "vision" : "local";
}

const MAX_NA_FILA = 5;
/** Quem espera na fila desiste depois disso (a leitura em si tem prazo próprio no Tesseract). */
const ESPERA_MAXIMA_MS = 90_000;

const filaPesada = unicoNoProcesso("fila-pesada", () => new Semaforo(1, MAX_NA_FILA));
const filaVision = unicoNoProcesso("fila-vision", () => new Semaforo(4, 20));

const pesado = <T>(tarefa: () => Promise<T>) => filaPesada.executar(tarefa, { esperaMaximaMs: ESPERA_MAXIMA_MS });

const MSG_FALHA_GERAL =
  "Não foi possível ler o arquivo. Tente outra foto ou PDF, ou preencha os dados manualmente.";
export const MSG_PDF_SEM_TEXTO =
  "Não foi possível ler este PDF (ele é uma imagem escaneada sem texto legível). Envie uma foto nítida do documento ou preencha manualmente.";

/**
 * Extrai o texto (com posições) e os códigos de barras/QR do arquivo.
 * Lança `Error` com mensagem para o usuário quando não dá para ler.
 */
export async function extrairTexto(arquivo: Buffer, midia: MidiaDocumento): Promise<TextoExtraido> {
  try {
    if (midia === "application/pdf") return await extrairDePdf(arquivo);
    return await extrairDeImagem(arquivo);
  } catch (e) {
    if (e instanceof ErroLeitura) throw e;
    console.error("[leitor-nativo] falha inesperada na extração", e);
    throw new ErroLeitura(MSG_FALHA_GERAL, { cause: e });
  }
}

/** Encerra o worker do Tesseract e descarta o WASM do zxing (testes e desligamento). */
export async function encerrarMotores(): Promise<void> {
  await descartarTesseract();
  descartarZxing();
}

// ---------------------------------------------------------------------------
// Foto

async function ocrLocal(img: ImagemTrabalho, numero: number): Promise<Pagina> {
  const variante = await varianteParaOcr(img);
  const { palavras, inclinacao } = await reconhecer(variante.png);
  return { numero, linhas: montarLinhas(palavras, variante.largura, variante.altura, { inclinacao }) };
}

async function extrairDeImagem(arquivo: Buffer): Promise<TextoExtraido> {
  if (motorOcr() === "local") {
    return pesado(async () => {
      const img = await abrirImagem(arquivo);
      const codigos = await lerCodigos(img, 1);
      const paginas = [await ocrLocal(img, 1)];
      return { origem: "ocr-local", paginas, codigos: semRepetidos(codigos), confiancaMedia: confiancaMedia(paginas) };
    });
  }

  const { jpeg, codigos } = await pesado(async () => {
    const img = await abrirImagem(arquivo);
    return { codigos: await lerCodigos(img, 1), jpeg: await jpegParaVision(img) };
  });
  const anotacoes = await filaVision.executar(() => anotarImagem(jpeg));
  return resultadoVision(anotacoes, codigos);
}

function resultadoVision(anotacoes: AnotacaoVision[], codigos: CodigoLido[]): TextoExtraido {
  let paginas: Pagina[];
  try {
    paginas = paginasDoVision(anotacoes);
  } catch (e) {
    tratarErroResposta(e);
  }
  return { origem: "ocr-vision", paginas, codigos: semRepetidos(codigos), confiancaMedia: confiancaMedia(paginas) };
}

// ---------------------------------------------------------------------------
// PDF

/** Imagens pequenas (QR embutido com 1 px por módulo) são ampliadas e ganham margem branca. */
async function codigosDasImagens(imagens: ImagemPdf[], numero: number): Promise<CodigoLido[]> {
  const codigos: CodigoLido[] = [];
  for (const img of imagens.slice(0, 6)) {
    const trabalho = await imagemDeRaw(img.data, img.width, img.height, img.channels, { ampliarPequena: true });
    codigos.push(...(await lerCodigos(trabalho, numero)));
  }
  return codigos;
}

type PlanoVisionPdf = { tipo: "arquivo" } | { tipo: "imagens"; jpegs: Buffer[] };

type ResultadoPesadoPdf =
  | { pronto: TextoExtraido }
  | { pronto?: undefined; plano: PlanoVisionPdf; codigos: CodigoLido[] };

async function extrairDePdf(arquivo: Buffer): Promise<TextoExtraido> {
  const motor = motorOcr();
  const etapa = await pesado(async (): Promise<ResultadoPesadoPdf> => {
    const pdf = await abrirPdf(arquivo);
    try {
      const total = Math.min(pdf.numPages, MAX_PAGINAS);
      const paginasTexto = await paginasDoTexto(pdf);
      const temTexto = paginasTexto.some((p) => caracteresUteis([p]) >= MIN_CARACTERES_PAGINA);

      const codigos: CodigoLido[] = [];
      const maiores: (ImagemPdf | undefined)[] = [];
      for (let n = 1; n <= total; n++) {
        const imagens = await imagensDaPagina(pdf, n).catch((e) => {
          console.error("[leitor-nativo] falha ao extrair imagens do PDF", e);
          return [] as ImagemPdf[];
        });
        codigos.push(...(await codigosDasImagens(imagens, n)));
        // para o OCR, só a maior imagem de cada página (no escaneado, é a página inteira)
        const maior = imagens[0];
        maiores.push(maior && Math.min(maior.width, maior.height) >= 200 ? maior : undefined);
      }

      if (temTexto) {
        return { pronto: { origem: "pdf-texto", paginas: paginasTexto, codigos: semRepetidos(codigos), confiancaMedia: null } };
      }

      if (motor === "vision") {
        if (arquivo.length <= MAX_BYTES_INLINE) return { plano: { tipo: "arquivo" }, codigos };
        // PDF grande demais para ir inline: manda as imagens das páginas
        const jpegs: Buffer[] = [];
        for (const img of maiores) {
          if (img) jpegs.push(await jpegParaVision(await imagemDeRaw(img.data, img.width, img.height, img.channels)));
        }
        if (!jpegs.length) throw new ErroLeitura(MSG_PDF_SEM_TEXTO);
        return { plano: { tipo: "imagens", jpegs }, codigos };
      }

      // local: OCR da maior imagem de cada página
      const paginas: Pagina[] = [];
      for (let n = 1; n <= total; n++) {
        const img = maiores[n - 1];
        if (!img) continue;
        paginas.push(await ocrLocal(await imagemDeRaw(img.data, img.width, img.height, img.channels), n));
      }
      if (!paginas.length || caracteresUteis(paginas) === 0) throw new ErroLeitura(MSG_PDF_SEM_TEXTO);
      return {
        pronto: { origem: "ocr-local", paginas, codigos: semRepetidos(codigos), confiancaMedia: confiancaMedia(paginas) },
      };
    } finally {
      await pdf.loadingTask.destroy().catch(() => {}); // libera a memória do documento
    }
  });

  if (etapa.pronto) return etapa.pronto;
  const { plano, codigos } = etapa;
  const anotacoes = await filaVision.executar(() =>
    plano.tipo === "arquivo" ? anotarPdf(arquivo) : anotarImagens(plano.jpegs),
  );
  const resultado = resultadoVision(anotacoes, codigos);
  if (caracteresUteis(resultado.paginas) === 0) throw new ErroLeitura(MSG_PDF_SEM_TEXTO);
  return resultado;
}
