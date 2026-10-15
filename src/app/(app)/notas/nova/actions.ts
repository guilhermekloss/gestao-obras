"use server";

import path from "path";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade, ignorarAtividade } from "@/lib/atividade";
import { dataParaInput } from "@/lib/format";
import {
  buscarFornecedorPorDocumento,
  criarFornecedorValidado,
  validarDocumentoFornecedor,
} from "@/services/fornecedores";
import {
  correspondenciaFornecedor,
  destinatarioEhEmpresa,
  lerCnpjsEmpresa,
  type CorrespondenciaFornecedor,
} from "@/services/correspondencia-fornecedor";
import { normalizarLeitura, type DocumentoLido, type LeituraNormalizada } from "@/services/leitura-documento";
import { leituraAutomaticaDisponivel, lerDocumentoNativo, type MidiaDocumento } from "@/services/leitor-nativo";
import { analiseIaDisponivel, analisarComGemini } from "@/services/leitor-gemini";

const PAPEIS = ["ADMIN", "ESCRITORIO"] as const;

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
      /** emitente × cadastro de fornecedores: o mesmo CNPJ/CPF e os parecidos */
      correspondencia: CorrespondenciaFornecedor;
      /** o destinatário é a empresa (`CNPJS_EMPRESA`)? null = não configurado / não lido */
      destinatarioEhEmpresa: boolean | null;
      /** o mesmo documento já foi lançado (pela chave ou por fornecedor + número) */
      notaExistente: { id: string; numero: string } | null;
    }
  | { ok: false; erro: string };

/** Arquivo do próprio storage (URL gerada pelo /api/upload) → nome e tipo; null se não for foto/PDF nosso. */
function arquivoDoStorage(anexoUrl: string): { nome: string; midia: MidiaDocumento } | null {
  const nome = /^\/api\/fotos\/([\w-]+\.(\w+))$/.exec(anexoUrl);
  const midia = nome ? MIDIA[nome[2].toLowerCase()] : undefined;
  return nome && midia ? { nome: path.basename(nome[1]), midia } : null;
}

const MSG_FORMATO = "Envie uma foto (JPG, PNG, WEBP) ou um PDF.";

/**
 * Lê o arquivo com o leitor indicado e prepara a conferência: normaliza,
 * cruza o emitente com o cadastro, procura duplicata e confere o destinatário.
 */
async function lerEConferir(
  anexoUrl: string,
  ler: (arquivo: Buffer, midia: MidiaDocumento) => Promise<DocumentoLido>,
  erroPadrao: string,
): Promise<LerDocumentoResult> {
  const doStorage = arquivoDoStorage(anexoUrl);
  if (!doStorage) return { ok: false, erro: MSG_FORMATO };

  try {
    const arquivo = await storage.ler(doStorage.nome);
    const lido = await ler(arquivo, doStorage.midia);
    const r = normalizarLeitura(lido, dataParaInput(new Date()));
    if (!r.ok) return r;
    const { leitura } = r;

    const cadastro = await prisma.fornecedor.findMany({ select: { id: true, nome: true, cnpj: true } });
    const correspondencia = correspondenciaFornecedor(leitura.fornecedor, cadastro);
    const notaExistente =
      (leitura.chaveNfe
        ? await prisma.notaFiscal.findUnique({ where: { chaveNfe: leitura.chaveNfe }, select: { id: true, numero: true } })
        : null) ??
      (correspondencia.exato && leitura.numero
        ? await prisma.notaFiscal.findFirst({
            where: { fornecedorId: correspondencia.exato.id, numero: leitura.numero },
            select: { id: true, numero: true },
          })
        : null);

    return {
      ok: true,
      leitura,
      correspondencia,
      destinatarioEhEmpresa: destinatarioEhEmpresa(
        leitura.destinatario.documento,
        lerCnpjsEmpresa(process.env.CNPJS_EMPRESA),
      ),
      notaExistente,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : erroPadrao };
  }
}

/**
 * Lê um documento já enviado por `/api/upload` (foto ou PDF) com o leitor
 * nativo e devolve os dados para a conferência do usuário. Não grava nada: o
 * lançamento só é criado quando o usuário confirma a conferência.
 */
