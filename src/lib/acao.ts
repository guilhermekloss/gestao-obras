import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Role } from "@prisma/client";
import { exigirPapel } from "./auth";

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
 * `excluirObra` é a única action que redireciona no sucesso em vez de
 * retornar — nesse caso o handler chama `revalidatePath`/`redirect` direto e
 * a opção `revalidar` deste wrapper deve ficar de fora, já que o redirect
 * nunca deixa o handler retornar.
 */
export function acaoDeEscrita<Args extends unknown[], R extends ActionResult>(
  opcoes: {
    /** Papéis permitidos; omitido = qualquer usuário autenticado. */
    papeis?: Role[];
    /** Rotas a revalidar quando o handler retorna `ok: true`. */
    revalidar?: string[] | ((...args: Args) => string[]);
  },
  handler: (usuario: Usuario, ...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const usuario = await exigirPapel(...(opcoes.papeis ?? []));
    try {
      const resultado = await handler(usuario, ...args);
      if (resultado.ok) {
        const caminhos =
          typeof opcoes.revalidar === "function" ? opcoes.revalidar(...args) : (opcoes.revalidar ?? []);
        for (const caminho of caminhos) revalidatePath(caminho);
      }
      return resultado;
    } catch (erro) {
      unstable_rethrow(erro);
      return { ok: false, erro: erro instanceof Error ? erro.message : "Erro inesperado" } as R;
    }
  };
}
