import { describe, expect, it, vi } from "vitest";
import { comPrazo, ErroLeitura, MSG_DEMOROU, MSG_OCUPADO, Semaforo, unicoNoProcesso } from "../semaforo";

function adiada<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tique = () => new Promise((r) => setTimeout(r, 0));

describe("Semaforo", () => {
  it("roda uma tarefa por vez, na ordem de chegada", async () => {
    const s = new Semaforo(1, 5);
    const ordem: string[] = [];
    const a = adiada();
    const pa = s.executar(async () => {
      ordem.push("a início");
      await a.promise;
      ordem.push("a fim");
    });
    const pb = s.executar(async () => void ordem.push("b"));
    const pc = s.executar(async () => void ordem.push("c"));
    await tique();
    expect(s.emExecucao).toBe(1);
    expect(s.naFila).toBe(2);
    expect(ordem).toEqual(["a início"]);
    a.resolve();
    await Promise.all([pa, pb, pc]);
    expect(ordem).toEqual(["a início", "a fim", "b", "c"]);
    expect(s.emExecucao).toBe(0);
  });

  it("recusa na hora com a mensagem amigável quando a fila está cheia", async () => {
    const s = new Semaforo(1, 2);
    const trava = adiada();
    const ocupando = s.executar(() => trava.promise);
    const esperando = [s.executar(async () => 1), s.executar(async () => 2)];
    const recusada = s.executar(async () => 3);
    await expect(recusada).rejects.toThrow(MSG_OCUPADO);
    await expect(recusada).rejects.toBeInstanceOf(ErroLeitura);
    trava.resolve();
    await ocupando;
    await expect(Promise.all(esperando)).resolves.toEqual([1, 2]);
  });

  it("libera a vaga quando a tarefa falha", async () => {
    const s = new Semaforo(1, 1);
    await expect(s.executar(async () => Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    await expect(s.executar(async () => "ok")).resolves.toBe("ok");
  });

  it("desiste de esperar depois do tempo máximo", async () => {
    vi.useFakeTimers();
    try {
      const s = new Semaforo(1, 5);
      const trava = adiada();
      const ocupando = s.executar(() => trava.promise);
      const esperando = s.executar(async () => "nunca", { esperaMaximaMs: 1000 });
      const verificacao = expect(esperando).rejects.toThrow(MSG_OCUPADO);
      await vi.advanceTimersByTimeAsync(1001);
      await verificacao;
      expect(s.naFila).toBe(0);
      trava.resolve();
      await ocupando;
      expect(s.emExecucao).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("concorrência maior que 1", async () => {
    const s = new Semaforo(2, 5);
    const a = adiada();
    const b = adiada();
    s.executar(() => a.promise);
    s.executar(() => b.promise);
    const c = s.executar(async () => "c");
    await tique();
    expect(s.emExecucao).toBe(2);
    expect(s.naFila).toBe(1);
    a.resolve();
    await expect(c).resolves.toBe("c");
    b.resolve();
  });
});

describe("comPrazo", () => {
  it("devolve o resultado dentro do prazo", async () => {
    await expect(comPrazo(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("estoura o prazo com mensagem amigável e chama aoEstourar", async () => {
    vi.useFakeTimers();
    try {
      const aoEstourar = vi.fn();
      const p = comPrazo(new Promise(() => {}), 500, aoEstourar);
      const verificacao = expect(p).rejects.toThrow(MSG_DEMOROU);
      await vi.advanceTimersByTimeAsync(501);
      await verificacao;
      expect(aoEstourar).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("unicoNoProcesso", () => {
  it("cria uma vez só por chave", () => {
    const criar = vi.fn(() => ({ id: Math.random() }));
    const a = unicoNoProcesso("teste-unico", criar);
    const b = unicoNoProcesso("teste-unico", criar);
    expect(a).toBe(b);
    expect(criar).toHaveBeenCalledOnce();
  });
});
