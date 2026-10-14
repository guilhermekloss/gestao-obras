import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { TIPOS_ATIVIDADE, type DetalheAtividade, type TipoAtividade } from "@/services/atividade";

type Contexto = { detalhe: DetalheAtividade; anotada: boolean; ignorar: boolean };

const contexto = new AsyncLocalStorage<Contexto>();

/**
 * Chamada de dentro de uma action com `atividade` (ver `acaoDeEscrita`) para
 * descrever o que foi feito: texto, registro afetado, obras e valor. Pode ser
 * chamada mais de uma vez — os campos se acumulam — e desfaz um
 * `ignorarAtividade` anterior. Fora de uma action, não faz nada.
 */
export function anotarAtividade(detalhe: DetalheAtividade) {
  const ctx = contexto.getStore();
  if (!ctx) return;
  Object.assign(ctx.detalhe, detalhe);
  ctx.anotada = true;
  ctx.ignorar = false;
}

/**
 * A action terminou bem mas não mudou nada que valha registrar (ex.:
 * reaproveitou um cadastro existente). Um `anotarAtividade` depois volta a registrar.
 */
export function ignorarAtividade() {
  const ctx = contexto.getStore();
  if (ctx) ctx.ignorar = true;
}

/** Grava uma linha do log. Falha de log nunca derruba a ação do usuário. */
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

/**
 * Roda `fn` com um contexto de anotação e devolve o que foi anotado. Usado por
 * `acaoDeEscrita`; as actions só chamam `anotarAtividade`.
 */
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
