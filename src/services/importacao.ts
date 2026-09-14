/**
 * Parsing das planilhas históricas exportadas em CSV.
 *
 * Formato esperado (colunas por nome, sem distinção de maiúsculas/acentos):
 *
 * CSV de itens (planilha "quantitativo"):
 *   fornecedor; cnpj; nf; data; descricao; tipo; qtde; unidade; unitario; desconto
 *   + uma coluna por obra com o CÓDIGO da obra (ex.: L01, L03, L19) contendo a
 *     fração destinada (percentual, quantidade ou flag 1) — normalizada pela soma da linha.
 *
 * CSV financeiro (planilha "notas fiscais"):
 *   fornecedor; cnpj; nf; data; valor_total; forma
 *   + parcela1_valor; parcela1_venc; parcela1_pagoem; ... até parcela6_*
 *
 * Datas em dd/mm/aaaa; valores em formato BR (1.234,56).
 */
import { BP_TOTAL, custoRateado, distribuirBpPorPeso } from "./rateio";

export type ItemImportado = {
  descricao: string;
  tipo: "MATERIAL" | "SERVICO" | "FRETE" | "ENCARGO";
  qtde: number;
  unidade: string;
  unitCents: number;
  descontoCents: number;
  totalCents: number;
};

export type RateioImportado = { codigoObra: string; fracaoBp: number };

export type ParcelaImportada = {
  numero: number;
  valorCents: number;
  vencimento: Date;
  pagaEm: Date | null;
};

export type NotaImportada = {
  fornecedor: string;
  cnpj: string | null;
  numero: string;
  dataCompra: Date;
  totalCents: number;
  formaPagto: "PIX" | "CARTAO" | "DEBITO" | "BOLETO";
  itens: ItemImportado[];
  /**
   * Rateio da nota inteira (o app não modela rateio por item — ver README
   * §Pendências conscientes). Quando os itens da planilha original traziam
   * pesos diferentes por linha, é a média ponderada pelo total de cada item:
   * matematicamente idêntica à soma dos custos por obra que os pesos por
   * item produziriam, então nenhum valor de custo por obra muda.
   */
  rateios: RateioImportado[];
  parcelas: ParcelaImportada[];
};

export type ResultadoImportacao = {
  notas: NotaImportada[];
  inconsistencias: string[];
};

/** Parser CSV simples com suporte a campos entre aspas e detecção de ; ou , */
export function parseCsv(texto: string): Record<string, string>[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];

  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";

  function splitLinha(linha: string): string[] {
    const campos: string[] = [];
    let atual = "";
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') {
        if (dentroAspas && linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else dentroAspas = !dentroAspas;
      } else if (ch === sep && !dentroAspas) {
        campos.push(atual);
        atual = "";
      } else atual += ch;
    }
    campos.push(atual);
    return campos.map((c) => c.trim());
  }

  const cabecalho = splitLinha(linhas[0]).map(normalizarChave);
  return linhas.slice(1).map((linha) => {
    const valores = splitLinha(linha);
    const row: Record<string, string> = {};
    cabecalho.forEach((chave, i) => {
      row[chave] = valores[i] ?? "";
    });
    return row;
  });
}

export function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function parseValorBr(s: string): number {
  if (!s?.trim()) return 0;
  const limpo = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(limpo);
  return Number.isNaN(v) ? 0 : Math.round(v * 100);
}

