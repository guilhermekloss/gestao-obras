/**
 * OCR local com tesseract.js 7 (WASM em `worker_threads`, sem binário nativo).
 *
 * - Idioma `por` do pacote `@tesseract.js-data/por` (4.0.0_best_int, só LSTM),
 *   lido do disco via `langPath` absoluto e `cacheMethod: "none"`: nunca
 *   baixa do CDN e nunca grava cache (no Cloud Run o /tmp ocupa RAM).
 * - UM worker por processo, criado na primeira leitura e reaproveitado. O
 *   heap do WASM cresce com a maior imagem e nunca encolhe, então o worker é
 *   encerrado depois de `OCIOSO_MS` parado ou de `MAX_JOBS` leituras.
 * - Quem chama segura a fila (`semaforo.ts`, concorrência 1); aqui fica o
 *   prazo por passada: estourou, o worker é encerrado (é o único jeito de
 *   parar um reconhecimento em andamento) e o próximo pedido cria outro.
 *
 * Como os parâmetros foram escolhidos (1 núcleo, linhas montadas por
 * `linhas.ts`):
 *
 * 1) Imagens sintéticas da pesquisa (DANFE, NFC-e, boleto; "limpa" e "foto"
 *    com 1,8°, desfoque, luz irregular e JPEG) — campos-chave achados:
 *      cinza+normalise, PSM 3 ............ 42/46 (DANFE foto perdeu a linha dos totais)
 *      cinza+normalise, PSM 6 ............ 41/46 (boleto foto: nada)
 *      cinza+normalise, PSM 11 ........... 43/46 (quebra "1.543,90" em "1 543,90")
 *      cinza+normalise, PSM 3, dpi 300 ... 45/46, instável (dpi 400: 40/46)
 *      cinza+CLAHE, PSM 3, dpi 200–400 ... 46/46, mas o CLAHE custa 0,5–1,7 s/imagem
 *      original, PSM 3, dpi 200–400 ...... 46/46
 *      threshold fixo .................... 39–40/46; ampliar 2× imagem pequena: 42/46
 * 2) Corpus realista (NF-e, NFC-e, NFS-e nacional e SP, boleto, DAS, recibo;
 *    PNG limpo, foto ≤ 2400 px e "foto forte" borrada e torta) — campos
 *    (total, CNPJs, chave, data) achados:
 *      PSM 3: limpo 28/28, foto 27/28, foto forte 7/28
 *      PSM 6: limpo 28/28, foto 28/28, foto forte 16/28 — mas a DANFE limpa
 *             perde itens (2/7 contra 6/7) e o boleto sintético foto some
 *      PSM 11/12: foto forte 10/28; ampliar 1,5–2× ou `sharpen`: sem ganho, 1,5–2× mais lento
 *
 * Escolha: imagem original reduzida a ≤ 2400 px (ver `imagem.ts`),
 * `user_defined_dpi` 300 (sem ele o Tesseract estima a resolução da foto e
 * às vezes descarta blocos inteiros) e PSM 3 (segmentação automática);
 * quando a passada sai fraca (menos de 90 % dos caracteres com confiança
 * ≥ 70, ou quase nada lido), roda também o PSM 6 (bloco único) e fica com
 * a passada que tiver mais caracteres confiáveis. Imagem boa paga uma
 * passada só; foto ruim paga duas.
 */
import { createWorker, OEM, PSM, type Page, type Worker } from "tesseract.js";
import type { Worker as WorkerThread } from "node:worker_threads";
import { arquivoDoPacote } from "./caminhos";
import type { PalavraBruta } from "./linhas";
import { comPrazo, ErroLeitura, unicoNoProcesso } from "./semaforo";

const DPI = "300";
const OCIOSO_MS = 90_000;
const MAX_JOBS = 50;
export const PRAZO_OCR_MS = 90_000;
/** Confiança (0..100) para um caractere contar como "confiável". */
const CONFIANCA_BOA = 70;
/** Passada fraca: fração de caracteres confiáveis abaixo disso, ou menos de `MIN_CARACTERES_BONS`. */
const FRACAO_BOA = 0.9;
const MIN_CARACTERES_BONS = 150;

export const MSG_OCR_INDISPONIVEL =
  "Leitura automática indisponível no momento (o leitor de imagens não iniciou). Preencha os dados manualmente.";
export const MSG_OCR_FALHOU = "Não foi possível ler o texto da imagem. Tente outra foto ou preencha manualmente.";

