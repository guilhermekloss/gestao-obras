import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { TIPOS_ATIVIDADE, type DetalheAtividade, type TipoAtividade } from "@/services/atividade";

type Contexto = { detalhe: DetalheAtividade; anotada: boolean; ignorar: boolean };

const contexto = new AsyncLocalStorage<Contexto>();

export function anotarAtividade(detalhe: DetalheAtividade) {
  const ctx = contexto.getStore();
  if (!ctx) return;
  Object.assign(ctx.detalhe, detalhe);
  ctx.anotada = true;
  ctx.ignorar = false;
}

export function ignorarAtividade() {
  const ctx = contexto.getStore();
  if (ctx) ctx.ignorar = true;
}

export async function registrarAtividade(
  usuarioId: string | null,
  tipo: TipoAtividade,
  detalhe: DetalheAtividade = {},
) {
  try {
    await prisma.atividade.create({
      data: {
        usuarioId,
        tipo,
        descricao: detalhe.descricao ?? TIPOS_ATIVIDADE[tipo].rotulo,
        entidade: detalhe.entidade ?? null,
        entidadeId: detalhe.entidadeId ?? null,
        obraIds: [...new Set(detalhe.obraIds ?? [])],
        valorCents: detalhe.valorCents ?? null,
      },
    });
  } catch (erro) {
    console.error(`Falha ao registrar atividade ${tipo}`, erro);
  }
}

export async function comContextoDeAtividade<R>(
  fn: () => Promise<R>,
): Promise<{ resultado: R; ctx: Contexto } | { erro: unknown; ctx: Contexto }> {
  const ctx: Contexto = { detalhe: {}, anotada: false, ignorar: false };
  try {
    const resultado = await contexto.run(ctx, fn);
    return { resultado, ctx };
  } catch (erro) {
    return { erro, ctx };
  }
}
