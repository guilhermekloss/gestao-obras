"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { formatarMoeda, formatarPercentBp, inputParaData } from "@/lib/format";
import { parcelaSchema, rateioSchema } from "@/schemas/nota";
import { validarParcelas } from "@/services/parcelas";
import { validarRateio } from "@/services/rateio";
import { buscarFornecedorPorDocumento, criarFornecedorValidado, fornecedorSchema } from "@/services/fornecedores";
import { formatarDocumento, parseNfeXml } from "@/services/nfe-xml";
import { erroEtapasDoRateio } from "@/services/obras";
import { correspondenciaItem, normalizarUnidade, type CorrespondenciaItem } from "@/services/materiais";
import {
  buscarMaterialPorNome,
  carregarBaseMateriais,
  criarMaterialValidado,
  registrarApelido,
} from "@/services/materiais-db";

const PAPEIS = ["ADMIN", "ESCRITORIO"] as const;

const importarSchema = z.object({
  xml: z.string().min(1, "Selecione o arquivo XML"),
  nomeArquivo: z.string().optional(),
  // na mesma ordem dos itens do XML
  tipos: z.array(z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"])),
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
  ),
  rateios: z.array(rateioSchema).min(1, "Defina o rateio entre obras"),
  parcelas: z.array(parcelaSchema).min(1, "A nota precisa de ao menos 1 parcela"),
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
};

export async function consultarSituacaoImportacao(
  chave: string,
  documento: string,
): Promise<SituacaoImportacao> {
  await exigirPapel(...PAPEIS);
  const [notaExistente, fornecedor] = await Promise.all([
    notaPorChave(chave),
    buscarFornecedorPorDocumento(documento),
  ]);
  return { notaExistente, fornecedor };
}

// XML reprocessado aqui (a prévia do client não é confiável); do client vêm só as escolhas.
// Sem `revalidar` no wrapper: revalida e redireciona por conta própria no sucesso.
export const importarNfe = acaoDeEscrita(
  { papeis: [...PAPEIS], atividade: "nota.importar_xml" },
  async (user, input: ImportarNfeInput): Promise<ImportarNfeResult> => {
    const parsed = importarSchema.safeParse(input);
    if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };
    const d = parsed.data;

    const lido = parseNfeXml(d.xml);
    if (!lido.ok) return { ok: false, erro: lido.erro };
    const nfe = lido.nfe;

    if (d.tipos.length !== nfe.itens.length || d.materiais.length !== nfe.itens.length) {
      return { ok: false, erro: "Os itens enviados não conferem com o XML — recarregue o arquivo." };
    }

    const rateio = validarRateio(d.rateios);
    if (!rateio.ok) {
      return { ok: false, erro: `Rateio deve somar 100% (atual: ${formatarPercentBp(rateio.somaBp)})` };
    }
    const erroEtapa = await erroEtapasDoRateio(d.rateios);
    if (erroEtapa) return { ok: false, erro: erroEtapa };
    const parcelas = validarParcelas(d.parcelas, nfe.totalCents);
    if (!parcelas.ok) {
      return {
        ok: false,
        erro: `Soma das parcelas difere do total da nota em ${formatarMoeda(parcelas.diferencaCents)}`,
      };
    }

    const existente = await notaPorChave(nfe.chave);
    if (existente) {
      return {
        ok: false,
        erro: `Esta NF-e já foi importada (NF ${existente.numero}).`,
        notaExistenteId: existente.id,
      };
    }

    let fornecedorId = (await buscarFornecedorPorDocumento(nfe.emitente.documento))?.id;
    let fornecedorCriado = false;
    if (!fornecedorId) {
      const dadosFornecedor = fornecedorSchema.safeParse({
        nome: nfe.emitente.razaoSocial,
        cnpj: formatarDocumento(nfe.emitente.documento),
        fone: nfe.emitente.fone ?? undefined,
      });
      if (!dadosFornecedor.success) return { ok: false, erro: dadosFornecedor.error.issues[0].message };
      const criado = await criarFornecedorValidado(dadosFornecedor.data);
      if (!criado.ok) return { ok: false, erro: criado.erro };
      fornecedorId = criado.fornecedor.id;
      fornecedorCriado = true;
    }

    // mesma NF lançada à mão antes (sem chave): o @@unique(fornecedor, número) recusaria
    const manual = await prisma.notaFiscal.findFirst({
      where: { fornecedorId, numero: nfe.numero },
      select: { id: true },
    });
    if (manual) {
      return {
        ok: false,
        erro: `A NF ${nfe.numero} deste fornecedor já foi lançada manualmente.`,
        notaExistenteId: manual.id,
      };
    }

    const anexoUrl = await storage.salvar(Buffer.from(d.xml, "utf8"), "xml");

    let notaId: string;
    try {
      notaId = await prisma.$transaction(async (tx) => {
        const nota = await tx.notaFiscal.create({
          data: {
            fornecedorId: fornecedorId!,
            numero: nfe.numero,
            tipoDocumento: "NF",
            chaveNfe: nfe.chave,
            dataCompra: inputParaData(nfe.dataEmissao),
            totalCents: nfe.totalCents,
            formaPagto: nfe.formaPagto,
            obs: `Importada do XML da NF-e${nfe.serie ? ` (série ${nfe.serie})` : ""}`,
            anexoUrl,
            anexoNome: d.nomeArquivo || `NFe${nfe.chave}.xml`,
            createdBy: user.id,
          },
        });

        await tx.rateioNota.createMany({
          data: d.rateios.map((r) => ({
            notaId: nota.id,
            obraId: r.obraId,
            etapaId: r.etapaId || null,
            fracaoBp: r.fracaoBp,
          })),
        });

        const materialIds: string[] = [];
        for (const escolha of d.materiais) {
          if (escolha.modo === "nenhum") {
            materialIds.push("");
          } else if (escolha.modo === "existente") {
            const existe = await tx.material.findUnique({ where: { id: escolha.id }, select: { id: true } });
            if (!existe) throw new Error("Um dos materiais escolhidos não existe mais — escolha de novo.");
            materialIds.push(existe.id);
          } else {
            const igual = await buscarMaterialPorNome(escolha.nome, undefined, tx);
            if (igual) {
              materialIds.push(igual.id);
              continue;
            }
            const criado = await criarMaterialValidado(
              { nome: escolha.nome, unidade: normalizarUnidade(escolha.unidade), tipo: "MATERIAL" },
              tx,
            );
            if (!criado.ok) throw new Error(criado.erro);
            materialIds.push(criado.material.id);
          }
        }

        await tx.itemNota.createMany({
          data: nfe.itens.map((item, i) => ({
            notaId: nota.id,
            materialId: materialIds[i] || null,
            descricao: item.descricao,
            tipo: d.tipos[i],
            qtde: item.qtde,
            unidade: item.unidade,
            unitCents: item.unitCents,
            descontoCents: item.descontoCents,
            totalCents: item.totalCents,
          })),
        });

        // texto e código do produto viram apelido: a próxima nota do fornecedor liga sozinha
        for (const [i, item] of nfe.itens.entries()) {
          if (!materialIds[i]) continue;
          await registrarApelido(tx, {
            materialId: materialIds[i],
            descricao: item.descricao,
            fornecedorId: fornecedorId!,
            codigoProduto: item.codigo,
          });
        }

        await tx.parcela.createMany({
          data: d.parcelas.map((p) => ({
            notaId: nota.id,
            numero: p.numero,
            valorCents: p.valorCents,
            vencimento: inputParaData(p.vencimento),
          })),
        });

        return nota.id;
      });
    } catch (e) {
      // corrida: outra importação da mesma chave terminou entre a checagem e a gravação
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const outra = await notaPorChave(nfe.chave);
        return { ok: false, erro: "Esta NF-e acabou de ser importada.", notaExistenteId: outra?.id };
      }
      throw e;
    }

    anotarAtividade({
      descricao: `Importou a NF ${nfe.numero} — ${nfe.emitente.razaoSocial} (${formatarMoeda(nfe.totalCents)})${fornecedorCriado ? " e cadastrou o fornecedor" : ""}`,
      entidade: "nota",
      entidadeId: notaId,
      obraIds: d.rateios.map((r) => r.obraId),
      valorCents: nfe.totalCents,
    });
    revalidatePath("/notas");
    revalidatePath("/contas");
    revalidatePath("/materiais");
    if (fornecedorCriado) revalidatePath("/fornecedores");
    redirect(`/notas/${notaId}`);
  },
);
