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

const PAPEIS = ["ADMIN", "ESCRITORIO"] as const;

const importarSchema = z.object({
  xml: z.string().min(1, "Selecione o arquivo XML"),
  nomeArquivo: z.string().optional(),
  // na mesma ordem dos itens do XML
  tipos: z.array(z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"])),
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

    if (d.tipos.length !== nfe.itens.length) {
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

        await tx.itemNota.createMany({
          data: nfe.itens.map((item, i) => ({
            notaId: nota.id,
            descricao: item.descricao,
            tipo: d.tipos[i],
            qtde: item.qtde,
            unidade: item.unidade,
            unitCents: item.unitCents,
            descontoCents: item.descontoCents,
            totalCents: item.totalCents,
          })),
        });

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
    if (fornecedorCriado) revalidatePath("/fornecedores");
    redirect(`/notas/${notaId}`);
  },
);
