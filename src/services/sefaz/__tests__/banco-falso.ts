import { vi } from "vitest";
import type { ClienteSefaz } from "../cliente";
import type { RetornoDistribuicao } from "../xml";

// Banco em memória com só o que o orquestrador usa.
type Linha = Record<string, unknown>;
export const banco = {
  cursores: new Map<string, Linha>(),
  documentos: [] as Linha[],
  execucoes: [] as Linha[],
  notas: [] as { id: string; chaveNfe: string }[],
};

function casa(linha: Linha, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Record<string, unknown>[]).some((w) => casa(linha, w));
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const op = v as { in?: unknown[]; lt?: Date; not?: unknown };
      if (op.in) return op.in.includes(linha[k]);
      if (op.lt) return linha[k] instanceof Date && (linha[k] as Date) < op.lt;
      if ("not" in op) return linha[k] !== op.not;
    }
    return (linha[k] ?? null) === v;
  });
}

function aplicar(linha: Linha, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) if (v !== undefined) linha[k] = v;
}

let seq = 0;
export const prisma = {
  cursorSefaz: {
    findUnique: vi.fn(async ({ where }: { where: { cnpj: string } }) => {
      const c = banco.cursores.get(where.cnpj);
      return c ? { ...c } : null;
    }),
    upsert: vi.fn(async ({ where, create }: { where: { cnpj: string }; create: Linha }) => {
      if (!banco.cursores.has(where.cnpj)) {
        banco.cursores.set(where.cnpj, {
          ultNsu: "000000000000000",
          maxNsu: "000000000000000",
          proximaConsultaEm: null,
          bloqueadoAte: null,
          travadoAte: null,
          ...create,
        });
      }
      return banco.cursores.get(where.cnpj);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
      const c = banco.cursores.get(where.cnpj as string);
      if (!c || !casa(c, where)) return { count: 0 };
      aplicar(c, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: { where: { cnpj: string }; data: Linha }) => {
      aplicar(banco.cursores.get(where.cnpj)!, data);
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { cnpj: string } }) => ({ ...banco.cursores.get(where.cnpj)! })),
  },
  documentoSefaz: {
    findUnique: vi.fn(async ({ where }: { where: { chave: string } }) => banco.documentos.find((d) => d.chave === where.chave) ?? null),
    findMany: vi.fn(async ({ where, take }: { where: Linha; take: number }) =>
      banco.documentos.filter((d) => casa(d, where)).slice(0, take),
    ),
    create: vi.fn(async ({ data }: { data: Linha }) => {
      if (banco.documentos.some((d) => d.chave === data.chave)) throw new Error("unique chave");
      const linha = { id: `doc${++seq}`, manifestacaoErro: null, xmlUrl: null, notaFiscalId: null, ...data };
      banco.documentos.push(linha);
      return linha;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Linha }) => {
      aplicar(banco.documentos.find((d) => d.id === where.id)!, data);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
      const alvo = banco.documentos.filter((d) => casa(d, where));
      alvo.forEach((d) => aplicar(d, data));
      return { count: alvo.length };
    }),
  },
  notaFiscal: {
    findUnique: vi.fn(async ({ where }: { where: { chaveNfe: string } }) => banco.notas.find((n) => n.chaveNfe === where.chaveNfe) ?? null),
  },
  execucaoSefaz: {
    create: vi.fn(async ({ data }: { data: Linha }) => banco.execucoes.push(data)),
  },
};

export const storage = {
  salvar: vi.fn(async () => `/api/fotos/1760000000000-${String(++seq).padStart(12, "0")}.xml`),
  excluir: vi.fn(async () => undefined),
  ler: vi.fn(),
};
export const registrarAtividade = vi.fn(async () => undefined);

export const AGORA = new Date("2026-10-17T13:00:00Z");
export const relogio = () => new Date(AGORA);

export function clienteFalso(respostas: RetornoDistribuicao[], ciencia?: ClienteSefaz["enviarCiencia"]) {
  const distribuicaoPorNsu = vi.fn(async () => {
    const r = respostas.shift();
    if (!r) throw new Error("consulta a mais");
    return r;
  });
  const enviarCiencia = vi.fn(
    ciencia ?? (async (_cnpj: string, chaves: string[]) => chaves.map((chave) => ({ chave, cStat: "135", xMotivo: "ok" }))),
  );
  return { distribuicaoPorNsu, enviarCiencia } satisfies ClienteSefaz;
}

export const ctx = (cliente: ClienteSefaz, origem: "AGENDADA" | "MANUAL" = "AGENDADA") => ({
  cliente,
  frequencia: "UMA_VEZ_DIA" as const,
  origem,
  usuarioId: null,
  agora: relogio,
});

export const doc = (nsu: string, schema: string, xml: string) => ({ nsu, schema, xml });

export function limparBanco() {
  banco.cursores.clear();
  banco.documentos.length = 0;
  banco.execucoes.length = 0;
  banco.notas.length = 0;
  vi.clearAllMocks();
}
