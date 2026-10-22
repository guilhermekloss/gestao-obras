import { duracaoEmDias, ROTULO_SITUACAO, type Dia, type SituacaoEtapa } from "./cronograma";

// CSV do cronograma no formato que o Excel em português abre direto: `;` entre colunas, vírgula decimal,
// BOM UTF-8 (acentos) e datas dd/mm/aaaa.

export type LinhaCsvCronograma = {
  nome: string;
  inicio: Dia | null;
  fim: Dia | null;
  previstoHojeBp: number;
  realizadoBp: number;
  desvioBp: number;
  situacao: SituacaoEtapa;
  linhaBaseInicio: Dia | null;
  linhaBaseFim: Dia | null;
  variacaoFimDias: number | null;
  /** null para quem não vê valores (CAMPO): a coluna nem aparece */
  pesoBp: number | null;
};

const BOM = "﻿";
const SEPARADOR = ";";
const FIM_DE_LINHA = "\r\n";
const NUMERO = /^-?\d+(,\d+)?$/;
// a planilha executa como fórmula o que começa com estes caracteres (tab e CR também, por segurança)
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Uma célula pronta para o CSV. Texto que começa com `= + - @` ganha `'` na frente (não vira fórmula
 * ao abrir na planilha); número negativo ("-8,5") passa como está. Aspas, `;` e quebras de linha vão entre aspas.
 */
export function celulaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor);
  if (INICIO_DE_FORMULA.test(texto) && !NUMERO.test(texto)) texto = `'${texto}`;
  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function dataCsv(dia: Dia | null): string {
  if (!dia) return "";
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

// pontos-base → "45,5" (até 2 casas, vírgula decimal, sem milhar)
function percentualCsv(bp: number): string {
  return (bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false });
}

export function montarCsvCronograma(linhas: LinhaCsvCronograma[], opcoes: { comPeso: boolean }): string {
  const cabecalho = [
    "Etapa",
    "Início",
    "Fim",
    "Duração (dias)",
    "Previsto hoje (%)",
    "Realizado (%)",
    "Desvio (p.p.)",
    "Status",
    "LB início",
    "LB fim",
    "Variação do fim (dias)",
    ...(opcoes.comPeso ? ["Peso (%)"] : []),
  ];

  const corpo = linhas.map((l) => {
    const comDatas = !!l.inicio && !!l.fim && l.fim >= l.inicio;
    return [
      l.nome,
      dataCsv(l.inicio),
      dataCsv(l.fim),
      comDatas ? String(duracaoEmDias(l.inicio!, l.fim!)) : "",
      comDatas ? percentualCsv(l.previstoHojeBp) : "",
      percentualCsv(l.realizadoBp),
      comDatas ? percentualCsv(l.desvioBp) : "",
      ROTULO_SITUACAO[l.situacao],
      dataCsv(l.linhaBaseInicio),
      dataCsv(l.linhaBaseFim),
      l.variacaoFimDias === null ? "" : String(l.variacaoFimDias),
      ...(opcoes.comPeso ? [l.pesoBp === null ? "" : percentualCsv(l.pesoBp)] : []),
    ];
  });

  return (
    BOM +
    [cabecalho, ...corpo].map((linha) => linha.map(celulaCsv).join(SEPARADOR)).join(FIM_DE_LINHA) +
    FIM_DE_LINHA
  );
}

/** Nome do arquivo só com caracteres seguros para o cabeçalho Content-Disposition. */
export function nomeArquivoCsvCronograma(codigoObra: string, hoje: Dia): string {
  const codigo = codigoObra
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "obra";
  return `cronograma-${codigo}-${hoje}.csv`;
}
