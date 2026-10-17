import { Prisma, type FormaPagto, type TipoDocumento, type TipoItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataParaInput, formatarMoeda, formatarPercentBp, inputParaData } from "@/lib/format";
import { exigeNumero, gerarNumeroDocumento, PREFIXO_DOCUMENTO } from "./financeiro";
import { calcularTotalItem, validarRateio } from "./rateio";
import {
  avisoParcelasPagas,
  reconciliarParcelas,
  validarParcelas,
  type ParcelaExistente,
} from "./parcelas";
import { erroEtapasDoRateio } from "./obras";
import { chaveAcessoValida, normalizarNumeroNf } from "./leitura-documento";
import { criarFornecedorValidado, validarDocumentoFornecedor } from "./fornecedores";
import { normalizarDocumentoCadastro } from "./correspondencia-fornecedor";
import { buscarMaterialPorNome, criarMaterialValidado, registrarApelido } from "./materiais-db";
import { normalizarUnidade } from "./materiais";

// Todo lançamento (form, leitura, XML, planilha) passa por aqui: as regras e a gravação moram num lugar só.

type Tx = Prisma.TransactionClient;
type Db = Prisma.TransactionClient | typeof prisma;

export type FornecedorDoLancamento =
  | { id: string }
  | { novo: { nome: string; cnpj?: string; fone?: string } };

export type ItemDoLancamento = {
  materialId?: string;
  // material criado junto com o lançamento, na mesma transação
  materialNovo?: { nome: string; unidade: string };
  codigoProduto?: string | null;
  descricao: string;
  tipo: TipoItem;
  qtde: number;
  unidade: string;
  unitCents: number;
  descontoCents: number;
  // ausente = qtde × unitário − desconto
  totalCents?: number;
};

export type Lancamento = {
  id?: string;
  fornecedor: FornecedorDoLancamento;
  tipoDocumento: TipoDocumento;
  numero: string;
  dataCompra: string;
  totalCents: number;
  formaPagto: FormaPagto;
  obs?: string;
  anexoUrl?: string;
  anexoNome?: string;
  // só vale na criação; a edição preserva a chave gravada
  chaveNfe?: string;
  itens: ItemDoLancamento[];
  rateios: { obraId: string; etapaId?: string; fracaoBp: number }[];
  parcelas: { numero: number; valorCents: number; vencimento: string; pagaEm?: Date | null }[];
  criadoPor: string;
};

export type ResultadoLancamento =
  | { ok: true; notaId: string; numero: string; fornecedorNome: string; fornecedorCriado: boolean }
  | { ok: false; erro: string; aviso?: boolean; notaExistenteId?: string };

const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  NF: "a NF",
  RECIBO: "o recibo",
  FOLHA: "a folha",
  GUIA: "a guia",
  OUTRO: "o documento",
};

export function descricaoDoLancamento(
  verbo: "Lançou" | "Editou" | "Excluiu" | "Importou",
  nota: { tipoDocumento: TipoDocumento; numero: string; totalCents: number },
  fornecedorNome: string,
): string {
  return `${verbo} ${ROTULO_DOCUMENTO[nota.tipoDocumento]} ${nota.numero} — ${fornecedorNome} (${formatarMoeda(nota.totalCents)})`;
}

function mensagemNumeroRepetido(tipo: TipoDocumento, numero: string): string {
  if (tipo === "NF") {
    return `Já existe a NF ${numero} deste fornecedor. Confira se a nota não foi lançada antes.`;
  }
  return numero
    ? `Já existe um lançamento nº ${numero} deste fornecedor. Use outro número ou deixe em branco para gerar automaticamente.`
    : "Não foi possível gerar o número do lançamento. Tente salvar de novo.";
}

const MSG_OBRA_REPETIDA = "A mesma obra aparece mais de uma vez no rateio. Junte as linhas em uma só.";

// NF sem zeros à esquerda, como o nNF do XML: a duplicata (fornecedor + número) depende disso.
export function numeroDoLancamento(tipo: TipoDocumento, numero: string): string {
  return tipo === "NF" ? normalizarNumeroNf(numero) : numero.trim();
}

// Só os dígitos do CNPJ/CPF: "12.345.678/0001-95" e "12345678000195" são o mesmo fornecedor.
export function documentoSoDigitos(doc: string | null | undefined): string {
  return (doc ?? "").replace(/\D/g, "");
}