export function parseDataBr(s: string): Date | null {
  const m = s?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
  const d = new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TIPOS_MAP: Record<string, ItemImportado["tipo"]> = {
  material: "MATERIAL",
  servico: "SERVICO",
  mo: "SERVICO",
  frete: "FRETE",
  encargo: "ENCARGO",
  inss: "ENCARGO",
};

const FORMAS_MAP: Record<string, NotaImportada["formaPagto"]> = {
  pix: "PIX",
  cartao: "CARTAO",
  credito: "CARTAO",
  debito: "DEBITO",
  boleto: "BOLETO",
};

function chaveNota(fornecedor: string, nf: string): string {
  return `${normalizarChave(fornecedor)}::${nf.trim()}`;
}

/**
 * Combina os dois CSVs em notas completas (itens + rateios + parcelas),
 * relatando inconsistências sem interromper a importação.
 */
export function importarPlanilhas(
  csvItens: string,
  csvFinanceiro: string,
  codigosObras: string[],
): ResultadoImportacao {
  const inconsistencias: string[] = [];
  const rowsItens = parseCsv(csvItens);
  const rowsFin = parseCsv(csvFinanceiro);
  const colunasObras = codigosObras.map((c) => ({ codigo: c, chave: normalizarChave(c) }));

  // 1) Notas a partir do financeiro
  const notas = new Map<string, NotaImportada>();
  rowsFin.forEach((row, idx) => {
    const linha = idx + 2;
    const fornecedor = row.fornecedor?.trim();
    const nf = row.nf?.trim();
    if (!fornecedor || !nf) {
      inconsistencias.push(`Financeiro linha ${linha}: fornecedor ou nf ausente — ignorada`);
      return;
    }
    const data = parseDataBr(row.data);
    if (!data) {
      inconsistencias.push(`Financeiro linha ${linha} (${fornecedor} NF ${nf}): data inválida "${row.data}" — ignorada`);
      return;
    }
    const totalCents = parseValorBr(row.valor_total);
    const forma = FORMAS_MAP[normalizarChave(row.forma ?? "")] ?? null;
    if (!forma) {
      inconsistencias.push(`Financeiro linha ${linha} (${fornecedor} NF ${nf}): forma de pagamento "${row.forma}" não reconhecida — usando PIX`);
    }

    const parcelas: ParcelaImportada[] = [];
    for (let n = 1; n <= 6; n++) {
      const valor = parseValorBr(row[`parcela${n}_valor`] ?? "");
      if (valor === 0) continue;
      const venc = parseDataBr(row[`parcela${n}_venc`] ?? "");
      if (!venc) {
        inconsistencias.push(`Financeiro linha ${linha} (${fornecedor} NF ${nf}): parcela ${n} sem vencimento válido — ignorada`);
        continue;
      }
      parcelas.push({
        numero: parcelas.length + 1,
        valorCents: valor,
        vencimento: venc,
        pagaEm: parseDataBr(row[`parcela${n}_pagoem`] ?? ""),
      });
    }
    if (parcelas.length === 0) {
      parcelas.push({ numero: 1, valorCents: totalCents, vencimento: data, pagaEm: null });
      inconsistencias.push(`Financeiro linha ${linha} (${fornecedor} NF ${nf}): sem parcelas — criada parcela única no valor total`);
    }
    const somaParcelas = parcelas.reduce((a, p) => a + p.valorCents, 0);
    if (somaParcelas !== totalCents) {
      inconsistencias.push(
        `${fornecedor} NF ${nf}: soma das parcelas (${(somaParcelas / 100).toFixed(2)}) difere do total (${(totalCents / 100).toFixed(2)}) — o "comparador FALSO" da planilha`,
      );
    }

    notas.set(chaveNota(fornecedor, nf), {
      fornecedor,
      cnpj: row.cnpj?.trim() || null,
      numero: nf,
      dataCompra: data,
      totalCents,
      formaPagto: forma ?? "PIX",
      itens: [],
      rateios: [],
      parcelas,
    });
  });

  // 2) Itens com rateio pelas colunas de obra. O rateio de cada linha é
  // acumulado por nota (em centavos, por obra) para virar o rateio único da
  // nota no passo 3 — ver o comentário em `NotaImportada.rateios`.
  const centsPorObraPorNota = new Map<string, Map<string, number>>();

  rowsItens.forEach((row, idx) => {
    const linha = idx + 2;
    const fornecedor = row.fornecedor?.trim();
    const nf = row.nf?.trim();
    if (!fornecedor || !nf || !row.descricao?.trim()) {
      inconsistencias.push(`Itens linha ${linha}: fornecedor, nf ou descrição ausente — ignorada`);
      return;
    }

    const chave = chaveNota(fornecedor, nf);
    let nota = notas.get(chave);
    if (!nota) {
      // NF só existe na planilha de itens — cria com dados mínimos
      const data = parseDataBr(row.data) ?? new Date();
      nota = {
        fornecedor,
        cnpj: row.cnpj?.trim() || null,
        numero: nf,
        dataCompra: data,
        totalCents: 0,
        formaPagto: "PIX",
        itens: [],
        rateios: [],
        parcelas: [],
      };
      notas.set(chave, nota);
      inconsistencias.push(`${fornecedor} NF ${nf}: presente nos itens mas ausente no financeiro — criada sem parcelas`);
    }

    const pesos = colunasObras
      .map((o) => ({ codigo: o.codigo, peso: parseValorBr(row[o.chave] ?? "") }))
      .filter((o) => o.peso > 0);
    let rateiosLinha: RateioImportado[];
    if (pesos.length === 0) {
      inconsistencias.push(`Itens linha ${linha} (${fornecedor} NF ${nf}): sem rateio de obra — atribuído 100% a ${codigosObras[0]}`);
      rateiosLinha = [{ codigoObra: codigosObras[0], fracaoBp: BP_TOTAL }];
    } else {
      const fracoes = distribuirBpPorPeso(pesos.map((o) => o.peso));
      rateiosLinha = pesos.map((o, i) => ({ codigoObra: o.codigo, fracaoBp: fracoes[i] }));
    }

    const qtde = parseValorBr(row.qtde) / 100 || 1;
    const unitCents = parseValorBr(row.unitario);
    const descontoCents = parseValorBr(row.desconto);
    const totalCentsItem = Math.round(qtde * unitCents) - descontoCents;
    nota.itens.push({
      descricao: row.descricao.trim(),
      tipo: TIPOS_MAP[normalizarChave(row.tipo ?? "")] ?? "MATERIAL",
      qtde,
      unidade: row.unidade?.trim() || "PC",
      unitCents,
      descontoCents,
      totalCents: totalCentsItem,
    });

    let centsPorObra = centsPorObraPorNota.get(chave);
    if (!centsPorObra) centsPorObraPorNota.set(chave, (centsPorObra = new Map()));
    for (const r of rateiosLinha) {
      const centsAlocados = custoRateado(totalCentsItem, r.fracaoBp);
      centsPorObra.set(r.codigoObra, (centsPorObra.get(r.codigoObra) ?? 0) + centsAlocados);
    }
  });

  // 3) Rateio único por nota (média ponderada pelo total dos itens), notas
  // sem itens e divergências total × itens
  for (const [chave, nota] of notas) {
    if (nota.itens.length === 0) {
      inconsistencias.push(`${nota.fornecedor} NF ${nota.numero}: sem itens na planilha de quantitativo`);
      nota.rateios = [{ codigoObra: codigosObras[0], fracaoBp: BP_TOTAL }];
      continue;
    }
    if (nota.totalCents === 0) {
      nota.totalCents = nota.itens.reduce((a, i) => a + i.totalCents, 0);
    } else {
      const somaItens = nota.itens.reduce((a, i) => a + i.totalCents, 0);
      if (somaItens !== nota.totalCents) {
        inconsistencias.push(
          `${nota.fornecedor} NF ${nota.numero}: soma dos itens (${(somaItens / 100).toFixed(2)}) difere do total da nota (${(nota.totalCents / 100).toFixed(2)})`,
        );
      }
    }

    const centsPorObra = centsPorObraPorNota.get(chave);
    const totalAlocado = centsPorObra ? [...centsPorObra.values()].reduce((a, b) => a + b, 0) : 0;
    if (!centsPorObra || totalAlocado === 0) {
      nota.rateios = [{ codigoObra: codigosObras[0], fracaoBp: BP_TOTAL }];
      continue;
    }
    const entradas = [...centsPorObra.entries()];
    const fracoes = distribuirBpPorPeso(entradas.map(([, cents]) => cents));
    nota.rateios = entradas.map(([codigoObra], i) => ({ codigoObra, fracaoBp: fracoes[i] }));
  }

  return { notas: [...notas.values()], inconsistencias };
}
