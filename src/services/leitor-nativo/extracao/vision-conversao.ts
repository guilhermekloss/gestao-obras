/**
 * Conversão (pura) da resposta do Cloud Vision `DOCUMENT_TEXT_DETECTION`
 * para o formato do leitor, e das falhas da API para mensagens ao usuário.
 *
 * O `fullTextAnnotation` vem em páginas → blocos → parágrafos → palavras →
 * símbolos. Aproveitamos só as palavras (texto, caixa e confiança) e
 * remontamos as linhas com as mesmas regras do PDF e do Tesseract
 * (`linhas.ts`), para a interpretação ver um formato só.
 *
 * Detalhes do Vision tratados aqui:
 * - o Vision quebra pontuação em "palavras" separadas ("34.567.890", "/",
 *   "0001", "-", "95"); o que separa de verdade é o `detectedBreak` do
 *   último símbolo — sem quebra, a próxima palavra é colada a esta;
 * - imagens vêm com `vertices` em pixels; PDFs (`files:annotate`) com
 *   `normalizedVertices` (0..1). Campos zero são omitidos no JSON;
 * - foto deitada sem EXIF: os vértices seguem a direção do texto, então a
 *   página é girada para o texto ficar na horizontal antes de montar linhas.
 */
import type { Pagina } from "../tipos";
import { montarLinhas, type PalavraBruta } from "./linhas";
import { MSG_OCUPADO } from "./semaforo";

type Vertice = { x?: number; y?: number };
type CaixaVision = { vertices?: Vertice[]; normalizedVertices?: Vertice[] };
type QuebraVision = { type?: string; isPrefix?: boolean };
type SimboloVision = { text?: string; confidence?: number; property?: { detectedBreak?: QuebraVision } };
type PalavraVision = {
  symbols?: SimboloVision[];
  confidence?: number;
  boundingBox?: CaixaVision;
  property?: { detectedBreak?: QuebraVision };
};
type ParagrafoVision = { words?: PalavraVision[] };
type BlocoVision = { paragraphs?: ParagrafoVision[] };
export type PaginaVision = { width?: number; height?: number; blocks?: BlocoVision[]; confidence?: number };

export type ErroStatusVision = { code?: number; message?: string };

/** `AnnotateImageResponse` (o que usamos). */
export type AnotacaoVision = {
  fullTextAnnotation?: { pages?: PaginaVision[]; text?: string };
  error?: ErroStatusVision;
  context?: { pageNumber?: number; uri?: string };
};

/** Resposta de `images:annotate`. */
export type RespostaImagensVision = { responses?: AnotacaoVision[] };
/** Resposta de `files:annotate`. */
export type RespostaArquivosVision = { responses?: { responses?: AnotacaoVision[]; totalPages?: number; error?: ErroStatusVision }[] };

type PalavraOrientada = { texto: string; pontos: { x: number; y: number }[]; confianca: number | null; colaNaProxima: boolean };

