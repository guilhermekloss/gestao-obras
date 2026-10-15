/**
 * Montagem das linhas visuais a partir de palavras soltas com posição.
 *
 * As três origens (camada de texto do PDF, Tesseract e Cloud Vision) passam
 * por aqui, para que a interpretação veja sempre o mesmo formato:
 *
 * - palavras na mesma altura viram uma linha, da esquerda para a direita;
 * - foto torta: a inclinação da página (informada pela origem ou estimada
 *   pelos pares de palavras vizinhas) é descontada antes de agrupar. Sem
 *   isso, numa foto a 3° o valor alinhado à direita de um item "sobe" para
 *   a linha de cima (2400 px × tan 3° ≈ 125 px, umas 4 linhas);
 * - o agrupamento é por **sobreposição vertical** com a última palavra da
 *   linha (encadeado), o que ainda absorve o resto de inclinação;
 * - pedaços colados (vão quase zero, comum no PDF quando a fonte muda no
 *   meio do número, ex.: "1.396" + ",00") viram uma palavra só;
 * - vão normal entre palavras = um espaço; vão grande (coluna de tabela,
 *   rótulo à esquerda e valor à direita) = dois espaços. A interpretação
 *   separa colunas com `/\s{2,}/`.
 *
 * "Vão grande" é relativo ao espaço típico da própria página, medido em
 * alturas de palavra: no PDF o espaço é ~0,3 da altura da fonte, mas no OCR
 * as caixas variam com a fonte e a foto (medido: mediana de 0,5 a 1,0 da
 * altura nas imagens de teste). Um limiar fixo ou junta colunas no PDF ou
 * separa palavras comuns na foto.
 *
 * As caixas devolvidas são as originais (sem a correção de inclinação),
 * normalizadas 0..1. Tudo puro e testado (`__tests__/linhas.test.ts`).
 */
import type { Caixa, Linha, Pagina, Palavra } from "../tipos";

/** Palavra em coordenadas absolutas da página (pixels ou pontos), origem no canto superior esquerdo. */
export type PalavraBruta = {
  texto: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0..1; null quando a origem não informa */
  confianca: number | null;
};

/** Sobreposição vertical mínima (fração da menor altura) para duas palavras estarem na mesma linha. */
export const SOBREPOSICAO_MINIMA = 0.5;
/** Vão (fração da altura mediana da linha) abaixo do qual dois pedaços são a mesma palavra. */
export const VAO_COLADO = 0.1;
/** Limiar de coluna = `FATOR_COLUNA` × espaço típico da página, limitado a [mín, máx] (em alturas). */
export const FATOR_COLUNA = 2.5;
export const VAO_COLUNA_MIN = 0.8;
export const VAO_COLUNA_MAX = 2.5;
/** Sem vãos suficientes para medir o espaço típico, usa este limiar. */
export const VAO_COLUNA_PADRAO = 1.2;
/** Quanto uma palavra pode começar antes do fim da anterior (bbox de OCR se sobrepõe um pouco). */
const RECUO_TOLERADO = 0.3;
/** Inclinação máxima corrigida (tan 10°); acima disso a estimativa é tratada como ruído. */
const INCLINACAO_MAXIMA = Math.tan((10 * Math.PI) / 180);

/** Palavra durante a montagem: `y0/y1` já sem a inclinação; `orig` guarda a caixa original. */
type PalavraInterna = { texto: string; x0: number; x1: number; y0: number; y1: number; orig: PalavraBruta };

type LinhaEmMontagem = {
  palavras: PalavraInterna[];
  /** palavra de referência para a altura (a última "alta", ignorando pontuação miúda) */
  ref: PalavraInterna;
  /** maior altura vista na linha */
  alturaMax: number;
};

const altura = (p: { y0: number; y1: number }) => Math.max(p.y1 - p.y0, 1e-6);
const centroY = (p: { y0: number; y1: number }) => (p.y0 + p.y1) / 2;
const centroX = (p: { x0: number; x1: number }) => (p.x0 + p.x1) / 2;

function sobreposicaoVertical(a: { y0: number; y1: number }, b: { y0: number; y1: number }): number {
  const inter = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return inter / Math.min(altura(a), altura(b));
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function percentil(valores: number[], p: number): number {
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.floor(p * (v.length - 1))];
}

/** Média da confiança ponderada pelo número de caracteres; null se ninguém informou. */
function mediaPonderada(itens: { texto: string; confianca: number | null }[]): number | null {
  let soma = 0;
  let peso = 0;
  for (const i of itens) {
    if (i.confianca == null) continue;
    const n = i.texto.replace(/\s/g, "").length || 1;
    soma += i.confianca * n;
    peso += n;
  }
  return peso ? soma / peso : null;
}

