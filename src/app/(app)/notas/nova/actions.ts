"use server";

import path from "path";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { dataParaInput } from "@/lib/format";
import { buscarFornecedorPorDocumento } from "@/services/fornecedores";
import { normalizarLeitura, type LeituraNormalizada } from "@/services/leitura-documento";
import { leituraAutomaticaDisponivel, lerDocumentoComIa, type MidiaDocumento } from "@/services/leitor-ia";

const MIDIA: Record<string, MidiaDocumento> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export type LerDocumentoResult =
  | {
      ok: true;
      leitura: LeituraNormalizada;
      /** fornecedor já cadastrado com o CNPJ/CPF lido */
      fornecedor: { id: string; nome: string } | null;
      /** o mesmo documento já foi lançado (pela chave ou por fornecedor + número) */
      notaExistente: { id: string; numero: string } | null;
    }
  | { ok: false; erro: string };

/**
 * Lê um documento já enviado por `/api/upload` (foto ou PDF) e devolve o
 * lançamento pré-preenchido para o usuário conferir. Não grava nada: o
 * lançamento só é criado quando o usuário salva o formulário (`salvarNota`).
 */
export async function lerDocumento(anexoUrl: string): Promise<LerDocumentoResult> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  if (!leituraAutomaticaDisponivel()) {
    return { ok: false, erro: "A leitura automática não está configurada neste servidor." };
  }

  // Só arquivos do próprio storage (URL gerada pelo /api/upload).
  const nome = /^\/api\/fotos\/([\w-]+\.(\w+))$/.exec(anexoUrl);
  const midia = nome ? MIDIA[nome[2].toLowerCase()] : undefined;
  if (!nome || !midia) return { ok: false, erro: "Envie uma foto (JPG, PNG, WEBP) ou um PDF." };

  try {
    const arquivo = await storage.ler(path.basename(nome[1]));
    const lido = await lerDocumentoComIa(arquivo, midia);
    const r = normalizarLeitura(lido, dataParaInput(new Date()));
    if (!r.ok) return r;
    const { leitura } = r;

    const fornecedor = leitura.fornecedor.documento
      ? await buscarFornecedorPorDocumento(leitura.fornecedor.documento)
      : null;
    const notaExistente =
      (leitura.chaveNfe
        ? await prisma.notaFiscal.findUnique({ where: { chaveNfe: leitura.chaveNfe }, select: { id: true, numero: true } })
        : null) ??
      (fornecedor && leitura.numero
        ? await prisma.notaFiscal.findFirst({
            where: { fornecedorId: fornecedor.id, numero: leitura.numero },
            select: { id: true, numero: true },
          })
        : null);

    return { ok: true, leitura, fornecedor, notaExistente };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao ler o documento" };
  }
}
