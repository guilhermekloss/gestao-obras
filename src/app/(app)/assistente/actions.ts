"use server";

import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
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

export async function perguntarAssistente(
  _pergunta: string,
  _historico: MensagemChat[],
  _rota: string,
): Promise<RespostaAssistente> {
  await exigirPapel();
  return { ok: false, erro: "Assistente com IA indisponível." };
}
