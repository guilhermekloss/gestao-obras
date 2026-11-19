"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { parcelaSchema, rateioSchema } from "@/schemas/nota";
import { nomeDaUrlArquivo, nomeDaUrlXml } from "@/services/arquivos";
import { descricaoDoLancamento, registrarLancamento, type FornecedorDoLancamento } from "@/services/lancamento";
import { buscarFornecedorPorDocumento, fornecedorSchema } from "@/services/fornecedores";
import { formatarDocumento, MAX_CARACTERES_XML } from "@/services/nfe-xml";
import { dadosImportaveis, lancamentoDoXml, parseDocumentoXml } from "@/services/documento-xml";
import { correspondenciaItem, type CorrespondenciaItem } from "@/services/materiais";
import { carregarBaseMateriais } from "@/services/materiais-db";
import { obrasPorCno, type ObraDoCno } from "@/services/obras";

const PAPEIS = ["ADMIN", "ESCRITORIO"] as const;

const importarSchema = z.object({
  xml: z.string().min(1, "Selecione o arquivo XML").max(MAX_CARACTERES_XML, "Arquivo grande demais para importar (máximo 1 MB)."),
  nomeArquivo: z.string().optional(),
  // na mesma ordem dos itens do XML
  tipos: z.array(z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"])).max(500),
  // na mesma ordem dos itens do XML; "pendente" não passa: o usuário decide antes de importar
  materiais: z.array(
    z.discriminatedUnion("modo", [
      z.object({ modo: z.literal("nenhum") }),
      z.object({ modo: z.literal("existente"), id: z.string().min(1).max(64) }),
      z.object({
        modo: z.literal("novo"),
        nome: z.string().trim().min(1, "Informe o nome do novo material").max(200),
        unidade: z.string().trim().min(1, "Informe a unidade do novo material").max(20),
      }),
    ]),
  ).max(500),
  rateios: z.array(rateioSchema).min(1, "Defina o rateio entre obras").max(100),
  parcelas: z.array(parcelaSchema).min(1, "A nota precisa de ao menos 1 parcela").max(360),
});

type ImportarNfeInput = z.infer<typeof importarSchema>;

type ImportarNfeResult = ActionResult & {
  notaExistenteId?: string;
};

async function notaPorChave(chave: string) {
  return prisma.notaFiscal.findUnique({ where: { chaveNfe: chave }, select: { id: true, numero: true } });
}

// Liga cada item do XML ao catálogo: pelo código do produto do fornecedor, depois pelo texto.
export async function sugerirMateriais(
  documento: string,
  itens: { descricao: string; codigo: string | null }[],
): Promise<CorrespondenciaItem[]> {
  await exigirPapel(...PAPEIS);
  const [fornecedor, base] = await Promise.all([buscarFornecedorPorDocumento(documento), carregarBaseMateriais()]);
  return itens.map((item) => correspondenciaItem(item, { ...base, fornecedorId: fornecedor?.id }));
}

export type SituacaoImportacao = {
  notaExistente: { id: string; numero: string } | null;
  fornecedor: { id: string; nome: string } | null;
  obrasDoCno: ObraDoCno[];
};

export async function consultarSituacaoImportacao(
  chave: string,
  documento: string,
  cno: string | null = null,
): Promise<SituacaoImportacao> {
  await exigirPapel(...PAPEIS);
  const [notaExistente, fornecedor, obrasDoCno] = await Promise.all([
    notaPorChave(chave),
    buscarFornecedorPorDocumento(documento),
    obrasPorCno(cno),
  ]);
  return { notaExistente, fornecedor, obrasDoCno };
}

// NF-e ou NFS-e nacional, conforme o conteúdo. XML reprocessado aqui (a prévia do client não é confiável);
// do client vêm só as escolhas. Sem `revalidar` no wrapper: revalida e redireciona por conta própria no sucesso.
export const importarNfe = acaoDeEscrita(
  { papeis: [...PAPEIS], atividade: "nota.importar_xml" },
  async (user, input: ImportarNfeInput): Promise<ImportarNfeResult> => {
    const parsed = importarSchema.safeParse(input);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const lido = parseDocumentoXml(d.xml);
    if (!lido.ok) return { ok: false, erro: lido.erro };
    const dados = dadosImportaveis(lido.doc);

    if (d.tipos.length !== dados.itens.length || d.materiais.length !== dados.itens.length) {
      return { ok: false, erro: "Os itens enviados não conferem com o XML — recarregue o arquivo." };
    }

    const existente = await buscarFornecedorPorDocumento(dados.emitente.documento);
    let fornecedor: FornecedorDoLancamento;
    if (existente) {
      fornecedor = { id: existente.id };
    } else {
      const novo = fornecedorSchema.safeParse({
        nome: dados.emitente.razaoSocial,
        cnpj: formatarDocumento(dados.emitente.documento),
        fone: dados.emitente.fone ?? undefined,
      });
      if (!novo.success) return { ok: false, erro: novo.error.issues[0].message };
      fornecedor = { novo: novo.data };
    }

    // o arquivo é gravado antes (a nota guarda o endereço) e sai de novo se o lançamento não acontecer
    const anexoUrl = await storage.salvar(Buffer.from(d.xml, "utf8"), "xml");
    const desfazerAnexo = async () => {
      const nome = nomeDaUrlXml(anexoUrl) ?? nomeDaUrlArquivo(anexoUrl);
      if (nome) await storage.excluir(nome).catch(() => undefined);
    };

    let r: Awaited<ReturnType<typeof registrarLancamento>>;
    try {
      r = await registrarLancamento(
        // fiscais só do XML lido aqui: o client manda apenas tipos, materiais, rateio e parcelas
        lancamentoDoXml(dados, d, { fornecedor, anexoUrl, nomeArquivo: d.nomeArquivo, criadoPor: user.id }),
        // o leitor do XML já ajusta os itens ao total da nota: não há o que confirmar
        { forcar: true },
      );
    } catch (erro) {
      await desfazerAnexo();
      throw erro;
    }
    if (!r.ok) {
      await desfazerAnexo();
      return { ok: false, erro: r.erro, notaExistenteId: r.notaExistenteId };
    }

    anotarAtividade({
      descricao: `${descricaoDoLancamento("Importou", { tipoDocumento: dados.tipoDocumento, numero: r.numero, totalCents: dados.totalCents }, r.fornecedorNome)}${r.fornecedorCriado ? " e cadastrou o fornecedor" : ""}`,
      entidade: "nota",
      entidadeId: r.notaId,
      obraIds: d.rateios.map((x) => x.obraId),
      valorCents: dados.totalCents,
    });
    revalidatePath("/notas");
    revalidatePath("/notas/recebidas");
    revalidatePath("/contas");
    revalidatePath("/materiais");
    if (r.fornecedorCriado) revalidatePath("/fornecedores");
    redirect(`/notas/${r.notaId}`);
  },
);
