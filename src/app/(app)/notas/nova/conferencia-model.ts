import { moedaParaCents, formatarMoeda } from "@/lib/format";
import type { CorrespondenciaFornecedor } from "@/services/correspondencia-fornecedor";
import { normalizarDocumentoCadastro } from "@/services/correspondencia-fornecedor";
import { normalizarData, type LeituraNormalizada } from "@/services/leitura-documento";
import { BP_TOTAL } from "@/services/rateio";
import {
  parseQtde,
  somaItensForm,
  somaParcelasForm,
  somaRateioForm,
  valoresDaLeitura,
  type NotaFormValues,
} from "../nota-form-model";

export type EscolhaFornecedor =
  | { modo: "pendente" }
  // completarCom: CNPJ/CPF a gravar no cadastro, só se ele não tiver
  | { modo: "existente"; id: string; completarCom: string | null }
  | { modo: "novo"; nome: string; documento: string };

export type Conferencia = {
  valores: NotaFormValues;
  fornecedor: EscolhaFornecedor;
  conferido: boolean;
};

export function conferenciaInicial(
  leitura: LeituraNormalizada,
  correspondencia: CorrespondenciaFornecedor,
  opts: { anexoUrl: string; anexoNome: string; hoje: string; obraPadrao: string },
): Conferencia {
  const lidos = valoresDaLeitura(leitura, {
    fornecedorId: correspondencia.exato?.id ?? "",
    anexoUrl: opts.anexoUrl,
    anexoNome: opts.anexoNome,
    hoje: opts.hoje,
  });
  const valores: NotaFormValues = {
    fornecedorId: "",
    tipoDocumento: "NF",
    numero: "",
    dataCompra: opts.hoje,
    total: "",
    formaPagto: "PIX",
    numParcelas: "1",
    obs: "",
    anexoUrl: "",
    anexoNome: "",
    chaveNfe: "",
    itens: [],
    parcelas: [],
    rateios: [{ obraId: opts.obraPadrao, etapaId: "", percent: "100" }],
    ...lidos,
  };

  let fornecedor: EscolhaFornecedor;
  if (correspondencia.exato) fornecedor = { modo: "existente", id: correspondencia.exato.id, completarCom: null };
  else if (correspondencia.candidatos.length > 0) fornecedor = { modo: "pendente" };
  else {
    fornecedor = {
      modo: "novo",
      nome: leitura.fornecedor.nome ?? "",
      documento: leitura.fornecedor.documento ?? leitura.fornecedor.documentoLido ?? "",
    };
  }
  return { valores, fornecedor, conferido: false };
}

export function situacaoDocumento(valor: string): "vazio" | "valido" | "invalido" {
  if (!valor.trim()) return "vazio";
  return normalizarDocumentoCadastro(valor).ok ? "valido" : "invalido";
}

