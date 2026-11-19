// O que não fecha vira aviso, nada é consertado em silêncio: numa foto, diferença costuma ser erro de leitura.
import { z } from "zod";
import type { FormaPagto, TipoDocumento, TipoItem } from "@prisma/client";
import { formatarMoeda } from "@/lib/format";
import { calcularTotalItem } from "./rateio";
import { unitarioCoerente } from "./nfe-xml";
import { normalizarCno } from "./cno";
import { exigeNumero } from "./financeiro";

// Só tipos simples, nullable e describe: no JSON Schema da API, regex/min/max não são garantidos.
// A validação de verdade acontece em normalizarLeitura.

const valor = (descricao: string) => z.number().nullable().describe(descricao);
const texto = (descricao: string) => z.string().nullable().describe(descricao);

export const documentoLidoSchema = z.object({
  tipo: z
    .enum(["NFE", "NFCE", "NFSE", "RECIBO", "BOLETO", "GUIA", "OUTRO", "NAO_E_DOCUMENTO"])
    .describe(
      "NFE = DANFE de NF-e (modelo 55); NFCE = cupom/DANFE NFC-e (modelo 65); NFSE = nota de serviço municipal; RECIBO; BOLETO; GUIA = DARF/GPS/DAS/guia de imposto; OUTRO = outro comprovante de despesa; NAO_E_DOCUMENTO = a imagem não é um documento de compra/pagamento",
    ),
  legibilidade: z
    .enum(["BOA", "PARCIAL", "RUIM"])
    .describe("PARCIAL = parte do documento cortada, borrada ou ilegível; RUIM = quase nada legível"),
  emitente: z.object({
    nome: texto("Razão social ou nome de quem emitiu / recebe o pagamento"),
    documento: texto("CNPJ ou CPF do emitente, só os dígitos"),
    telefone: texto("Telefone do emitente, se impresso"),
  }),
  destinatario: z.object({
    nome: texto("Nome de quem comprou / tomou o serviço (destinatário, tomador ou pagador)"),
    documento: texto("CNPJ ou CPF do destinatário/tomador, só os dígitos"),
  }),
  numero: texto("Número do documento (nº da NF, do recibo...) exatamente como impresso"),
  serie: texto("Série da nota, se houver"),
  chaveAcesso: texto("Chave de acesso de 44 dígitos (NF-e/NFC-e), só os dígitos, sem espaços"),
  dataEmissao: texto("Data de emissão no formato AAAA-MM-DD"),
  cno: texto(
    "CNO (Cadastro Nacional de Obras) ou CEI da obra, 12 dígitos, quando impresso: nos dados adicionais/informações complementares da NF-e ou no campo Obra da NFS-e; só os dígitos; null se não houver",
  ),
  valorTotal: valor("Valor total a pagar do documento, em reais"),
  valorFrete: valor("Valor do frete no quadro de totais, em reais; null se não houver"),
  valorOutrasDespesas: valor(
    "Soma de IPI, ICMS-ST, seguro e outras despesas acessórias que somam ao total e NÃO estão nos itens, em reais; null se não houver",
  ),
  descontoGeral: valor(
    "Desconto aplicado ao total que NÃO está distribuído nos itens, em reais; null se não houver",
  ),
  formaPagamento: z
    .enum(["PIX", "CARTAO", "DEBITO", "BOLETO", "TRANSFERENCIA", "DINHEIRO", "NAO_INFORMADA"])
    .describe("CARTAO = cartão de crédito; TRANSFERENCIA = TED/DOC/depósito"),
  itens: z
    .array(
      z.object({
        descricao: z.string().describe("Descrição do produto ou serviço como impressa"),
        quantidade: valor("Quantidade"),
        unidade: texto("Unidade (UN, PC, KG, M, M2, M3, SC, CX...)"),
        valorUnitario: valor("Valor unitário, em reais"),
        desconto: valor("Desconto do item, em reais; null se não houver"),
        valorTotal: valor("Valor total da linha do item, em reais"),
        tipo: z
          .enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"])
          .describe("MATERIAL = produto/insumo; SERVICO = mão de obra ou serviço; FRETE = transporte; ENCARGO = imposto, taxa ou tarifa"),
      }),
    )
    .describe("Uma entrada por linha de item do documento, na ordem impressa"),
  parcelas: z
    .array(
      z.object({
        vencimento: texto("Data de vencimento no formato AAAA-MM-DD"),
        valor: valor("Valor da parcela, em reais"),
      }),
    )
    .describe("Duplicatas/fatura (ou o vencimento do boleto). Vazio se o documento não mostra vencimentos"),
  observacoes: texto(
    "Algo que o usuário precisa saber para conferir (ex.: itens cortados na foto, valor rasurado); null se nada",
  ),
});

