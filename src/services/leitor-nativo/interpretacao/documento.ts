/**
 * Visão do `TextoExtraido` usada pelos intérpretes: linhas de todas as
 * páginas em ordem de leitura, com texto normalizado (maiúsculas sem
 * acento, mesmos índices do original), tokens com posição horizontal e
 * células (trechos separados por um vão grande — 2+ espaços no texto).
 */
import type { CodigoLido, OrigemTexto, TextoExtraido } from "../tipos";
import { normalizarTexto } from "./normalizacao";

export type Token = {
  texto: string;
  /** posição (caracteres) no texto da linha */
  inicio: number;
  fim: number;
  /** posição horizontal real na página (0..1), quando a origem informa */
  x0: number | null;
  x1: number | null;
  /** índice da célula (trecho entre vãos grandes) */
  celula: number;
};

export type LinhaDoc = {
  /** índice global (todas as páginas) */
  indice: number;
  pagina: number;
  texto: string;
  /** maiúsculas sem acento, mesmo comprimento de `texto` */
  norm: string;
  tokens: Token[];
  /** true quando os tokens têm posição real */
  comPosicao: boolean;
  y: number | null;
  confianca: number | null;
};

export type Doc = {
  linhas: LinhaDoc[];
  codigos: CodigoLido[];
  origem: OrigemTexto;
  confiancaMedia: number | null;
  /** maioria das linhas com posição real */
  comPosicoes: boolean;
  /** todas as linhas unidas por "\n" (original e normalizado) */
  textoCompleto: string;
  normCompleto: string;
  /** última página presente */
  paginas: number;
};

function tokenizar(texto: string): Omit<Token, "x0" | "x1">[] {
  const r: Omit<Token, "x0" | "x1">[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let celula = 0;
  let fimAnterior = -1;
  while ((m = re.exec(texto))) {
    if (fimAnterior >= 0 && m.index - fimAnterior >= 2) celula++;
    r.push({
      texto: m[0],
      inicio: m.index,
      fim: m.index + m[0].length,
      celula,
    });
    fimAnterior = m.index + m[0].length;
  }
  return r;
}

export function construirDoc(entrada: TextoExtraido): Doc {
  const linhas: LinhaDoc[] = [];
  for (const pagina of entrada.paginas) {
    for (const linha of pagina.linhas) {
      // tira espaços das pontas e caracteres de controle, preservando os vãos internos
      const texto = linha.texto
        .replace(/[\u0000-\u001f]/g, " ")
        .replace(/\s+$/, "")
        .replace(/^\s+/, "");
      if (!texto) continue;
      const base = tokenizar(texto);
      const palavras = linha.palavras ?? [];
      const posicoesReais =
        palavras.length === base.length &&
        palavras.length > 0 &&
        palavras.every((p) => p.caixa && p.caixa.largura > 0) &&
        (palavras.length < 2 || palavras.some((p) => p.caixa.x !== palavras[0].caixa.x));
      const tokens: Token[] = base.map((t, i) => ({
        ...t,
        x0: posicoesReais ? palavras[i].caixa.x : null,
        x1: posicoesReais ? palavras[i].caixa.x + palavras[i].caixa.largura : null,
      }));
      linhas.push({
        indice: linhas.length,
        pagina: pagina.numero,
        texto,
        norm: normalizarTexto(texto),
        tokens,
        comPosicao: posicoesReais,
        y: linha.caixa && (linha.caixa.altura > 0 || linha.caixa.y > 0) ? linha.caixa.y : null,
        confianca: linha.confianca,
      });
    }
  }
  const textoCompleto = linhas.map((l) => l.texto).join("\n");
  return {
    linhas,
    codigos: entrada.codigos ?? [],
    origem: entrada.origem,
    confiancaMedia: entrada.confiancaMedia,
    comPosicoes: linhas.length > 0 && linhas.filter((l) => l.comPosicao).length >= linhas.length * 0.6,
    textoCompleto,
    normCompleto: linhas.map((l) => l.norm).join("\n"),
    paginas: entrada.paginas.reduce((m, p) => Math.max(m, p.numero), 0),
  };
}

/** Índice da primeira linha (a partir de `desde`) cujo texto normalizado casa o padrão; -1 se nenhuma. */
export function acharLinha(doc: Doc, padrao: RegExp, desde = 0, ate = doc.linhas.length): number {
  for (let i = Math.max(0, desde); i < Math.min(ate, doc.linhas.length); i++) {
    if (padrao.test(doc.linhas[i].norm)) return i;
  }
  return -1;
}

/** Texto das linhas [de, ate) unido por "\n". */
export function textoDasLinhas(doc: Doc, de: number, ate: number): string {
  return doc.linhas
    .slice(Math.max(0, de), Math.max(0, ate))
    .map((l) => l.texto)
    .join("\n");
}

/** Faixa de linhas [de, ate). */
export type Faixa = { de: number; ate: number };