type EstadoTesseract = {
  worker: Promise<Worker> | null;
  jobs: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const estado = unicoNoProcesso<EstadoTesseract>("tesseract", () => ({ worker: null, jobs: 0, timer: null }));

async function criarWorker(): Promise<Worker> {
  const langPath = arquivoDoPacote("@tesseract.js-data/por", "4.0.0_best_int");
  const worker = await createWorker("por", OEM.LSTM_ONLY, {
    langPath,
    cacheMethod: "none",
    gzip: true,
    // Sem isto, um erro dentro do worker vira exceção não tratada e derruba o processo.
    errorHandler: (e: unknown) => console.error("[leitor-nativo] erro no worker do Tesseract", e),
  });
  // Erro fatal na thread (ex.: falta de memória no WASM): descarta o worker para o próximo pedido criar outro.
  const thread = (worker as unknown as { worker?: WorkerThread }).worker;
  thread?.on("error", (e) => {
    console.error("[leitor-nativo] worker do Tesseract caiu", e);
    void descartarTesseract();
  });
  await worker.setParameters({ user_defined_dpi: DPI });
  return worker;
}

function obterWorker(): Promise<Worker> {
  if (!estado.worker) {
    const criacao = criarWorker();
    estado.worker = criacao;
    estado.jobs = 0;
    criacao.catch(() => {
      if (estado.worker === criacao) estado.worker = null;
    });
  }
  return estado.worker;
}

/** Encerra o worker (ocioso, reciclagem, prazo estourado ou fim dos testes). */
export async function descartarTesseract(): Promise<void> {
  if (estado.timer) clearTimeout(estado.timer);
  estado.timer = null;
  const atual = estado.worker;
  estado.worker = null;
  estado.jobs = 0;
  if (!atual) return;
  try {
    await (await atual).terminate();
  } catch {
    // já tinha caído ou nem chegou a subir
  }
}

export type ResultadoOcrLocal = { palavras: PalavraBruta[]; inclinacao: number | undefined };

type BlocoTesseract = NonNullable<Page["blocks"]>[number];

type Passada = { blocos: BlocoTesseract[]; bons: number; total: number };

async function passada(worker: Worker, imagem: Buffer, modo: PSM): Promise<Passada> {
  await worker.setParameters({ tessedit_pageseg_mode: modo });
  const resultado = await comPrazo(
    worker.recognize(imagem, {}, { blocks: true, text: false }),
    PRAZO_OCR_MS,
    () => void descartarTesseract(),
  );
  const blocos = resultado.data.blocks ?? [];
  let bons = 0;
  let total = 0;
  for (const b of blocos)
    for (const p of b.paragraphs)
      for (const l of p.lines)
        for (const w of l.words) {
          const n = w.text.replace(/\s/g, "").length;
          total += n;
          if (w.confidence >= CONFIANCA_BOA) bons += n;
        }
  return { blocos, bons, total };
}

const fraca = (p: Passada) => p.bons < MIN_CARACTERES_BONS || p.bons < FRACAO_BOA * p.total;

/**
 * Reconhece uma imagem (PNG/JPEG): palavras com caixa em pixels e confiança
 * 0..1, mais a inclinação da página medida pelas linhas de base.
 */
export async function reconhecer(imagem: Buffer): Promise<ResultadoOcrLocal> {
  if (estado.timer) clearTimeout(estado.timer);
  estado.timer = null;

  let worker: Worker;
  try {
    worker = await obterWorker();
  } catch (e) {
    console.error("[leitor-nativo] não foi possível iniciar o Tesseract", e);
    throw new ErroLeitura(MSG_OCR_INDISPONIVEL, { cause: e });
  }

  try {
    let melhor = await passada(worker, imagem, PSM.AUTO);
    if (fraca(melhor)) {
      const bloco = await passada(worker, imagem, PSM.SINGLE_BLOCK);
      if (bloco.bons > melhor.bons) melhor = bloco;
    }
    return { palavras: palavrasDoTesseract(melhor.blocos), inclinacao: inclinacaoDoTesseract(melhor.blocos) };
  } catch (e) {
    if (e instanceof ErroLeitura) throw e;
    // falha dentro do worker: recomeça do zero no próximo pedido
    console.error("[leitor-nativo] falha no reconhecimento do Tesseract", e);
    await descartarTesseract();
    throw new ErroLeitura(MSG_OCR_FALHOU, { cause: e });
  } finally {
    if (estado.worker) {
      if (++estado.jobs >= MAX_JOBS) {
        await descartarTesseract();
      } else {
        estado.timer = setTimeout(() => void descartarTesseract(), OCIOSO_MS);
        estado.timer.unref?.();
      }
    }
  }
}

/**
 * Converte a saída em blocos do Tesseract em palavras soltas (a linha é
 * remontada em `linhas.ts`). Descarta o "lixo" típico de bordas de tabela:
 * palavras sem letra nem dígito e com confiança baixa ("|", "—", "_").
 */
export function palavrasDoTesseract(blocos: BlocoTesseract[]): PalavraBruta[] {
  const palavras: PalavraBruta[] = [];
  for (const bloco of blocos)
    for (const paragrafo of bloco.paragraphs)
      for (const linha of paragrafo.lines)
        for (const w of linha.words) {
          const texto = w.text.trim();
          const confianca = Math.max(0, Math.min(1, w.confidence / 100));
          if (!texto) continue;
          if (!/[\p{L}\p{N}]/u.test(texto) && confianca < 0.5) continue;
          palavras.push({ texto, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confianca });
        }
  return palavras;
}

/**
 * Inclinação da página (dy/dx) pela linha de base que o Tesseract mede em
 * cada linha — bem mais precisa que comparar caixas de palavras. Mediana
 * ponderada pelo comprimento, sem as linhas curtas (< 100 px), que medem mal.
 * `undefined` se não houver linhas suficientes (aí `linhas.ts` estima).
 */
export function inclinacaoDoTesseract(blocos: BlocoTesseract[]): number | undefined {
  const medidas: { s: number; peso: number }[] = [];
  for (const bloco of blocos)
    for (const paragrafo of bloco.paragraphs)
      for (const linha of paragrafo.lines) {
        const b = linha.baseline;
        const dx = b ? b.x1 - b.x0 : 0;
        if (dx >= 100) medidas.push({ s: (b.y1 - b.y0) / dx, peso: dx });
      }
  if (medidas.length < 3) return undefined;
  medidas.sort((a, b) => a.s - b.s);
  const total = medidas.reduce((t, m) => t + m.peso, 0);
  let acumulado = 0;
  for (const m of medidas) {
    acumulado += m.peso;
    if (acumulado >= total / 2) return m.s;
  }
  return undefined;
}
