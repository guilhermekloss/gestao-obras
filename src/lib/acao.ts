import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Role } from "@prisma/client";
import { exigirPapel } from "./auth";
import { comContextoDeAtividade, registrarAtividade } from "./atividade";
import type { TipoAtividade } from "@/services/atividade";

/** Contrato único de retorno de toda server action de escrita do app. */
export type ActionResult = {
  ok: boolean;
  erro?: string;
  /** true quando `erro` é um aviso contornável reenviando com `forcar`. */
  aviso?: boolean;
};

type Usuario = Awaited<ReturnType<typeof exigirPapel>>;

/**
 * Absorve a ceremônia repetida em toda server action de escrita: checa o
 * papel do usuário, captura erros inesperados num `ActionResult` (sem
 * engolir `redirect()`/`notFound()`, que o Next trata por fora de try/catch)
 * e revalida as rotas afetadas quando o handler tem sucesso.
 *
 * O handler recebe só o que precisa para a regra de negócio: o usuário já
 * autorizado, e os argumentos originais da action.
 *
 * Actions que redirecionam no sucesso em vez de retornar (`excluirObra`,
 * `importarNfe`, `excluirRdo` com destino) chamam `revalidatePath`/`redirect`
 * direto, e a opção `revalidar` deste wrapper fica de fora, já que o redirect
 * nunca deixa o handler retornar.
 *
 * Com `atividade`, cada sucesso vira uma linha do log de auditoria
 * (`Atividade`), com o detalhe que o handler anotar via `anotarAtividade`.
 * Numa action que redireciona, só é registrado o que foi anotado antes do
 * `redirect()`.
 */
export function acaoDeEscrita<Args extends unknown[], R extends ActionResult>(
  opcoes: {
    /** Papéis permitidos; omitido = qualquer usuário autenticado. */
    papeis?: Role[];
    /** Rotas a revalidar quando o handler retorna `ok: true`. */
    revalidar?: string[] | ((...args: Args) => string[]);
    /** Tipo registrado no log de auditoria a cada sucesso (ver services/atividade.ts). */
    atividade?: TipoAtividade | ((...args: Args) => TipoAtividade);
  },
  handler: (usuario: Usuario, ...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const usuario = await exigirPapel(...(opcoes.papeis ?? []));
    const execucao = await comContextoDeAtividade(() => handler(usuario, ...args));
    const registrar = async () => {
      if (opcoes.atividade && !execucao.ctx.ignorar) {
        const tipo = typeof opcoes.atividade === "function" ? opcoes.atividade(...args) : opcoes.atividade;
        await registrarAtividade(usuario.id, tipo, execucao.ctx.detalhe);
      }
    };

    if ("erro" in execucao) {
      const { erro } = execucao;
      if (execucao.ctx.anotada) {
        // redirect() depois de anotar = sucesso que não retorna
        try {
          unstable_rethrow(erro);
        } catch (controle) {
          await registrar();
          throw controle;
        }
      }
      unstable_rethrow(erro);
      return { ok: false, erro: erro instanceof Error ? erro.message : "Erro inesperado" } as R;
    }

    const { resultado } = execucao;
    if (resultado.ok) {
      await registrar();
      const caminhos =
        typeof opcoes.revalidar === "function" ? opcoes.revalidar(...args) : (opcoes.revalidar ?? []);
      for (const caminho of caminhos) revalidatePath(caminho);
    }
    return resultado;
  };
}