// Chave de duplicidade (fornecedor, número) com o número normalizado, como o bloqueio do lançamento.
export function chaveDeDuplicidade(fornecedorId: string, numero: string, tipo: TipoDocumento = "NF"): string {
  return `${fornecedorId}::${numeroDoLancamento(tipo, numero)}`;
}

// CNPJ/CPF da planilha de um fornecedor novo: válido vira o valor com máscara; inválido não derruba a
// importação, o fornecedor entra sem documento e o motivo vira aviso.
export function documentoDaPlanilha(cnpj: string | null): { cnpj?: string; aviso?: string } {
  if (!cnpj || !cnpj.trim()) return {};
  const doc = normalizarDocumentoCadastro(cnpj);
  return doc.ok ? { cnpj: doc.valor } : { aviso: `${doc.erro} ("${cnpj.trim()}")` };
}

// Regras que não dependem do banco. `somaParcelas: false` é para a planilha antiga, que traz parcelas que não fecham.
export function erroDeRegras(l: Lancamento, opcoes: { somaParcelas?: boolean } = {}): string | null {
  if (exigeNumero(l.tipoDocumento) && !l.numero.trim()) return "Número da NF é obrigatório";
  if (l.rateios.length === 0) return "Defina o rateio entre obras";
  if (l.parcelas.length === 0) return "A nota precisa de ao menos 1 parcela";
  if (new Set(l.rateios.map((r) => r.obraId)).size !== l.rateios.length) return MSG_OBRA_REPETIDA;

  const rateio = validarRateio(l.rateios);
  if (!rateio.ok) return `Rateio deve somar 100% (atual: ${formatarPercentBp(rateio.somaBp)})`;

  if (opcoes.somaParcelas !== false) {
    const parcelas = validarParcelas(l.parcelas, l.totalCents);
    if (!parcelas.ok) {
      return `Soma das parcelas difere do total da nota em ${formatarMoeda(parcelas.diferencaCents)}`;
    }
  }
  return null;
}

async function parcelasExistentes(db: Db, notaId: string): Promise<ParcelaExistente[]> {
  const parcelas = await db.parcela.findMany({
    where: { notaId },
    select: { numero: true, valorCents: true, vencimento: true, status: true, pagaEm: true },
  });
  // mesma conversão da tela de edição: parcela não mexida volta idêntica e é mantida
  return parcelas.map((p) => ({ ...p, vencimento: dataParaInput(p.vencimento) }));
}

type Recusa = Extract<ResultadoLancamento, { ok: false }>;

// `digitado` é o número como veio: notas antigas podem estar gravadas com zeros à esquerda.
async function recusaDeDuplicidade(db: Db, l: Lancamento, numero: string, digitado: string): Promise<Recusa | null> {
  // bloqueio, não aviso: o @@unique(fornecedorId, numero) faria "salvar mesmo assim" falhar
  if (numero && "id" in l.fornecedor) {
    const candidatos = [...new Set([numero, digitado.trim()])];
    const repetida = await db.notaFiscal.findFirst({
      where: { fornecedorId: l.fornecedor.id, numero: { in: candidatos }, ...(l.id ? { NOT: { id: l.id } } : {}) },
      select: { id: true },
    });
    if (repetida) {
      return { ok: false, erro: mensagemNumeroRepetido(l.tipoDocumento, numero), notaExistenteId: repetida.id };
    }
  }

  const materialIds = [...new Set(l.itens.map((i) => i.materialId).filter((m): m is string => !!m))];
  if (materialIds.length > 0) {
    const existentes = await db.material.count({ where: { id: { in: materialIds } } });
    if (existentes !== materialIds.length) {
      return { ok: false, erro: "Um dos materiais escolhidos não existe mais — escolha de novo." };
    }
  }

  const chave = l.id ? undefined : l.chaveNfe;
  if (chave) {
    if (!chaveAcessoValida(chave)) return { ok: false, erro: "Chave de acesso inválida" };
    const mesma = await db.notaFiscal.findUnique({ where: { chaveNfe: chave }, select: { id: true, numero: true } });
    if (mesma) {
      return { ok: false, erro: `Esta NF-e já foi lançada (NF ${mesma.numero}).`, notaExistenteId: mesma.id };
    }
  }
  return null;
}

