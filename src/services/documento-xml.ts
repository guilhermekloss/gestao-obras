// A tela "Importar XML" aceita NF-e e NFS-e: aqui se decide qual é e se monta o que os dois têm em comum para
// gravar. Sem acesso ao banco: a prévia (client) e a action (servidor) usam as mesmas regras.
import type { FormaPagto, TipoItem } from "@prisma/client";
import { parcelasDaNfe, parseNfeXml, type ItemNfe, type Nfe } from "./nfe-xml";
import { observacaoDaNfse, pareceNfse, parseNfseXml, type Nfse } from "./nfse-xml";
import type { FornecedorDoLancamento, Lancamento } from "./lancamento";
import { formatarData } from "@/lib/format";
import { chaveNfseValida } from "./leitura-documento";
import type { CrtEmitente, TotaisIbsCbs } from "./tributacao/ibs-cbs";

export type DocumentoXml = { tipo: "NFE"; nfe: Nfe } | { tipo: "NFSE"; nfse: Nfse };

/** O que o import grava, igual para NF-e e NFS-e. */
export type DadosImportaveis = {
  tipoDocumento: "NF" | "NFSE";
  /** "NF-e" ou "NFS-e", para as mensagens. */
  rotulo: string;
  chave: string;
  numero: string;
  dataEmissao: string;
  emitente: { documento: string; tipoDocumento: "CNPJ" | "CPF"; razaoSocial: string; fone: string | null };
  cno: string | null;
  /** Com o que a conferência do IBS/CBS lê: NCM, NBS e o grupo IBS/CBS de cada item. */
  itens: ItemNfe[];
  totalCents: number;
  formaPagto: FormaPagto;
  crtEmitente: CrtEmitente | null;
  /** Totais de IBS/CBS declarados pela nota para a conferência; a NFS-e não os traz (nulo). */
  totaisIbsCbs: TotaisIbsCbs | null;
  /** Parcelas sugeridas; `rotulo` diz de onde vêm (duplicata, guia...). */
  parcelas: { numero: number; valorCents: number; vencimento: string; rotulo: string | null }[];
  /** De onde vêm as parcelas, para a seção "Parcelas" da prévia. */
  explicacaoParcelas: string;
  obs: string;
  nomeArquivo: string;
  avisos: string[];
};

type Resultado = { ok: true; doc: DocumentoXml } | { ok: false; erro: string };

/** Lê o XML como NFS-e nacional quando ele tem infNFSe; senão, como NF-e. */
export function parseDocumentoXml(xml: string): Resultado {
  if (pareceNfse(xml)) {
    const r = parseNfseXml(xml);
    return r.ok ? { ok: true, doc: { tipo: "NFSE", nfse: r.nfse } } : r;
  }
  const r = parseNfeXml(xml);
  if (r.ok) return { ok: true, doc: { tipo: "NFE", nfe: r.nfe } };
  return {
    ok: false,
    erro: r.erro.startsWith("O arquivo não é o XML")
      ? "O arquivo não é o XML de uma NF-e nem de uma NFS-e do padrão nacional."
      : r.erro,
  };
}

// sem passar por fuso horário
function dataDoXml(data: string): string {
  return formatarData(`${data}T12:00:00`);
}