export function errosConferencia(c: Conferencia): string[] {
  const erros: string[] = [];
  const v = c.valores;
  const ehNF = v.tipoDocumento === "NF";

  const f = c.fornecedor;
  if (f.modo === "pendente") {
    erros.push("Fornecedor: escolha um dos cadastros parecidos ou cadastre um novo.");
  } else if (f.modo === "existente") {
    if (!f.id) erros.push("Fornecedor: escolha o fornecedor cadastrado.");
    if (f.completarCom && situacaoDocumento(f.completarCom) !== "valido") {
      erros.push("Fornecedor: o CNPJ/CPF a gravar no cadastro é inválido — corrija ou desmarque.");
    }
  } else {
    if (!f.nome.trim()) erros.push("Fornecedor: informe o nome.");
    const doc = situacaoDocumento(f.documento);
    if (doc === "invalido") erros.push("Fornecedor: CNPJ/CPF inválido — confira os dígitos com o documento.");
    if (doc === "vazio" && ehNF) erros.push("Fornecedor: informe o CNPJ/CPF do emitente da nota.");
  }

  if (ehNF && !v.numero.trim()) erros.push("Documento: informe o número da nota.");
  if (!normalizarData(v.dataCompra)) erros.push("Documento: data de emissão inválida.");
  const totalCents = moedaParaCents(v.total);
  if (totalCents <= 0) erros.push("Documento: informe o valor total.");

  if (v.itens.length === 0) erros.push("Itens: a nota precisa de ao menos 1 item.");
  v.itens.forEach((it, i) => {
    if (!it.descricao.trim()) erros.push(`Itens: a linha ${i + 1} está sem descrição.`);
    if (parseQtde(it.qtde) <= 0) erros.push(`Itens: a linha ${i + 1} está sem quantidade.`);
    if (!it.unidade.trim()) erros.push(`Itens: a linha ${i + 1} está sem unidade.`);
  });
  const somaItens = somaItensForm(v.itens);
  if (v.itens.length > 0 && totalCents > 0 && somaItens !== totalCents) {
    erros.push(
      `Itens: a soma (${formatarMoeda(somaItens)}) difere do total (${formatarMoeda(totalCents)}) em ${formatarMoeda(totalCents - somaItens)}.`,
    );
  }

  if (v.parcelas.length === 0) erros.push("Pagamento: informe ao menos 1 parcela.");
  v.parcelas.forEach((p, i) => {
    if (!normalizarData(p.vencimento)) erros.push(`Pagamento: a ${i + 1}ª parcela está sem vencimento.`);
    if (moedaParaCents(p.valor) <= 0) erros.push(`Pagamento: a ${i + 1}ª parcela está sem valor.`);
  });
  const somaParcelas = somaParcelasForm(v.parcelas, totalCents);
  if (v.parcelas.length > 0 && totalCents > 0 && somaParcelas !== totalCents) {
    erros.push(`Pagamento: a soma das parcelas (${formatarMoeda(somaParcelas)}) difere do total.`);
  }

  if (v.rateios.some((r) => !r.obraId)) erros.push("Obra: selecione a obra em todas as linhas.");
  if (somaRateioForm(v.rateios) !== BP_TOTAL) erros.push("Obra: os percentuais devem somar 100%.");

  if (!c.conferido) erros.push("Marque \"Conferi os dados com o documento\" para confirmar.");
  return erros;
}

export function escolhaParaAction(f: EscolhaFornecedor) {
  if (f.modo === "existente") return { modo: "existente" as const, id: f.id, completarDocumento: f.completarCom ?? undefined };
  if (f.modo === "novo") return { modo: "novo" as const, nome: f.nome, documento: f.documento || undefined };
  return null;
}

type NivelAcerto = "alto" | "medio" | "baixo";

type IndiceAcerto = {
  percentual: number;
  nivel: NivelAcerto;
  faltas: string[];
};

const PENALIDADE_AVISO = 8;
const PENALIDADE_AVISOS_MAX = 40;

// mede a leitura (não as edições do usuário) e decide quando sugerir a IA
export function indiceAcerto(leitura: LeituraNormalizada): IndiceAcerto {
  const checagens: [ok: boolean, falta: string][] = [];
  const ehNota = leitura.tipoDocumento === "NF";
  const temChave = /NF-e|NFC-e/.test(leitura.descricaoDocumento);

  checagens.push([!!leitura.fornecedor.nome, "nome do emitente"]);
  if (ehNota) checagens.push([!!leitura.fornecedor.documento, "CNPJ/CPF do emitente válido"]);
  if (ehNota) checagens.push([!!leitura.numero, "número da nota"]);
  if (temChave) checagens.push([!!leitura.chaveNfe, "chave de acesso válida"]);
  checagens.push([!!leitura.dataEmissao, "data de emissão"]);
  checagens.push([leitura.totalCents > 0, "valor total"]);
  const somaItens = leitura.itens.reduce((a, it) => a + it.totalCents, 0);
  checagens.push([leitura.itens.length > 0 && somaItens === leitura.totalCents, "itens que somam o total"]);

  const acertos = checagens.filter(([ok]) => ok).length;
  const base = (acertos / checagens.length) * 100;
  const penalidade = Math.min(PENALIDADE_AVISOS_MAX, leitura.avisos.length * PENALIDADE_AVISO);
  const percentual = Math.max(0, Math.round(base - penalidade));
  const nivel: NivelAcerto = percentual >= 85 ? "alto" : percentual >= 60 ? "medio" : "baixo";
  return { percentual, nivel, faltas: checagens.filter(([ok]) => !ok).map(([, falta]) => falta) };
}

export function conferenciaDaReleitura(
  anterior: Conferencia,
  leitura: LeituraNormalizada,
  correspondencia: CorrespondenciaFornecedor,
  opts: { anexoUrl: string; anexoNome: string; hoje: string; obraPadrao: string },
): Conferencia {
  const nova = conferenciaInicial(leitura, correspondencia, opts);
  return { ...nova, valores: { ...nova.valores, rateios: anterior.valores.rateios } };
}
