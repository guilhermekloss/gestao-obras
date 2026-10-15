/**
 * Comparação campo a campo entre o `DocumentoLido` esperado e o lido.
 * Puro: sem E/S, para poder ser testado e reaproveitado.
 */
import type { DocumentoLido } from "@/services/leitura-documento";

export const CAMPOS = [
  "tipo",
  "emitente.documento",
  "emitente.nome",
  "destinatario.documento",
  "numero",
  "chaveAcesso",
  "dataEmissao",
  "valorTotal",
  "valorFrete",
  "valorOutrasDespesas",
  "descontoGeral",
  "formaPagamento",
  "itens.contagem",
  "itens.quantidade",
  "itens.valorTotal",
  "parcelas",
] as const;

export type Campo = (typeof CAMPOS)[number];

export type ResultadoCampo = {
  campo: Campo;
  /** acertos (para itens: itens que conferem; demais: 0 ou 1) */
  acertos: number;
  /** total comparado (para itens: max(nº esperado, nº lido); demais: 1) */
  total: number;
  esperado: unknown;
  lido: unknown;
};

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const cents = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100));
/** null e 0 são equivalentes para frete/outras/desconto ("não há") */
const centsOuZero = (v: number | null | undefined) => cents(v) ?? 0;

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = atual;
  }
  return ant[b.length];
}

/**
 * Nome "parecido": similaridade de Levenshtein ≥ 0,85 sobre o texto normalizado,
 * ou todas as palavras do esperado presentes no lido com no máximo 3 palavras a mais.
 */
function nomeConfere(esperado: string | null, lido: string | null): boolean {
  if (!esperado) return !lido;
  if (!lido) return false;
  const e = normalizarTexto(esperado);
  const l = normalizarTexto(lido);
  if (!e || !l) return e === l;
  const sim = 1 - levenshtein(e, l) / Math.max(e.length, l.length);
  if (sim >= 0.85) return true;
  const pe = e.split(" ");
  const pl = new Set(l.split(" "));
  return pe.every((p) => pl.has(p)) && pl.size <= pe.length + 3;
}

/** Números de nota comparados sem pontuação e sem zeros à esquerda; demais, sem espaços. */
function numeroConfere(esperado: string | null, lido: string | null): boolean {
  const n = (s: string | null) => {
    const t = (s ?? "").replace(/[\s.\-/]/g, "").toUpperCase();
    return /^\d+$/.test(t) ? String(Number(t)) : (s ?? "").replace(/\s+/g, "").toUpperCase();
  };
  return n(esperado) === n(lido);
}

/**
 * Forma de pagamento: igual, ou NAO_INFORMADA ≡ BOLETO quando o documento tem
 * vencimentos (é o que `normalizarLeitura` decide nesse caso).
 */
function formaConfere(esperado: DocumentoLido, lido: DocumentoLido): boolean {
  if (esperado.formaPagamento === lido.formaPagamento) return true;
  const par = new Set([esperado.formaPagamento, lido.formaPagamento]);
  return esperado.parcelas.length > 0 && par.has("NAO_INFORMADA") && par.has("BOLETO");
}

function parcelasNorm(d: DocumentoLido) {
  return d.parcelas
    .map((p) => `${p.vencimento ?? "?"}=${cents(p.valor) ?? "?"}`)
    .sort()
    .join(" ");
}

function um(campo: Campo, ok: boolean, esperado: unknown, lido: unknown): ResultadoCampo {
  return { campo, acertos: ok ? 1 : 0, total: 1, esperado, lido };
}

export function compararDocumento(esperado: DocumentoLido, lido: DocumentoLido | null): ResultadoCampo[] {
  if (!lido) {
    // falha na leitura: tudo conta como erro (itens contam pelo nº esperado)
    return CAMPOS.map((campo) => {
      const n = campo === "itens.quantidade" || campo === "itens.valorTotal" ? Math.max(esperado.itens.length, 1) : 1;
      return { campo, acertos: 0, total: n, esperado: "(ver esperado)", lido: null };
    });
  }
  const r: ResultadoCampo[] = [];
  r.push(um("tipo", esperado.tipo === lido.tipo, esperado.tipo, lido.tipo));
  r.push(
    um(
      "emitente.documento",
      digitos(esperado.emitente.documento) === digitos(lido.emitente.documento),
      esperado.emitente.documento,
      lido.emitente.documento,
    ),
  );
  r.push(um("emitente.nome", nomeConfere(esperado.emitente.nome, lido.emitente.nome), esperado.emitente.nome, lido.emitente.nome));
  r.push(
    um(
      "destinatario.documento",
      digitos(esperado.destinatario.documento) === digitos(lido.destinatario.documento),
      esperado.destinatario.documento,
      lido.destinatario.documento,
    ),
  );
  r.push(um("numero", numeroConfere(esperado.numero, lido.numero), esperado.numero, lido.numero));
  r.push(um("chaveAcesso", digitos(esperado.chaveAcesso) === digitos(lido.chaveAcesso), esperado.chaveAcesso, lido.chaveAcesso));
  r.push(um("dataEmissao", (esperado.dataEmissao ?? null) === (lido.dataEmissao ?? null), esperado.dataEmissao, lido.dataEmissao));
  r.push(um("valorTotal", cents(esperado.valorTotal) === cents(lido.valorTotal), esperado.valorTotal, lido.valorTotal));
  for (const campo of ["valorFrete", "valorOutrasDespesas", "descontoGeral"] as const) {
    r.push(um(campo, centsOuZero(esperado[campo]) === centsOuZero(lido[campo]), esperado[campo], lido[campo]));
  }
  r.push(um("formaPagamento", formaConfere(esperado, lido), esperado.formaPagamento, lido.formaPagamento));

  // itens, casados pela ordem
  r.push(um("itens.contagem", esperado.itens.length === lido.itens.length, esperado.itens.length, lido.itens.length));
  const nE = esperado.itens.length;
  const nL = lido.itens.length;
  const n = Math.max(nE, nL);
  if (n > 0) {
    let okQtd = 0;
    let okTot = 0;
    for (let i = 0; i < Math.min(nE, nL); i++) {
      const e = esperado.itens[i];
      const l = lido.itens[i];
      // quantidade não impressa (null) aceita null ou 1
      const qE = e.quantidade === null ? null : Math.round(e.quantidade * 1000);
      const qL = l.quantidade === null ? null : Math.round(l.quantidade * 1000);
      if (qE === qL || (qE === null && qL === 1000)) okQtd++;
      if (cents(e.valorTotal) === cents(l.valorTotal)) okTot++;
    }
    r.push({ campo: "itens.quantidade", acertos: okQtd, total: n, esperado: nE, lido: nL });
    r.push({ campo: "itens.valorTotal", acertos: okTot, total: n, esperado: nE, lido: nL });
  }
  r.push(um("parcelas", parcelasNorm(esperado) === parcelasNorm(lido), parcelasNorm(esperado), parcelasNorm(lido)));
  return r;
}