export async function lerDocumento(anexoUrl: string): Promise<LerDocumentoResult> {
  await exigirPapel(...PAPEIS);
  if (!leituraAutomaticaDisponivel()) {
    return { ok: false, erro: "A leitura automática não está configurada neste servidor." };
  }
  return lerEConferir(anexoUrl, lerDocumentoNativo, "Erro ao ler o documento");
}

/**
 * Reanálise do mesmo documento com o Gemini, a pedido do usuário na
 * conferência (leitura nativa com muitos campos em dúvida). Mesmo retorno e
 * mesmas conferências de `lerDocumento`; também não grava nada.
 */
export async function analisarDocumentoComIa(anexoUrl: string): Promise<LerDocumentoResult> {
  await exigirPapel(...PAPEIS);
  if (!analiseIaDisponivel()) return { ok: false, erro: "A análise com IA não está configurada neste servidor." };
  const r = await lerEConferir(anexoUrl, analisarComGemini, "Erro na análise com IA");
  console.info(JSON.stringify({ evento: "analise_ia_documento", ok: r.ok }));
  return r;
}

export type FornecedorConferido =
  | { modo: "existente"; id: string; /** grava este CNPJ/CPF se o cadastro ainda não tem */ completarDocumento?: string }
  | { modo: "novo"; nome: string; documento?: string };

export type ResolverFornecedorResult = ActionResult & {
  fornecedor?: { id: string; nome: string; cnpj: string | null };
  /** a mensagem para o usuário quando o cadastro foi reaproveitado ou completado */
  info?: string;
};

/**
 * Fornecedor escolhido na conferência. Nunca duplica: um "novo" cujo
 * CNPJ/CPF já existe vira o cadastro existente; completar o documento de um
 * existente só acontece se ele ainda não tem um e se o número não é de outro.
 */
function registrarFornecedor(descricao: string, fornecedorId: string) {
  anotarAtividade({ descricao, entidade: "fornecedor", entidadeId: fornecedorId });
}

export const resolverFornecedor = acaoDeEscrita(
  {
    papeis: [...PAPEIS],
    revalidar: ["/fornecedores"],
    atividade: (escolha: FornecedorConferido) => (escolha.modo === "existente" ? "fornecedor.editar" : "fornecedor.criar"),
  },
  async (_user, escolha: FornecedorConferido): Promise<ResolverFornecedorResult> => {
    ignorarAtividade(); // só registra quando grava algo (abaixo)
    if (escolha.modo === "existente") {
      const f = await prisma.fornecedor.findUnique({
        where: { id: escolha.id },
        select: { id: true, nome: true, cnpj: true },
      });
      if (!f) return { ok: false, erro: "Fornecedor não encontrado — escolha de novo." };
      if (!escolha.completarDocumento || f.cnpj) return { ok: true, fornecedor: f };

      const doc = await validarDocumentoFornecedor(escolha.completarDocumento, { ignorarId: f.id });
      if (!doc.ok) return doc;
      const atualizado = await prisma.fornecedor.update({
        where: { id: f.id },
        data: { cnpj: doc.cnpj },
        select: { id: true, nome: true, cnpj: true },
      });
      registrarFornecedor(`Completou o CNPJ/CPF do fornecedor ${f.nome}`, f.id);
      return { ok: true, fornecedor: atualizado, info: `CNPJ/CPF ${doc.cnpj} gravado no cadastro de ${f.nome}` };
    }

    const nome = escolha.nome.trim();
    if (!nome) return { ok: false, erro: "Informe o nome do fornecedor." };
    if (escolha.documento?.trim()) {
      const existente = await buscarFornecedorPorDocumento(escolha.documento);
      if (existente) {
        return { ok: true, fornecedor: existente, info: `CNPJ/CPF já cadastrado: usado o fornecedor ${existente.nome}` };
      }
    }
    const criado = await criarFornecedorValidado({ nome, cnpj: escolha.documento?.trim() || undefined });
    if (!criado.ok) return criado;
    const { id, cnpj } = criado.fornecedor;
    registrarFornecedor(`Cadastrou o fornecedor ${nome}`, id);
    return { ok: true, fornecedor: { id, nome: criado.fornecedor.nome, cnpj }, info: `Fornecedor ${nome} cadastrado` };
  },
);
