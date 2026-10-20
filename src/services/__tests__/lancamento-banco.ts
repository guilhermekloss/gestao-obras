import { vi } from "vitest";
import type { registrarLancamento } from "../lancamento";

export type Lancamento = Parameters<typeof registrarLancamento>[0];

// chave de acesso com dígito verificador válido (a mesma dos testes do leitor)
export const CHAVE = "35200114200166000187550010000000046000000040";

export function novoBanco() {
  const db = {
    notaFiscal: {
      findFirst: vi.fn(async (_: object) => null as { id: string } | null),
      findUnique: vi.fn(async (_: object) => null as { id: string; numero: string } | null),
      findMany: vi.fn(async (_: object) => [] as { numero: string }[]),
      create: vi.fn(async (_: object) => ({ id: "nota-1" })),
      update: vi.fn(async (_: object) => ({})),
    },
    material: {
      count: vi.fn(async (_: object) => 0),
      // todo material pedido existe e se chama "Cimento CP II"
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, nome: "Cimento CP II" })),
      ),
      findFirst: vi.fn(async (_: object) => null as { id: string; nome: string } | null),
      create: vi.fn(async (_: object) => ({ id: "mat-novo", nome: "Areia", unidade: "M3", tipo: "MATERIAL", categoria: null })),
    },
    materialApelido: { upsert: vi.fn(async (_: object) => ({})) },
    documentoSefaz: { updateMany: vi.fn(async (_: object) => ({ count: 0 })) },
    etapa: { findMany: vi.fn(async () => [] as { id: string; obraId: string }[]) },
    fornecedor: {
      findFirst: vi.fn(async (_: object) => null as { id: string; nome: string; cnpj: string | null } | null),
      findUnique: vi.fn(async (_: object) => ({ nome: "Ferragens Silva" }) as { nome: string } | null),
      create: vi.fn(async ({ data }: { data: { nome: string } }) => ({ id: "forn-novo", ...data })),
    },
    parcela: {
      findMany: vi.fn(async (_: object) => [] as object[]),
      deleteMany: vi.fn(async (_: object) => ({})),
      update: vi.fn(async (_: object) => ({})),
      createMany: vi.fn(async (_: object) => ({})),
    },
    itemNota: { deleteMany: vi.fn(async (_: object) => ({})), createMany: vi.fn(async (_: object) => ({})) },
    rateioNota: { deleteMany: vi.fn(async (_: object) => ({})), createMany: vi.fn(async (_: object) => ({})) },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return db;
}

export type Banco = ReturnType<typeof novoBanco>;
export const comoPrisma = (db: Banco) => db as never;

export function lancamento(extra: Partial<Lancamento> = {}): Lancamento {
  return {
    fornecedor: { id: "forn-1" },
    tipoDocumento: "NF",
    numero: "123",
    dataCompra: "2026-10-01",
    totalCents: 10_000,
    formaPagto: "BOLETO",
    itens: [{ descricao: "Cimento CP II", tipo: "MATERIAL", qtde: 10, unidade: "SC", unitCents: 1_000, descontoCents: 0 }],
    rateios: [{ obraId: "o1", fracaoBp: 10_000 }],
    parcelas: [{ numero: 1, valorCents: 10_000, vencimento: "2026-11-01" }],
    criadoPor: "u1",
    ...extra,
  };
}