// P2002 de corrida: outro lançamento ocupou a vaga entre a checagem e a gravação. Cada índice tem a sua mensagem.
function recusaDeUnicidade(erro: unknown, l: Lancamento, numero: string): Recusa | null {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== "P2002") return null;
  const alvo = String(erro.meta?.target ?? "");
  if (alvo.includes("chaveNfe")) return { ok: false, erro: "Esta NF-e acabou de ser lançada por outra pessoa." };
  if (alvo.includes("fornecedorId")) return { ok: false, erro: mensagemNumeroRepetido(l.tipoDocumento, numero) };
  if (alvo.includes("obraId")) return { ok: false, erro: MSG_OBRA_REPETIDA };
  if (alvo.includes("cnpj")) return { ok: false, erro: "Já existe um fornecedor com este CNPJ/CPF." };
  return null;
}

function totalDoItem(i: ItemDoLancamento): number {
  return i.totalCents ?? calcularTotalItem(i.qtde, i.unitCents, i.descontoCents);
}

async function resolverMaterial(tx: Tx, item: ItemDoLancamento): Promise<string | null> {
  if (item.materialId) return item.materialId;
  if (!item.materialNovo) return null;
  const nome = item.materialNovo.nome.trim();
  const igual = await buscarMaterialPorNome(nome, undefined, tx);
  if (igual) return igual.id;
  const criado = await criarMaterialValidado(
    { nome, unidade: normalizarUnidade(item.materialNovo.unidade), tipo: "MATERIAL" },
    tx,
  );
  if (!criado.ok) throw new Error(criado.erro);
  return criado.material.id;
}

// Grava o lançamento inteiro dentro da transação recebida: nota, rateio, itens, parcelas, fornecedor e materiais novos.
export async function gravarLancamento(tx: Tx, l: Lancamento) {
  let fornecedorId: string;
  let fornecedorNome: string;
  let fornecedorCriado = false;
  if ("id" in l.fornecedor) {
    fornecedorId = l.fornecedor.id;
    fornecedorNome = (await tx.fornecedor.findUnique({ where: { id: fornecedorId }, select: { nome: true } }))?.nome ?? "fornecedor";
  } else {
    const criado = await criarFornecedorValidado(l.fornecedor.novo, tx);
    if (!criado.ok) throw new Error(criado.erro);
    fornecedorId = criado.fornecedor.id;
    fornecedorNome = criado.fornecedor.nome;
    fornecedorCriado = true;
  }

  let numero = l.numero;
  if (!numero && !exigeNumero(l.tipoDocumento)) {
    const existentes = await tx.notaFiscal.findMany({
      where: { fornecedorId, numero: { startsWith: `${PREFIXO_DOCUMENTO[l.tipoDocumento]}-` } },
      select: { numero: true },
    });
    numero = gerarNumeroDocumento(l.tipoDocumento, existentes.map((n) => n.numero));
  }

  const dadosNota = {
    fornecedorId,
    numero,
    tipoDocumento: l.tipoDocumento,
    dataCompra: inputParaData(l.dataCompra),
    totalCents: l.totalCents,
    formaPagto: l.formaPagto,
    obs: l.obs || null,
    anexoUrl: l.anexoUrl || null,
    anexoNome: l.anexoNome || null,
  };

  let notaId = l.id;
  if (notaId) {
    await tx.itemNota.deleteMany({ where: { notaId } });
    await tx.rateioNota.deleteMany({ where: { notaId } });
    await tx.notaFiscal.update({ where: { id: notaId }, data: dadosNota });
  } else {
    const nota = await tx.notaFiscal.create({
      data: { ...dadosNota, chaveNfe: l.chaveNfe || null, createdBy: l.criadoPor },
    });
    notaId = nota.id;
  }
  const idDaNota = notaId;

  await tx.rateioNota.createMany({
    data: l.rateios.map((r) => ({
      notaId: idDaNota,
      obraId: r.obraId,
      etapaId: r.etapaId || null,
      fracaoBp: r.fracaoBp,
    })),
  });

  const materialIds: (string | null)[] = [];
  for (const item of l.itens) materialIds.push(await resolverMaterial(tx, item));

  await tx.itemNota.createMany({
    data: l.itens.map((item, i) => ({
      notaId: idDaNota,
      materialId: materialIds[i],
      descricao: item.descricao,
      tipo: item.tipo,
      qtde: item.qtde,
      unidade: item.unidade,
      unitCents: item.unitCents,
      descontoCents: item.descontoCents,
      totalCents: totalDoItem(item),
    })),
  });

  // `manter` não é tocada (preserva status/pagaEm); alteradas voltam a ABERTA
  const reconciliacao = reconciliarParcelas(l.id ? await parcelasExistentes(tx, idDaNota) : [], l.parcelas);
  if (reconciliacao.removidas.length > 0) {
    await tx.parcela.deleteMany({ where: { notaId: idDaNota, numero: { in: reconciliacao.removidas } } });
  }
  for (const p of reconciliacao.parcelas.filter((p) => p.acao === "atualizar")) {
    await tx.parcela.update({
      where: { notaId_numero: { notaId: idDaNota, numero: p.numero } },
      data: { valorCents: p.valorCents, vencimento: inputParaData(p.vencimento), status: p.status, pagaEm: p.pagaEm },
    });
  }
  const criar = reconciliacao.parcelas.filter((p) => p.acao === "criar");
  if (criar.length > 0) {
    const pagaEm = new Map(l.parcelas.map((p) => [p.numero, p.pagaEm ?? null]));
    await tx.parcela.createMany({
      data: criar.map((p) => ({
        notaId: idDaNota,
        numero: p.numero,
        valorCents: p.valorCents,
        vencimento: inputParaData(p.vencimento),
        pagaEm: pagaEm.get(p.numero) ?? null,
        status: pagaEm.get(p.numero) ? ("PAGA" as const) : ("ABERTA" as const),
      })),
    });
  }

  // o texto da nota (e o código do produto, quando há) vira apelido: da próxima vez o material liga sozinho
  for (const [i, item] of l.itens.entries()) {
    const materialId = materialIds[i];
    if (!materialId) continue;
    await registrarApelido(tx, {
      materialId,
      descricao: item.descricao,
      fornecedorId,
      codigoProduto: item.codigoProduto,
    });
  }

  return { notaId: idDaNota, numero, fornecedorNome, fornecedorCriado };
}

