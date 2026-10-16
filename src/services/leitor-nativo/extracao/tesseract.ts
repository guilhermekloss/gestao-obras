import { createWorker, OEM, PSM, type Page, type Worker } from "tesseract.js";
import type { Worker as WorkerThread } from "node:worker_threads";
import { arquivoDoPacote } from "./caminhos";
import type { PalavraBruta } from "./linhas";
import { comPrazo, ErroLeitura, unicoNoProcesso } from "./semaforo";

// Sem DPI fixo o Tesseract estima a resolução da foto e às vezes descarta blocos.
const DPI = "300";
// Worker reciclado (ocioso ou após MAX_JOBS): o heap WASM do tesseract não encolhe.
const OCIOSO_MS = 90_000;
const MAX_JOBS = 50;
const PRAZO_OCR_MS = 90_000;
const CONFIANCA_BOA = 70;
const FRACAO_BOA = 0.9;
const MIN_CARACTERES_BONS = 150;

const MSG_OCR_INDISPONIVEL =
  "Leitura automática indisponível no momento (o leitor de imagens não iniciou). Preencha os dados manualmente.";
const MSG_OCR_FALHOU = "Não foi possível ler o texto da imagem. Tente outra foto ou preencha manualmente.";

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
    cacheMethod: "none", // no Cloud Run o /tmp ocupa RAM
    gzip: true,
    // Sem isto, um erro dentro do worker vira exceção não tratada e derruba o processo.
    errorHandler: (e: unknown) => console.error("[leitor-nativo] erro no worker do Tesseract", e),
  });
  // Erro fatal na thread (ex.: falta de memória no WASM): descarta o worker.
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
  }
}

type ResultadoOcrLocal = { palavras: PalavraBruta[]; inclinacao: number | undefined };

type BlocoTesseract = NonNullable<Page["blocks"]>[number];

type Passada = { blocos: BlocoTesseract[]; bons: number; total: number };

async function passada(worker: Worker, imagem: Buffer, modo: PSM): Promise<Passada> {
  await worker.setParameters({ tessedit_pageseg_mode: modo });
  const resultado = await comPrazo(
    worker.recognize(imagem, {}, { blocks: true, text: false }),
    PRAZO_OCR_MS,
    () => void descartarTesseract(), // única forma de parar um reconhecimento em andamento
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

function palavrasDoTesseract(blocos: BlocoTesseract[]): PalavraBruta[] {
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

// Linhas de base curtas (< 100 px) medem mal a inclinação.
function inclinacaoDoTesseract(blocos: BlocoTesseract[]): number | undefined {
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