/**
 * Inclinação da página (dy/dx, positiva quando o texto desce para a
 * direita) estimada pelos pares de palavras vizinhas na mesma linha: para
 * cada palavra, a vizinha mais próxima à direita, de altura parecida e com
 * boa sobreposição vertical. A mediana descarta os pares errados.
 * Devolve 0 com menos de 5 pares.
 */
export function estimarInclinacao(palavras: PalavraBruta[]): number {
  const ps = palavras.filter((p) => p.texto.trim() && p.x1 > p.x0 && p.y1 > p.y0).sort((a, b) => a.x0 - b.x0);
  const inclinacoes: number[] = [];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const hp = altura(p);
    let melhor: PalavraBruta | null = null;
    for (let j = i + 1; j < ps.length; j++) {
      const q = ps[j];
      if (q.x0 - p.x1 > 2 * hp) break; // ordenadas por x0: as próximas estão ainda mais longe
      if (q.x0 < p.x1 - RECUO_TOLERADO * hp) continue;
      const razao = altura(q) / hp;
      if (razao < 0.67 || razao > 1.5) continue;
      if (sobreposicaoVertical(p, q) < SOBREPOSICAO_MINIMA) continue;
      if (!melhor || q.x0 < melhor.x0) melhor = q;
    }
    if (melhor) {
      const dx = centroX(melhor) - centroX(p);
      if (dx > 0) inclinacoes.push((centroY(melhor) - centroY(p)) / dx);
    }
  }
  if (inclinacoes.length < 5) return 0;
  return mediana(inclinacoes);
}

/** Junta pedaços colados (vão quase zero) numa palavra só. */
function juntarColadas(palavras: PalavraInterna[], alturaMed: number): PalavraInterna[] {
  const saida: PalavraInterna[] = [];
  for (const p of palavras) {
    const ant = saida[saida.length - 1];
    if (ant && p.x0 - ant.x1 <= VAO_COLADO * alturaMed) {
      const orig: PalavraBruta = {
        texto: ant.orig.texto + p.orig.texto,
        x0: Math.min(ant.orig.x0, p.orig.x0),
        y0: Math.min(ant.orig.y0, p.orig.y0),
        x1: Math.max(ant.orig.x1, p.orig.x1),
        y1: Math.max(ant.orig.y1, p.orig.y1),
        confianca: mediaPonderada([ant.orig, p.orig]),
      };
      saida[saida.length - 1] = {
        texto: orig.texto,
        x0: Math.min(ant.x0, p.x0),
        x1: Math.max(ant.x1, p.x1),
        y0: Math.min(ant.y0, p.y0),
        y1: Math.max(ant.y1, p.y1),
        orig,
      };
    } else {
      saida.push(p);
    }
  }
  return saida;
}

/**
 * Limiar de vão de coluna (em alturas de palavra) a partir dos vãos entre
 * palavras vizinhas da página, também em alturas. Usa o percentil 30 como
 * "espaço típico": mesmo numa tabela com muitas colunas, a maioria dos vãos
 * é espaço comum dentro de descrições e rótulos.
 */
export function limiarColuna(vaos: number[]): number {
  if (vaos.length < 8) return VAO_COLUNA_PADRAO;
  const tipico = percentil(vaos, 0.3);
  return Math.min(VAO_COLUNA_MAX, Math.max(VAO_COLUNA_MIN, FATOR_COLUNA * tipico));
}

function normalizar(x0: number, y0: number, x1: number, y1: number, largura: number, alturaPag: number): Caixa {
  const lim = (v: number) => Math.min(1, Math.max(0, v));
  const L = largura > 0 ? largura : 1;
  const A = alturaPag > 0 ? alturaPag : 1;
  const nx0 = lim(x0 / L);
  const ny0 = lim(y0 / A);
  return { x: nx0, y: ny0, largura: lim(x1 / L) - nx0, altura: lim(y1 / A) - ny0 };
}

/** Desconta a inclinação `s` (dy/dx): sobe/desce a caixa conforme o x e tira a altura "extra" da rotação. */
function endireitar(p: PalavraBruta, s: number): PalavraInterna {
  const deslocamento = s * centroX(p);
  const hCaixa = p.y1 - p.y0;
  // caixa alinhada aos eixos de uma palavra girada: altura ≈ h + largura × |tan θ|
  const h = Math.max(hCaixa * 0.4, hCaixa - (p.x1 - p.x0) * Math.abs(s));
  const c = centroY(p) - deslocamento;
  return { texto: p.texto, x0: p.x0, x1: p.x1, y0: c - h / 2, y1: c + h / 2, orig: p };
}