export type DocumentoLido = z.infer<typeof documentoLidoSchema>;

function digitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// Módulo 11 com pesos 2..9 da direita para a esquerda (CNPJ e chave de acesso).
function dvModulo11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const d = digitos(valor);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  return dvModulo11(d.slice(0, 12)) === Number(d[12]) && dvModulo11(d.slice(0, 13)) === Number(d[13]);
}

export function cpfValido(valor: string): boolean {
  const d = digitos(valor);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    const soma = [...base].reduce((acc, c, i) => acc + Number(c) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

export function documentoValido(valor: string): boolean {
  const d = digitos(valor);
  return d.length === 14 ? cnpjValido(d) : d.length === 11 ? cpfValido(d) : false;
}

export function chaveAcessoValida(chave: string): boolean {
  const d = digitos(chave);
  return d.length === 44 && dvModulo11(d.slice(0, 43)) === Number(d[43]);
}

// Leiaute da chave: cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1).
export function dadosDaChave(chave: string) {
  const d = digitos(chave);
  return {
    cnpj: d.slice(6, 20),
    modelo: d.slice(20, 22),
    serie: String(Number(d.slice(22, 25))),
    numero: String(Number(d.slice(25, 34))),
  };
}

type ItemLeitura = {
  descricao: string;
  tipo: TipoItem;
  qtde: number;
  unidade: string;
  unitCents: number;
  descontoCents: number;
  totalCents: number;
};

export type LeituraNormalizada = {
  tipoDocumento: TipoDocumento;
  descricaoDocumento: string;
  fornecedor: {
    nome: string | null;
    documento: string | null;
    documentoLido: string | null;
    fone: string | null;
  };
  destinatario: {
    nome: string | null;
    documento: string | null;
    documentoLido: string | null;
  };
  numero: string;
  serie: string | null;
  chaveNfe: string | null;
  dataEmissao: string | null;
  /** CNO da obra citado no documento (12 dígitos). */
  cno: string | null;
  totalCents: number;
  formaPagto: FormaPagto;
  itens: ItemLeitura[];
  parcelas: { numero: number; valorCents: number; vencimento: string }[];
  avisos: string[];
};

type ResultadoLeitura = { ok: true; leitura: LeituraNormalizada } | { ok: false; erro: string };

const DESCRICAO_TIPO: Record<DocumentoLido["tipo"], string> = {
  NFE: "NF-e (DANFE)",
  NFCE: "NFC-e (cupom fiscal)",
  NFSE: "NFS-e (nota de serviço)",
  RECIBO: "Recibo",
  BOLETO: "Boleto",
  GUIA: "Guia de imposto",
  OUTRO: "Comprovante",
  NAO_E_DOCUMENTO: "Não reconhecido",
};

const TIPO_DOCUMENTO: Record<DocumentoLido["tipo"], TipoDocumento> = {
  NFE: "NF",
  NFCE: "NF",
  NFSE: "NFSE",
  RECIBO: "RECIBO",
  GUIA: "GUIA",
  BOLETO: "OUTRO",
  OUTRO: "OUTRO",
  NAO_E_DOCUMENTO: "OUTRO",
};

const TIPO_ITEM_PADRAO: Record<TipoDocumento, TipoItem> = {
  NF: "MATERIAL",
  NFSE: "SERVICO",
  RECIBO: "SERVICO",
  FOLHA: "SERVICO",
  GUIA: "ENCARGO",
  OUTRO: "MATERIAL",
};

export function reaisParaCents(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

export function normalizarData(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : t.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? iso : null;
}

// Sem zeros à esquerda, como o nNF do XML: o bloqueio de duplicata (fornecedor + número) depende disso.
export function normalizarNumeroNf(numero: string): string {
  const d = numero.replace(/[\s.\-/]/g, "");
  return /^\d+$/.test(d) ? String(Number(d)) : numero.trim();
}

export function normalizarLeitura(lido: DocumentoLido, hoje: string): ResultadoLeitura {
  if (lido.tipo === "NAO_E_DOCUMENTO") {
    return {
      ok: false,
      erro: "Não reconhecemos uma nota, recibo ou boleto nesse arquivo. Tente outra foto, com o documento inteiro e bem iluminado.",
    };
  }

  const avisos: string[] = [];
  const tipoDocumento = TIPO_DOCUMENTO[lido.tipo];
  const ehNota = exigeNumero(tipoDocumento);

  if (lido.legibilidade !== "BOA") {
    avisos.push(
      lido.legibilidade === "RUIM"
        ? "A imagem está difícil de ler: confira todos os campos com atenção (ou tire outra foto)."
        : "Parte do documento estava cortada ou pouco legível: confira os campos.",
    );
  }
  if (lido.observacoes?.trim()) avisos.push(lido.observacoes.trim());

  let chaveNfe: string | null = null;
  const chaveLida = digitos(lido.chaveAcesso);
  if (chaveLida) {
    if (chaveAcessoValida(chaveLida)) chaveNfe = chaveLida;
    else avisos.push("A chave de acesso não pôde ser lida com segurança e foi ignorada.");
  }
  const daChave = chaveNfe ? dadosDaChave(chaveNfe) : null;

  const documentoLido = digitos(lido.emitente.documento) || null;
  let documento: string | null = documentoLido;
  if (documento && !documentoValido(documento)) {
    avisos.push(`O CNPJ/CPF lido (${documento}) não confere com os dígitos verificadores — confira o fornecedor.`);
    documento = null;
  }
  if (daChave && cnpjValido(daChave.cnpj)) {
    if (!documento) documento = daChave.cnpj;
    else if (documento !== daChave.cnpj) {
      avisos.push("O CNPJ impresso no emitente difere do CNPJ da chave de acesso; foi usado o da chave.");
      documento = daChave.cnpj;
    }
  }

  const destinatarioLido = digitos(lido.destinatario.documento) || null;
  const destinatarioValido = destinatarioLido && documentoValido(destinatarioLido) ? destinatarioLido : null;
  if (destinatarioLido && !destinatarioValido) {
    avisos.push(`O CNPJ/CPF do destinatário lido (${destinatarioLido}) não confere com os dígitos verificadores.`);
  }

  let numero = (lido.numero ?? "").trim();
  if (ehNota && numero) numero = normalizarNumeroNf(numero);
  if (daChave) {
    if (!numero) numero = daChave.numero;
    else if (ehNota && numero !== daChave.numero) {
      avisos.push(`O número lido (${numero}) difere do número da chave de acesso (${daChave.numero}); foi usado o da chave.`);
      numero = daChave.numero;
    }
  }
  if (ehNota && !numero) avisos.push("Número da nota não encontrado — preencha antes de salvar.");

  const dataEmissao = normalizarData(lido.dataEmissao);
  if (lido.dataEmissao && !dataEmissao) avisos.push("A data de emissão lida é inválida — confira.");
  if (!lido.dataEmissao) avisos.push("Data de emissão não encontrada — usada a data de hoje.");
  if (dataEmissao && dataEmissao > hoje) {
    avisos.push("A data de emissão lida está no futuro — confira.");
  }

  const cno = normalizarCno(lido.cno);
  if (lido.cno?.trim() && !cno) avisos.push(`O CNO lido (${lido.cno.trim()}) não tem 12 dígitos e foi ignorado.`);

  // o total da linha manda: o unitário é ajustado e o excedente vira desconto (como no XML)
  const tipoPadrao = TIPO_ITEM_PADRAO[tipoDocumento];
  const itens: ItemLeitura[] = [];
  for (const [i, it] of lido.itens.entries()) {
    const descricao = it.descricao.trim();
    if (!descricao) continue;
    const qtdeLida = it.quantidade && it.quantidade > 0 ? Math.round(it.quantidade * 1000) / 1000 : null;
    const qtde = qtdeLida ?? 1;
    const unitLido = reaisParaCents(it.valorUnitario);
    const descontoLido = reaisParaCents(it.desconto) ?? 0;
    const totalLido = reaisParaCents(it.valorTotal);

    let unitCents: number;
    let descontoCents = descontoLido;
    if (totalLido !== null) {
      const bruto = totalLido + descontoLido;
      const coerente = unitarioCoerente(qtde, unitLido ?? 0, bruto);
      unitCents = coerente.unitCents;
      descontoCents += coerente.ajusteCents;
      if (unitLido !== null && Math.abs(unitCents - unitLido) > Math.max(10, unitLido * 0.01)) {
        avisos.push(
          `Item ${i + 1} (${descricao}): quantidade × unitário não bate com o total da linha; foi mantido o total (${formatarMoeda(totalLido)}).`,
        );
      }
    } else if (unitLido !== null) {
      unitCents = unitLido;
    } else {
      avisos.push(`Item ${i + 1} (${descricao}) sem valor legível — foi deixado de fora.`);
      continue;
    }
    if (qtdeLida === null && it.quantidade !== null) {
      avisos.push(`Item ${i + 1} (${descricao}): quantidade ilegível, considerada 1.`);
    }

    itens.push({
      descricao,
      tipo: it.tipo,
      qtde,
      unidade: (it.unidade?.trim() || "UN").toUpperCase(),
      unitCents,
      descontoCents,
      totalCents: calcularTotalItem(qtde, unitCents, descontoCents),
    });
  }

  const acessorio = (descricao: string, cents: number | null, tipo: TipoItem) => {
    if (cents && cents > 0) {
      itens.push({ descricao, tipo, qtde: 1, unidade: "UN", unitCents: cents, descontoCents: 0, totalCents: cents });
    }
  };
  acessorio("Frete", reaisParaCents(lido.valorFrete), "FRETE");
  acessorio("Impostos e despesas acessórias (IPI, ST, seguro, outras)", reaisParaCents(lido.valorOutrasDespesas), "ENCARGO");

  const descontoGeral = reaisParaCents(lido.descontoGeral) ?? 0;
  if (descontoGeral > 0 && itens.length > 0) {
    const maior = itens.reduce((m, it) => (it.totalCents > m.totalCents ? it : m), itens[0]);
    if (maior.totalCents >= descontoGeral) {
      maior.descontoCents += descontoGeral;
      maior.totalCents = calcularTotalItem(maior.qtde, maior.unitCents, maior.descontoCents);
    }
  }

  const somaItens = itens.reduce((a, it) => a + it.totalCents, 0);
  let totalCents = reaisParaCents(lido.valorTotal) ?? 0;
  if (totalCents <= 0) {
    totalCents = somaItens;
    avisos.push(
      somaItens > 0
        ? "Valor total não encontrado — usada a soma dos itens."
        : "Valor total não encontrado — preencha antes de salvar.",
    );
  }

  if (itens.length === 0 && totalCents > 0) {
    const rotulo = numero ? `${DESCRICAO_TIPO[lido.tipo]} nº ${numero}` : DESCRICAO_TIPO[lido.tipo];
    itens.push({
      descricao: lido.emitente.nome ? `${rotulo} — ${lido.emitente.nome}` : rotulo,
      tipo: tipoPadrao,
      qtde: 1,
      unidade: "UN",
      unitCents: totalCents,
      descontoCents: 0,
      totalCents,
    });
    if (lido.itens.length === 0) avisos.push("Os itens não foram identificados: o valor total entrou como um item único.");
  } else if (somaItens !== totalCents && somaItens > 0) {
    avisos.push(
      `A soma dos itens (${formatarMoeda(somaItens)}) difere do total do documento (${formatarMoeda(totalCents)}) — confira os valores.`,
    );
  }

  // parcelas que não fecham com o total são descartadas: o formulário gera as suas
  const parcelasLidas = lido.parcelas
    .map((p) => ({ vencimento: normalizarData(p.vencimento), valorCents: reaisParaCents(p.valor) }))
    .filter((p): p is { vencimento: string; valorCents: number } => !!p.vencimento && !!p.valorCents);
  let parcelas: LeituraNormalizada["parcelas"] = [];
  if (parcelasLidas.length > 0) {
    const soma = parcelasLidas.reduce((a, p) => a + p.valorCents, 0);
    if (soma === totalCents && parcelasLidas.length === lido.parcelas.length) {
      parcelas = parcelasLidas
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
        .map((p, i) => ({ numero: i + 1, ...p }));
    } else {
      avisos.push("Os vencimentos lidos não fecham com o total — as parcelas foram geradas automaticamente; confira.");
    }
  }

  let formaPagto: FormaPagto;
  if (lido.formaPagamento !== "NAO_INFORMADA") formaPagto = lido.formaPagamento;
  else formaPagto = parcelas.length > 0 || lido.tipo === "BOLETO" ? "BOLETO" : "PIX";

  return {
    ok: true,
    leitura: {
      tipoDocumento,
      descricaoDocumento: DESCRICAO_TIPO[lido.tipo],
      fornecedor: {
        nome: lido.emitente.nome?.trim() || null,
        documento,
        documentoLido: documentoLido ?? documento,
        fone: lido.emitente.telefone?.trim() || null,
      },
      destinatario: {
        nome: lido.destinatario.nome?.trim() || null,
        documento: destinatarioValido,
        documentoLido: destinatarioLido,
      },
      numero,
      serie: lido.serie?.trim() || (daChave ? daChave.serie : null),
      chaveNfe,
      dataEmissao,
      cno,
      totalCents,
      formaPagto,
      itens,
      parcelas,
      avisos,
    },
  };
}
