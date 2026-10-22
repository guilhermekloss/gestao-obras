"use server";

import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { acaoDeEscrita, mensagemDeErro, type ActionResult } from "@/lib/acao";
import { analiseIaDisponivel } from "@/services/gemini";
import { consumirLimite } from "@/lib/protecao";
import { perguntar } from "@/services/assistente/ia";
import type { MensagemChat, TelaSugerida } from "@/services/assistente";

export type RespostaAssistente = ActionResult & { resposta?: string; telas?: TelaSugerida[] };

// Sem `atividade`: abrir ou dispensar a ajuda não é ação de negócio e não entra no log de auditoria.
export const marcarAssistenteVisto = acaoDeEscrita({}, async (usuario): Promise<ActionResult> => {
  await prisma.usuario.updateMany({
    where: { id: usuario.id, assistenteVistoEm: null },
    data: { assistenteVistoEm: new Date() },
  });
  return { ok: true };
});

const MAX_MENSAGENS_RECEBIDAS = 50;

// Server action é endpoint POST público: não confie nos tipos do TypeScript.
function historicoValido(h: unknown): h is MensagemChat[] {
  return (
    Array.isArray(h) &&
    h.length <= MAX_MENSAGENS_RECEBIDAS &&
    h.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.autor === "pessoa" || m.autor === "assistente") &&
        typeof m.texto === "string" &&
        m.texto.length <= 20_000,
    )
  );
}

export async function perguntarAssistente(
  pergunta: string,
  historico: MensagemChat[],
  rota: string,
): Promise<RespostaAssistente> {
  const usuario = await exigirPapel();
  if (!analiseIaDisponivel()) return { ok: false, erro: "O assistente com IA não está configurado neste servidor." };
  if (typeof pergunta !== "string" || !historicoValido(historico) || typeof rota !== "string" || rota.length > 200) {
    return { ok: false, erro: "Pergunta inválida." };
  }
  try {
    await consumirLimite("assistente", usuario.id);
    // Nunca registre o texto da pergunta: só o tamanho e a tela.
    console.info(JSON.stringify({ evento: "assistente_pergunta", usuarioId: usuario.id, tamanho: pergunta.length, rota }));
    const { resposta, telas } = await perguntar({ pergunta, historico, role: usuario.role, rota });
    return { ok: true, resposta, telas };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível obter a resposta do assistente. Tente de novo.") };
  }
}
