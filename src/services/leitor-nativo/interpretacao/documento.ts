import type { CodigoLido, OrigemTexto, TextoExtraido } from "../tipos";
import { normalizarTexto } from "./normalizacao";

export type Token = {
  texto: string;
  inicio: number;
  fim: number;
  x0: number | null;
  x1: number | null;
  celula: number;
};

export type LinhaDoc = {
  indice: number;
  pagina: number;
  texto: string;
  // maiúsculas sem acento, mesmo comprimento de `texto`
  norm: string;
  tokens: Token[];
  comPosicao: boolean;
  y: number | null;
  confianca: number | null;
};

export type Doc = {
  linhas: LinhaDoc[];
  codigos: CodigoLido[];
  origem: OrigemTexto;
  confiancaMedia: number | null;
  comPosicoes: boolean;
  textoCompleto: string;
  normCompleto: string;
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

export function acharLinha(doc: Doc, padrao: RegExp, desde = 0, ate = doc.linhas.length): number {
  for (let i = Math.max(0, desde); i < Math.min(ate, doc.linhas.length); i++) {
    if (padrao.test(doc.linhas[i].norm)) return i;
  }
  return -1;
}

export function textoDasLinhas(doc: Doc, de: number, ate: number): string {
  return doc.linhas
    .slice(Math.max(0, de), Math.max(0, ate))
    .map((l) => l.texto)
    .join("\n");
}

export type Faixa = { de: number; ate: number };
