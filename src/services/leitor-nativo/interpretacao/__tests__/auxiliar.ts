/**
 * Monta um `TextoExtraido` sintético a partir de linhas de texto, como o OCR
 * entregaria: cada palavra com caixa proporcional à posição do caractere
 * (fonte monoespaçada), linhas de cima para baixo.
 */
import type { CodigoLido, Linha, OrigemTexto, Pagina, TextoExtraido } from "../../tipos";

export type OpcoesTexto = {
  /** false: todas as caixas zeradas (origem sem posições úteis) */
  posicoes?: boolean;
  /** true: vãos entre colunas viram um espaço só (texto corrido) */
  colapsar?: boolean;
  confianca?: number | null;
  origem?: OrigemTexto;
  codigos?: CodigoLido[];
};

const LARGURA_CARACTERE = 1 / 150;
const ALTURA_LINHA = 1 / 80;

function linhaSintetica(fonte: string, i: number, opcoes: OpcoesTexto): Linha | null {
  const palavras: Linha["palavras"] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  const comPosicao = opcoes.posicoes !== false;
  const conf = opcoes.confianca === undefined ? 0.95 : opcoes.confianca;
  while ((m = re.exec(fonte))) {
    palavras.push({
      texto: m[0],
      caixa: comPosicao
        ? { x: m.index * LARGURA_CARACTERE, y: i * ALTURA_LINHA, largura: m[0].length * LARGURA_CARACTERE, altura: ALTURA_LINHA * 0.8 }
        : { x: 0, y: 0, largura: 0, altura: 0 },
      confianca: conf,
    });
  }
  if (palavras.length === 0) return null;
  const texto = opcoes.colapsar ? palavras.map((p) => p.texto).join(" ") : fonte.trim();
  const x0 = palavras[0].caixa.x;
  const ultima = palavras[palavras.length - 1].caixa;
  return {
    texto,
    caixa: comPosicao
      ? { x: x0, y: i * ALTURA_LINHA, largura: ultima.x + ultima.largura - x0, altura: ALTURA_LINHA * 0.8 }
      : { x: 0, y: 0, largura: 0, altura: 0 },
    palavras,
    confianca: conf,
  };
}

/** Texto em várias páginas: cada elemento de `paginas` é um bloco com linhas separadas por "\n". */
export function montarTexto(paginas: string | string[], opcoes: OpcoesTexto = {}): TextoExtraido {
  const blocos = Array.isArray(paginas) ? paginas : [paginas];
  const ps: Pagina[] = blocos.map((bloco, n) => ({
    numero: n + 1,
    linhas: bloco
      .split("\n")
      .map((l, i) => linhaSintetica(l, i, opcoes))
      .filter((l): l is Linha => l !== null),
  }));
  return {
    origem: opcoes.origem ?? "ocr-local",
    paginas: ps,
    codigos: opcoes.codigos ?? [],
    confiancaMedia: opcoes.confianca === undefined ? 0.95 : opcoes.confianca,
  };
}
