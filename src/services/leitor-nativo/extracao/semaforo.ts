/**
 * Fila com limite para a parte pesada da leitura (sharp, zxing, Tesseract).
 *
 * No Cloud Run a instância tem 1 vCPU e 1 GiB e recebe até 40 requisições ao
 * mesmo tempo. Duas imagens processadas em paralelo não ficam mais rápidas
 * (a CPU é uma só) e dobram o pico de memória; por isso a etapa pesada roda
 * uma de cada vez, com poucas na espera. Acima disso a leitura é recusada na
 * hora com uma mensagem amigável — o usuário segue com o anexo e o
 * preenchimento manual, em vez de ficar esperando um minuto.
 */

export class ErroLeitura extends Error {
  constructor(mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = "ErroLeitura";
  }
}

export const MSG_OCUPADO = "Muitas leituras ao mesmo tempo — aguarde um minuto e tente de novo.";
export const MSG_DEMOROU = "A leitura do documento demorou demais. Tente uma foto mais nítida ou preencha manualmente.";

export class Semaforo {
  private ativos = 0;
  private readonly espera: Array<() => void> = [];

  constructor(
    private readonly concorrencia: number,
    private readonly maxNaFila: number,
  ) {}

  get emExecucao() {
    return this.ativos;
  }

  get naFila() {
    return this.espera.length;
  }

  /**
   * Executa `tarefa` quando houver vaga. Recusa na hora (`ErroLeitura` com
   * `MSG_OCUPADO`) se já houver `maxNaFila` tarefas esperando, ou se a
   * espera passar de `esperaMaximaMs`.
   */
  async executar<T>(tarefa: () => Promise<T>, opcoes: { esperaMaximaMs?: number } = {}): Promise<T> {
    await this.entrar(opcoes.esperaMaximaMs);
    try {
      return await tarefa();
    } finally {
      this.sair();
    }
  }

  private entrar(esperaMaximaMs?: number): Promise<void> {
    if (this.ativos < this.concorrencia && this.espera.length === 0) {
      this.ativos++;
      return Promise.resolve();
    }
    if (this.espera.length >= this.maxNaFila) {
      return Promise.reject(new ErroLeitura(MSG_OCUPADO));
    }
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const vez = () => {
        if (timer) clearTimeout(timer);
        this.ativos++;
        resolve();
      };
      this.espera.push(vez);
      if (esperaMaximaMs != null) {
        timer = setTimeout(() => {
          const i = this.espera.indexOf(vez);
          if (i >= 0) {
            this.espera.splice(i, 1);
            reject(new ErroLeitura(MSG_OCUPADO));
          }
        }, esperaMaximaMs);
        timer.unref?.();
      }
    });
  }

  private sair() {
    this.ativos--;
    const proxima = this.espera.shift();
    if (proxima) proxima();
  }
}

/**
 * Rejeita com `ErroLeitura(MSG_DEMOROU)` se a promessa não terminar em `ms`.
 * `aoEstourar` roda no estouro (ex.: encerrar o worker do Tesseract, que é
 * o único jeito de interromper um reconhecimento em andamento).
 */
export function comPrazo<T>(promessa: Promise<T>, ms: number, aoEstourar?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        aoEstourar?.();
      } finally {
        reject(new ErroLeitura(MSG_DEMOROU));
      }
    }, ms);
    timer.unref?.();
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(timer));
}

/**
 * Singleton por processo. O Next pode carregar este módulo mais de uma vez
 * (chunks de rotas diferentes, HMR em dev); guardar em `globalThis` garante
 * uma fila e um worker de OCR só por processo.
 */
export function unicoNoProcesso<T>(chave: string, criar: () => T): T {
  const g = globalThis as unknown as Record<symbol, T | undefined>;
  const simbolo = Symbol.for(`gestao-obras.leitor-nativo.${chave}`);
  return (g[simbolo] ??= criar());
}