// `dataCompra` aaaa-mm-dd. Só aviso: dá para confirmar com "Salvar mesmo assim" (compra a prazo, data errada...).
export function avisoDataCompraFutura(dataCompra: string, hoje: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataCompra);
  if (!m) return null;
  if (`${m[1]}-${m[2]}-${m[3]}` <= dataParaInput(hoje)) return null;
  return `A data da compra é futura (${m[3]}/${m[2]}/${m[1]}). Confira antes de salvar.`;
}

// Valida, avisa e grava. `forcar` confirma os avisos (soma dos itens, data futura, parcelas pagas alteradas) de uma vez.
export async function registrarLancamento(
  lancamento: Lancamento,
  opcoes: { forcar?: boolean } = {},
  db: typeof prisma = prisma,
): Promise<ResultadoLancamento> {
  const numero = numeroDoLancamento(lancamento.tipoDocumento, lancamento.numero);
  const l: Lancamento = { ...lancamento, numero };

  const erroRegras = erroDeRegras(l);
  if (erroRegras) return { ok: false, erro: erroRegras };
  const erroEtapa = await erroEtapasDoRateio(l.rateios, db);
  if (erroEtapa) return { ok: false, erro: erroEtapa };

  if ("novo" in l.fornecedor) {
    const doc = await validarDocumentoFornecedor(l.fornecedor.novo.cnpj, {}, db);
    if (!doc.ok) return { ok: false, erro: doc.erro };
  }

  const recusa = await recusaDeDuplicidade(db, l, numero, lancamento.numero);
  if (recusa) return recusa;

  // avisos todos numa só pergunta: confirmar um não pode pular os demais em silêncio
  if (!opcoes.forcar) {
    const avisos: string[] = [];
    const somaItensCents = l.itens.reduce((a, i) => a + totalDoItem(i), 0);
    if (somaItensCents !== l.totalCents) {
      avisos.push(
        `Soma dos itens (${formatarMoeda(somaItensCents)}) difere do valor total (${formatarMoeda(l.totalCents)}).`,
      );
    }
    const avisoData = avisoDataCompraFutura(l.dataCompra);
    if (avisoData) avisos.push(avisoData);
    if (l.id) {
      const avisoPagas = avisoParcelasPagas(
        reconciliarParcelas(await parcelasExistentes(db, l.id), l.parcelas).pagasAfetadas,
      );
      if (avisoPagas) avisos.push(avisoPagas);
    }
    if (avisos.length > 0) return { ok: false, aviso: true, erro: [...avisos, "Salvar mesmo assim?"].join("\n\n") };
  }

  try {
    const gravado = await db.$transaction((tx) => gravarLancamento(tx, l));
    return { ok: true, ...gravado };
  } catch (erro) {
    const recusaCorrida = recusaDeUnicidade(erro, l, numero);
    if (recusaCorrida) return recusaCorrida;
    throw erro;
  }
}
