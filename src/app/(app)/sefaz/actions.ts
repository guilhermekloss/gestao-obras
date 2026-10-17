"use server";

import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade, ignorarAtividade } from "@/lib/atividade";
import { reenviarCiencia, sincronizar } from "@/services/sefaz/sincronizar";
import { STATUS_EXECUCAO_LABELS } from "@/services/sefaz/painel";

type ResultadoComMensagem = ActionResult & { mensagem?: string; nadaConsultado?: boolean; falhou?: boolean };

export const consultarAgora = acaoDeEscrita(
  { papeis: ["ADMIN"], atividade: "sefaz.consultar", revalidar: ["/sefaz", "/notas/recebidas"] },
  async (usuario): Promise<ResultadoComMensagem> => {
    const r = await sincronizar({ origem: "MANUAL", usuarioId: usuario.id });
    if (!r.ok) return { ok: false, erro: r.erro };
    const partes = r.resultados.map((x) =>
      x.status === "PULADA" || x.status === "ERRO" || x.status === "BLOQUEADA"
        ? `${x.cnpj}: ${x.mensagem}`
        : `${x.cnpj}: ${STATUS_EXECUCAO_LABELS[x.status]} (${x.docsNovos} nova(s), ${x.ciencias} Ciência(s))`,
    );
    const nadaConsultado = r.resultados.every((x) => x.status === "PULADA");
    if (nadaConsultado) ignorarAtividade();
    const falhou = r.resultados.some((x) => x.status === "ERRO" || x.status === "BLOQUEADA");
    return { ok: true, mensagem: partes.join("\n"), nadaConsultado, falhou };
  },
);

export const reenviarCienciaDocumento = acaoDeEscrita(
  { papeis: ["ADMIN"], atividade: "sefaz.ciencia", revalidar: ["/sefaz"] },
  async (_usuario, id: string): Promise<ResultadoComMensagem> => {
    const doc = await prisma.documentoSefaz.findUnique({ where: { id }, select: { situacao: true, manifestacao: true, numero: true, emitenteNome: true } });
    if (!doc) return { ok: false, erro: "Registro não encontrado" };
    if (doc.situacao !== "RESUMO" || !["PENDENTE", "ERRO"].includes(doc.manifestacao)) {
      return { ok: false, erro: "Esta nota não precisa de Ciência." };
    }
    const r = await reenviarCiencia([id]);
    if (!r.ok) return { ok: false, erro: r.erro };
    if (r.enviadas === 0) {
      const atual = await prisma.documentoSefaz.findUnique({ where: { id }, select: { manifestacaoErro: true } });
      return { ok: false, erro: atual?.manifestacaoErro ?? "A Sefaz recusou a Ciência." };
    }
    anotarAtividade({ descricao: `Reenviou a Ciência da NF ${doc.numero} de ${doc.emitenteNome}` });
    return { ok: true, mensagem: "Ciência registrada. O XML completo chega numa das próximas consultas." };
  },
);

export const descartarDocumento = acaoDeEscrita(
  { papeis: ["ADMIN", "ESCRITORIO"], atividade: "sefaz.descartar", revalidar: ["/sefaz", "/notas/recebidas"] },
  async (usuario, id: string): Promise<ActionResult> => {
    const r = await prisma.documentoSefaz.updateMany({
      where: { id, status: "NOVA" },
      data: { status: "DESCARTADA", descartadoPorId: usuario.id },
    });
    if (r.count === 0) return { ok: false, erro: "Esta nota já foi lançada ou descartada." };
    const doc = await prisma.documentoSefaz.findUniqueOrThrow({ where: { id }, select: { numero: true, emitenteNome: true, valorCents: true } });
    anotarAtividade({ descricao: `Descartou a NF ${doc.numero} de ${doc.emitenteNome}, recebida da Sefaz`, valorCents: doc.valorCents });
    return { ok: true };
  },
);

export const restaurarDocumento = acaoDeEscrita(
  { papeis: ["ADMIN"], revalidar: ["/sefaz", "/notas/recebidas"] },
  async (_usuario, id: string): Promise<ActionResult> => {
    const r = await prisma.documentoSefaz.updateMany({ where: { id, status: "DESCARTADA" }, data: { status: "NOVA", descartadoPorId: null } });
    return r.count > 0 ? { ok: true } : { ok: false, erro: "Esta nota não está descartada." };
  },
);