export type OpcoesLinhas = {
  /** inclinação conhecida (dy/dx); sem ela, é estimada pelas palavras. PDF passa 0. */
  inclinacao?: number;
};

/**
 * Agrupa as palavras da página em linhas visuais (de cima para baixo), com
 * coordenadas normalizadas 0..1 pela largura/altura da página.
 */
export function montarLinhas(
  palavrasEntrada: PalavraBruta[],
  largura: number,
  alturaPag: number,
  opcoes: OpcoesLinhas = {},
): Linha[] {
  const validas = palavrasEntrada
    .map((p) => ({ ...p, texto: p.texto.trim() }))
    .filter((p) => p.texto && p.x1 >= p.x0 && p.y1 >= p.y0);

  let s = opcoes.inclinacao ?? estimarInclinacao(validas);
  if (!Number.isFinite(s) || Math.abs(s) > INCLINACAO_MAXIMA || Math.abs(s) < 0.002) s = 0;

  const palavras = validas.map((p) => endireitar(p, s)).sort((a, b) => a.x0 - b.x0 || centroY(a) - centroY(b));

  const linhas: LinhaEmMontagem[] = [];
  for (const p of palavras) {
    let melhor: LinhaEmMontagem | null = null;
    let melhorDist = Infinity;
    for (const l of linhas) {
      const ult = l.palavras[l.palavras.length - 1];
      // a palavra precisa começar depois (ou quase) do fim da última da linha
      if (p.x0 < ult.x1 - RECUO_TOLERADO * Math.min(altura(p), altura(ult))) continue;
      if (sobreposicaoVertical(p, l.ref) < SOBREPOSICAO_MINIMA) continue;
      const dist = Math.abs(centroY(p) - centroY(l.ref));
      if (dist < melhorDist) {
        melhor = l;
        melhorDist = dist;
      }
    }
    if (melhor) {
      melhor.palavras.push(p);
      melhor.alturaMax = Math.max(melhor.alturaMax, altura(p));
      // pontuação miúda ("." "," "-") não serve de referência de altura
      if (altura(p) >= 0.5 * melhor.alturaMax) melhor.ref = p;
    } else {
      linhas.push({ palavras: [p], ref: p, alturaMax: altura(p) });
    }
  }

  const preparadas = linhas.map((l) => {
    const alturaMed = mediana(l.palavras.map(altura));
    return { alturaMed, unidas: juntarColadas(l.palavras, alturaMed) };
  });
  const vaos = preparadas.flatMap(({ alturaMed, unidas }) =>
    unidas.slice(1).map((p, i) => (p.x0 - unidas[i].x1) / alturaMed),
  );
  const limiar = limiarColuna(vaos);

  const resultado = preparadas.map(({ alturaMed, unidas }) => {
    let texto = "";
    unidas.forEach((p, i) => {
      if (i > 0) texto += p.x0 - unidas[i - 1].x1 > limiar * alturaMed ? "  " : " ";
      texto += p.texto;
    });
    const orig = unidas.map((p) => p.orig);
    const x0 = Math.min(...orig.map((p) => p.x0));
    const y0 = Math.min(...orig.map((p) => p.y0));
    const x1 = Math.max(...orig.map((p) => p.x1));
    const y1 = Math.max(...orig.map((p) => p.y1));
    const ordem = unidas.reduce((soma, p) => soma + centroY(p), 0) / unidas.length;
    const linha: Linha = {
      texto,
      caixa: normalizar(x0, y0, x1, y1, largura, alturaPag),
      palavras: orig.map(
        (p): Palavra => ({
          texto: p.texto,
          caixa: normalizar(p.x0, p.y0, p.x1, p.y1, largura, alturaPag),
          confianca: p.confianca,
        }),
      ),
      confianca: mediaPonderada(orig),
    };
    return { linha, ordem, x0: unidas[0].x0 };
  });

  return resultado.sort((a, b) => a.ordem - b.ordem || a.x0 - b.x0).map((r) => r.linha);
}

/** Média da confiança de todas as palavras (ponderada por caracteres); null para PDF com texto. */
export function confiancaMedia(paginas: Pagina[]): number | null {
  return mediaPonderada(paginas.flatMap((p) => p.linhas.flatMap((l) => l.palavras)));
}

/** Quantidade de caracteres visíveis (sem espaços) — para decidir se há texto de verdade. */
export function caracteresUteis(paginas: Pagina[]): number {
  return paginas.reduce(
    (s, p) => s + p.linhas.reduce((t, l) => t + l.texto.replace(/\s/g, "").length, 0),
    0,
  );
}