function pontos(caixa: CaixaVision | undefined, largura: number, altura: number): { x: number; y: number }[] {
  if (caixa?.normalizedVertices?.length) {
    return caixa.normalizedVertices.map((v) => ({ x: (v.x ?? 0) * largura, y: (v.y ?? 0) * altura }));
  }
  return (caixa?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
}

/** Quadrante da direção do texto (0 = normal, 1 = descendo, 2 = de cabeça para baixo, 3 = subindo). */
function quadrante(p: { x: number; y: number }[]): number | null {
  if (p.length < 2) return null;
  const dx = p[1].x - p[0].x;
  const dy = p[1].y - p[0].y;
  if (!dx && !dy) return null;
  const graus = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (((Math.round(graus / 90) % 4) + 4) % 4) as number;
}

/** Gira um ponto para o texto do quadrante `q` ficar na horizontal (devolve também as novas dimensões). */
function endireitar(q: number, largura: number, altura: number) {
  switch (q) {
    case 1:
      return { f: (x: number, y: number) => ({ x: y, y: largura - x }), largura: altura, altura: largura };
    case 2:
      return { f: (x: number, y: number) => ({ x: largura - x, y: altura - y }), largura, altura };
    case 3:
      return { f: (x: number, y: number) => ({ x: altura - y, y: x }), largura: altura, altura: largura };
    default:
      return { f: (x: number, y: number) => ({ x, y }), largura, altura };
  }
}

function medianaPonderada(medidas: { s: number; peso: number }[]): number | undefined {
  if (medidas.length < 3) return undefined;
  const ordenadas = [...medidas].sort((a, b) => a.s - b.s);
  const total = ordenadas.reduce((t, m) => t + m.peso, 0);
  let acumulado = 0;
  for (const m of ordenadas) {
    acumulado += m.peso;
    if (acumulado >= total / 2) return m.s;
  }
  return undefined;
}

/** Uma página do `fullTextAnnotation` → `Pagina` com linhas montadas. */
export function paginaDoVision(pagina: PaginaVision, numero: number): Pagina {
  // PDF pode vir sem dimensões; 1×1 mantém as coordenadas normalizadas
  const largura = pagina.width || 1;
  const altura = pagina.height || 1;

  const orientadas: PalavraOrientada[] = [];
  for (const bloco of pagina.blocks ?? [])
    for (const paragrafo of bloco.paragraphs ?? []) {
      const palavras = paragrafo.words ?? [];
      palavras.forEach((w, i) => {
        const simbolos = w.symbols ?? [];
        const texto = simbolos.map((s) => s.text ?? "").join("");
        if (!texto.trim()) return;
        const quebra = simbolos[simbolos.length - 1]?.property?.detectedBreak ?? w.property?.detectedBreak;
        orientadas.push({
          texto,
          pontos: pontos(w.boundingBox, largura, altura),
          confianca: typeof w.confidence === "number" ? w.confidence : null,
          // sem quebra detectada, a palavra seguinte do mesmo parágrafo é continuação desta
          colaNaProxima: !quebra?.type && i < palavras.length - 1,
        });
      });
    }

  // direção predominante do texto (voto das palavras)
  const votos = [0, 0, 0, 0];
  for (const p of orientadas) {
    const q = quadrante(p.pontos);
    if (q != null) votos[q] += p.texto.length;
  }
  const q = votos.indexOf(Math.max(...votos));
  const giro = endireitar(q, largura, altura);

  const brutas: PalavraBruta[] = [];
  const inclinacoes: { s: number; peso: number }[] = [];
  let pendente: PalavraBruta | null = null;
  let pendentePeso = 0;
  for (const p of orientadas) {
    const pts = p.pontos.map((pt) => giro.f(pt.x, pt.y));
    if (!pts.length) continue;
    // o lado de cima da caixa (vértice 0 → 1) segue a direção do texto: dá a inclinação da página
    if (pts.length >= 2 && pts[1].x - pts[0].x > 0) {
      inclinacoes.push({ s: (pts[1].y - pts[0].y) / (pts[1].x - pts[0].x), peso: pts[1].x - pts[0].x });
    }
    const atual: PalavraBruta = {
      texto: p.texto,
      x0: Math.min(...pts.map((pt) => pt.x)),
      y0: Math.min(...pts.map((pt) => pt.y)),
      x1: Math.max(...pts.map((pt) => pt.x)),
      y1: Math.max(...pts.map((pt) => pt.y)),
      confianca: p.confianca,
    };
    if (pendente) {
      const peso = atual.texto.length;
      const conf: number | null =
        pendente.confianca != null && atual.confianca != null
          ? (pendente.confianca * pendentePeso + atual.confianca * peso) / (pendentePeso + peso)
          : (pendente.confianca ?? atual.confianca);
      pendente = {
        texto: pendente.texto + atual.texto,
        x0: Math.min(pendente.x0, atual.x0),
        y0: Math.min(pendente.y0, atual.y0),
        x1: Math.max(pendente.x1, atual.x1),
        y1: Math.max(pendente.y1, atual.y1),
        confianca: conf,
      };
      pendentePeso += peso;
    } else {
      pendente = atual;
      pendentePeso = atual.texto.length;
    }
    if (!p.colaNaProxima) {
      brutas.push(pendente);
      pendente = null;
    }
  }
  if (pendente) brutas.push(pendente);

  return {
    numero,
    linhas: montarLinhas(brutas, giro.largura, giro.altura, { inclinacao: medianaPonderada(inclinacoes) }),
  };
}

/**
 * Lista de `AnnotateImageResponse` (uma por imagem ou por página do PDF) →
 * páginas. A página do PDF vem em `context.pageNumber`; imagem é a página 1.
 * Lança `ErroVisionResposta` se alguma resposta trouxer `error`.
 */
export function paginasDoVision(anotacoes: AnotacaoVision[]): Pagina[] {
  const paginas: Pagina[] = [];
  anotacoes.forEach((a, i) => {
    if (a.error?.code) throw new ErroVisionResposta(a.error);
    const numeroBase = a.context?.pageNumber ?? i + 1;
    (a.fullTextAnnotation?.pages ?? []).forEach((p, j) => paginas.push(paginaDoVision(p, numeroBase + j)));
    if (!a.fullTextAnnotation?.pages?.length) paginas.push({ numero: numeroBase, linhas: [] });
  });
  return paginas.sort((a, b) => a.numero - b.numero);
}

/** Respostas de `files:annotate` (PDF) achatadas numa lista de anotações por página. */
export function anotacoesDoArquivo(resposta: RespostaArquivosVision): AnotacaoVision[] {
  return (resposta.responses ?? []).flatMap((r) => {
    if (r.error?.code) throw new ErroVisionResposta(r.error);
    return r.responses ?? [];
  });
}

/** Erro devolvido dentro do corpo (HTTP 200) pelo Vision, com o código google.rpc. */
export class ErroVisionResposta extends Error {
  constructor(readonly status: ErroStatusVision) {
    super(`Cloud Vision: ${status.code} ${status.message ?? ""}`.trim());
    this.name = "ErroVisionResposta";
  }
}

export const MSG_VISION_SEM_CREDENCIAL =
  "Leitura automática indisponível: o servidor não tem credenciais do Google Cloud para o OCR. Preencha os dados manualmente.";
export const MSG_VISION_SEM_PERMISSAO =
  "Leitura automática indisponível: sem permissão para usar o Cloud Vision (API desativada ou conta sem acesso).";
export const MSG_VISION_ARQUIVO = "O arquivo não pôde ser lido (formato ou tamanho não aceito). Tente outra foto ou PDF.";
export const MSG_VISION_CONEXAO = "Sem conexão com o serviço de leitura — tente de novo em instantes.";
export const MSG_VISION_INSTAVEL = "O serviço de leitura está instável — tente de novo em instantes.";

/**
 * Mensagem para o usuário a partir da falha: `http` é o status HTTP (quando
 * houve resposta), `rpc` o código google.rpc de um erro no corpo, `rede` o
 * código de erro do Node (ECONNRESET, ETIMEDOUT...) e `mensagem` o texto
 * técnico (só para reconhecer a falta de credencial).
 */
export function mensagemErroVision(f: { http?: number; rpc?: number; rede?: string; mensagem?: string }): string {
  if (f.mensagem && /default credentials|could not load the default|no credentials/i.test(f.mensagem)) {
    return MSG_VISION_SEM_CREDENCIAL;
  }
  const http = f.http;
  const rpc = f.rpc;
  if (http === 401 || http === 403 || rpc === 7 || rpc === 16) return MSG_VISION_SEM_PERMISSAO;
  if (http === 429 || rpc === 8) return MSG_OCUPADO;
  if (http === 400 || http === 413 || rpc === 3 || rpc === 11) return MSG_VISION_ARQUIVO;
  if ((http && http >= 500) || rpc === 13 || rpc === 14 || rpc === 4) return MSG_VISION_INSTAVEL;
  if (!http && f.rede) return MSG_VISION_CONEXAO;
  return MSG_VISION_INSTAVEL;
}
