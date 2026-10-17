"use server";

import path from "path";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { acaoDeEscrita, mensagemDeErro, type ActionResult } from "@/lib/acao";
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
  type CorrespondenciaFornecedor,
} from "@/services/correspondencia-fornecedor";
import { normalizarLeitura, type DocumentoLido, type LeituraNormalizada } from "@/services/leitura-documento";
import { cnpjsDaEmpresa } from "@/services/empresa";
import { leituraAutomaticaDisponivel, lerDocumentoNativo, type MidiaDocumento } from "@/services/leitor-nativo";
import { ErroLeitura } from "@/services/leitor-nativo/extracao/semaforo";
import { analiseIaDisponivel, analisarComGemini } from "@/services/leitor-gemini";
import { correspondenciaItem, normalizarUnidade, type CorrespondenciaItem, type MaterialCatalogo } from "@/services/materiais";
import { carregarBaseMateriais, criarMaterialValidado, buscarMaterialPorNome } from "@/services/materiais-db";

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
      correspondencia: CorrespondenciaFornecedor;
      destinatarioEhEmpresa: boolean | null;
      notaExistente: { id: string; numero: string } | null;
      // um por item da leitura, na mesma ordem
      materiais: CorrespondenciaItem[];
    }
  | { ok: false; erro: string };

// só arquivos do nosso storage (URL do /api/upload), nunca um caminho arbitrário
function arquivoDoStorage(anexoUrl: string): { nome: string; midia: MidiaDocumento } | null {
  const nome = /^\/api\/fotos\/([\w-]+\.(\w+))$/.exec(anexoUrl);
  const midia = nome ? MIDIA[nome[2].toLowerCase()] : undefined;
  return nome && midia ? { nome: path.basename(nome[1]), midia } : null;
}

const MSG_FORMATO = "Envie uma foto (JPG, PNG, WEBP) ou um PDF.";

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

    const base = await carregarBaseMateriais();
    const materiais = leitura.itens.map((item) =>
      correspondenciaItem({ descricao: item.descricao }, { ...base, fornecedorId: correspondencia.exato?.id }),
    );

    return {
      ok: true,
      leitura,
      correspondencia,
      materiais,
      destinatarioEhEmpresa: destinatarioEhEmpresa(
        leitura.destinatario.documento,
        await cnpjsDaEmpresa(),
      ),
      notaExistente,
    };
  } catch (e) {
    // só ErroLeitura tem mensagem para o usuário; o resto vai para o log
    return { ok: false, erro: e instanceof ErroLeitura ? e.message : mensagemDeErro(e, erroPadrao) };
  }
}

export async function lerDocumento(anexoUrl: string): Promise<LerDocumentoResult> {
  await exigirPapel(...PAPEIS);
  if (!leituraAutomaticaDisponivel()) {
    return { ok: false, erro: "A leitura automática não está configurada neste servidor." };
  }
  return lerEConferir(anexoUrl, lerDocumentoNativo, "Erro ao ler o documento");
}

export async function analisarDocumentoComIa(anexoUrl: string): Promise<LerDocumentoResult> {
  await exigirPapel(...PAPEIS);
  if (!analiseIaDisponivel()) return { ok: false, erro: "A análise com IA não está configurada neste servidor." };
  const r = await lerEConferir(anexoUrl, analisarComGemini, "Erro na análise com IA");
  console.info(JSON.stringify({ evento: "analise_ia_documento", ok: r.ok }));
  return r;
}

type FornecedorConferido =
  | { modo: "existente"; id: string; completarDocumento?: string }
  | { modo: "novo"; nome: string; documento?: string };

type ResolverFornecedorResult = ActionResult & {
  fornecedor?: { id: string; nome: string; cnpj: string | null };
  info?: string;
};

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

type VinculoParaAction =
  | { modo: "nenhum" }
  | { modo: "existente"; id: string }
  | { modo: "novo"; nome: string; unidade: string };

type ResolverMateriaisResult = ActionResult & { materialIds?: string[]; criados?: MaterialCatalogo[] };

// Cria os materiais novos que o usuário confirmou e devolve o id de cada item ("" = avulso).
// Só cadastra: o apelido (texto da nota → material) é gravado junto com o lançamento.
export const resolverMateriais = acaoDeEscrita(
  { papeis: [...PAPEIS], revalidar: ["/materiais"], atividade: "material.criar" },
  async (_user, vinculos: VinculoParaAction[]): Promise<ResolverMateriaisResult> => {
    ignorarAtividade(); // só registra quando cadastra algo (abaixo)
    if (!Array.isArray(vinculos) || vinculos.length > 500) return { ok: false, erro: "Itens inválidos." };

    const ids: string[] = [];
    const criados: MaterialCatalogo[] = [];
    for (const v of vinculos) {
      if (v.modo === "nenhum") {
        ids.push("");
      } else if (v.modo === "existente") {
        const existe = await prisma.material.findUnique({ where: { id: v.id }, select: { id: true } });
        if (!existe) return { ok: false, erro: "Um dos materiais escolhidos não existe mais — escolha de novo." };
        ids.push(existe.id);
      } else {
        const nome = v.nome.trim();
        const unidade = normalizarUnidade(v.unidade);
        if (!nome || !unidade) return { ok: false, erro: "Informe o nome e a unidade do novo material." };
        const igual = await buscarMaterialPorNome(nome);
        if (igual) {
          ids.push(igual.id);
          continue;
        }
        const r = await criarMaterialValidado({ nome, unidade, tipo: "MATERIAL" });
        if (!r.ok) return r;
        ids.push(r.material.id);
        criados.push(r.material);
      }
    }

    if (criados.length > 0) {
      anotarAtividade({
        descricao: `Cadastrou ${criados.length === 1 ? `o material ${criados[0].nome}` : `${criados.length} materiais`} pela leitura de nota`,
        entidade: "material",
      });
    }
    return { ok: true, materialIds: ids, criados };
  },
);
