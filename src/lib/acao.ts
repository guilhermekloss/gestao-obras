import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Role } from "@prisma/client";
import { exigirAcessoObra, exigirPapel } from "./auth";
import { comContextoDeAtividade, registrarAtividade } from "./atividade";
import type { TipoAtividade } from "@/services/atividade";

export type ActionResult = {
  ok: boolean;
  erro?: string;
  aviso?: boolean;
};

type Usuario = Awaited<ReturnType<typeof exigirPapel>>;

const MSG_ERRO_INTERNO = "Não foi possível concluir a operação. Tente de novo; se persistir, avise o administrador.";

// Só `Error` simples (regra de negócio) chega ao usuário; outros podem vazar SQL/caminhos e viram mensagem genérica.
export function mensagemDeErro(erro: unknown, padrao = MSG_ERRO_INTERNO): string {
  const deNegocio = erro instanceof Error && erro.constructor === Error && !("code" in erro);
  if (deNegocio && erro.message) return erro.message;
  console.error("Erro inesperado em server action", erro);
  return padrao;
}

// unstable_rethrow: redirect()/notFound() não podem ser engolidos pelo catch (o Next os trata por fora).
export function acaoDeEscrita<Args extends unknown[], R extends ActionResult>(
  opcoes: {
    papeis?: Role[];
    // obra que a action toca, quando vem nos argumentos; sem acesso, responde como registro inexistente
    obra?: (...args: Args) => string | undefined;
    revalidar?: string[] | ((...args: Args) => string[]);
    atividade?: TipoAtividade | ((...args: Args) => TipoAtividade);
  },
  handler: (usuario: Usuario, ...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const usuario = await exigirPapel(...(opcoes.papeis ?? []));
    const obraId = opcoes.obra?.(...args);
    if (obraId) {
      try {
        exigirAcessoObra(usuario, obraId);
      } catch (erro) {
        return { ok: false, erro: mensagemDeErro(erro) } as R;
      }
    }
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
      return { ok: false, erro: mensagemDeErro(erro) } as R;
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