export function dadosImportaveis(doc: DocumentoXml): DadosImportaveis {
  if (doc.tipo === "NFSE") {
    const n = doc.nfse;
    return {
      tipoDocumento: "NFSE",
      rotulo: "NFS-e",
      chave: n.chave,
      numero: n.numero,
      dataEmissao: n.dataEmissao,
      emitente: {
        documento: n.emitente.documento,
        tipoDocumento: n.emitente.tipoDocumento,
        razaoSocial: n.emitente.razaoSocial,
        fone: n.emitente.fone,
      },
      cno: n.cno,
      itens: n.itens,
      totalCents: n.totalCents,
      formaPagto: n.formaPagto,
      crtEmitente: n.crtEmitente,
      totaisIbsCbs: null,
      parcelas: n.parcelas,
      explicacaoParcelas:
        n.parcelas.length > 1
          ? "A NFS-e não traz vencimentos: o valor líquido vai ao prestador na emissão e cada retenção vira uma guia (ISS no dia 10 e federais no dia 20 do mês seguinte à competência; confira os prazos)."
          : `A NFS-e não traz vencimentos: a nota entra com uma parcela única, vencendo na emissão (${dataDoXml(n.dataEmissao)}).`,
      obs: observacaoDaNfse(n),
      nomeArquivo: `NFSe${n.chave}.xml`,
      avisos: n.avisos,
    };
  }
  const n = doc.nfe;
  return {
    tipoDocumento: "NF",
    rotulo: "NF-e",
    chave: n.chave,
    numero: n.numero,
    dataEmissao: n.dataEmissao,
    emitente: n.emitente,
    cno: n.cno,
    itens: n.itens,
    totalCents: n.totalCents,
    formaPagto: n.formaPagto,
    crtEmitente: n.crtEmitente,
    totaisIbsCbs: n.totaisIbsCbs,
    explicacaoParcelas:
      n.duplicatas.length === 0
        ? `O XML não traz duplicatas: a nota entra com uma parcela única, vencendo na emissão (${dataDoXml(n.dataEmissao)}).`
        : "Vêm das duplicatas (boletos) do XML.",
    parcelas: parcelasDaNfe(n).map((p, i) => ({
      ...p,
      rotulo: n.duplicatas[i] ? `Duplicata ${n.duplicatas[i].numero}` : null,
    })),
    obs: `Importada do XML da NF-e${n.serie ? ` (série ${n.serie})` : ""}`,
    nomeArquivo: `NFe${n.chave}.xml`,
    avisos: n.avisos,
  };
}

/** Aviso de nota já lançada com a mesma chave; a de 50 posições é de NFS-e. */
export function mensagemNotaJaImportada(chave: string, numero: string): string {
  return chaveNfseValida(chave) ? `Esta NFS-e já foi lançada (NFS-e ${numero}).` : `Esta NF-e já foi lançada (NF ${numero}).`;
}

export type EscolhaMaterialXml =
  | { modo: "nenhum" }
  | { modo: "existente"; id: string }
  | { modo: "novo"; nome: string; unidade: string };

/** O que vem do client: só escolhas. Valores e dados fiscais saem do XML relido no servidor. */
export type EscolhasDoImport = {
  tipos: TipoItem[];
  materiais: EscolhaMaterialXml[];
  rateios: Lancamento["rateios"];
  parcelas: Lancamento["parcelas"];
};

export function lancamentoDoXml(
  dados: DadosImportaveis,
  escolhas: EscolhasDoImport,
  ctx: { fornecedor: FornecedorDoLancamento; anexoUrl: string; nomeArquivo?: string; criadoPor: string },
): Lancamento {
  return {
    fornecedor: ctx.fornecedor,
    tipoDocumento: dados.tipoDocumento,
    numero: dados.numero,
    dataCompra: dados.dataEmissao,
    totalCents: dados.totalCents,
    formaPagto: dados.formaPagto,
    obs: dados.obs,
    anexoUrl: ctx.anexoUrl,
    anexoNome: ctx.nomeArquivo || dados.nomeArquivo,
    chaveNfe: dados.chave,
    crtEmitente: dados.crtEmitente,
    itens: dados.itens.map((item, i) => {
      const escolha = escolhas.materiais[i];
      return {
        materialId: escolha?.modo === "existente" ? escolha.id : undefined,
        materialNovo: escolha?.modo === "novo" ? { nome: escolha.nome, unidade: escolha.unidade } : undefined,
        codigoProduto: item.codigo,
        descricao: item.descricao,
        tipo: escolhas.tipos[i] ?? item.tipoSugerido,
        qtde: item.qtde,
        unidade: item.unidade,
        unitCents: item.unitCents,
        descontoCents: item.descontoCents,
        totalCents: item.totalCents,
        ncm: item.ncm,
        nbs: item.nbs ?? null,
        ibsCbs: item.ibsCbs ?? null,
      };
    }),
    rateios: escolhas.rateios,
    parcelas: escolhas.parcelas,
    criadoPor: ctx.criadoPor,
  };
}
