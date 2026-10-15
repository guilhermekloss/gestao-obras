/**
 * Dígitos verificadores — o "árbitro" da leitura: um CNPJ, CPF, chave de
 * acesso ou linha digitável só é corrigido quando a correção fecha o DV.
 *
 * Suporta o CNPJ alfanumérico (IN RFB 2.229/2024, em produção desde
 * 31/07/2026): cada caractere vale `charCode − 48` ("0".."9" = 0..9,
 * "A" = 17 ... "Z" = 42), mesmo cálculo módulo 11 do CNPJ numérico. A chave
 * de acesso de 44 posições traz esse CNPJ nas posições 7–18.
 */
import { CONFUSAO_OCR } from "./normalizacao";

/** Só [0-9A-Z], em maiúsculas (mantém as letras do CNPJ alfanumérico). */
export function limparAlfanumerico(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function somenteDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Valor de um caractere no cálculo do DV: charCode − 48. */
function valorCaractere(c: string): number {
  return c.charCodeAt(0) - 48;
}

/** Módulo 11 com pesos 2..9 da direita para a esquerda; resto < 2 → 0 (CNPJ e chave NF-e). */
export function dvModulo11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valorCaractere(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Os dois DVs de um CNPJ (12 primeiros caracteres, numéricos ou alfanuméricos). */
export function dvsCnpj(base12: string): string {
  const dv1 = dvModulo11(base12);
  const dv2 = dvModulo11(base12 + dv1);
  return `${dv1}${dv2}`;
}

/** CNPJ numérico ou alfanumérico: 12 caracteres [0-9A-Z] + 2 DVs numéricos. */
export function cnpjValido(valor: string | null | undefined): boolean {
  const c = limparAlfanumerico(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  return dvsCnpj(c.slice(0, 12)) === c.slice(12);
}

export function cpfValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    const soma = [...base].reduce((acc, c, i) => acc + Number(c) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

export function documentoValido(valor: string | null | undefined): boolean {
  const c = limparAlfanumerico(valor);
  return c.length === 14 ? cnpjValido(c) : c.length === 11 ? cpfValido(c) : false;
}

/** Chave de acesso NF-e/NFC-e (44): cUF+AAMM numéricos, CNPJ possivelmente alfanumérico, DV módulo 11. */
export function chaveAcessoValida(chave: string | null | undefined): boolean {
  const c = limparAlfanumerico(chave);
  return /^\d{6}[0-9A-Z]{12}\d{26}$/.test(c) && dvModulo11(c.slice(0, 43)) === Number(c[43]);
}

/** Chave da NFS-e nacional (50): mesmo módulo 11 sobre as 49 primeiras posições. */
export function chaveNfseValida(chave: string | null | undefined): boolean {
  const c = limparAlfanumerico(chave);
  return /^\d{9}[0-9A-Z]{12}\d{29}$/.test(c) && dvModulo11(c.slice(0, 49)) === Number(c[49]);
}

/** Campos embutidos na chave NF-e/NFC-e. */
export function dadosChaveNfe(chave: string) {
  const c = limparAlfanumerico(chave);
  return {
    uf: c.slice(0, 2),
    ano: 2000 + Number(c.slice(2, 4)),
    mes: Number(c.slice(4, 6)),
    cnpj: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
    tipoEmissao: c.slice(34, 35),
  };
}

/** Campos embutidos na chave da NFS-e nacional. */
export function dadosChaveNfse(chave: string) {
  const c = limparAlfanumerico(chave);
  const tipoInscricao = c.slice(8, 9);
  const inscricao = c.slice(9, 23);
  return {
    municipio: c.slice(0, 7),
    documento: tipoInscricao === "1" ? inscricao.slice(3) : inscricao,
    numero: String(Number(c.slice(23, 36))),
    ano: 2000 + Number(c.slice(36, 38)),
    mes: Number(c.slice(38, 40)),
  };
}

// ---------------------------------------------------------------------------
// Módulos de boleto e arrecadação (FEBRABAN)

/** Módulo 10: pesos 2,1,2,1… da direita; soma os algarismos de cada produto. */
export function modulo10(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    const p = Number(base[i]) * peso;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function somaPesos2a9(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma;
}

/** DV geral do boleto de cobrança: 11 − resto; 0, 10 e 11 viram 1. */
export function modulo11Boleto(base: string): number {
  const d = 11 - (somaPesos2a9(base) % 11);
  return d === 0 || d === 10 || d === 11 ? 1 : d;
}

/** Módulo 11 da arrecadação: resto 0 ou 1 → 0; senão 11 − resto. */
export function modulo11Arrecadacao(base: string): number {
  const resto = somaPesos2a9(base) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// ---------------------------------------------------------------------------
// Correção de OCR guiada pelo DV

/**
 * Gera as variantes de uma sequência trocando, nas posições indicadas como
 * "ambíguas", a letra pelo dígito confundível. Limite de 2^8 variantes.
 */
function variantes(base: string[], ambiguas: number[]): string[] {
  const k = Math.min(ambiguas.length, 8);
  const r: string[] = [];
  for (let mascara = 0; mascara < 1 << k; mascara++) {
    const v = [...base];
    for (let b = 0; b < k; b++) {
      if (mascara & (1 << b)) v[ambiguas[b]] = CONFUSAO_OCR[base[ambiguas[b]]] ?? base[ambiguas[b]];
    }
    r.push(v.join(""));
  }
  return r;
}

/**
 * Prepara uma sequência lida para validação: posições numéricas recebem o
 * dígito confundível; posições alfanuméricas com letra confundível ficam
 * ambíguas (letra de verdade ou dígito mal lido). Minúsculas nunca existem
 * no CNPJ alfanumérico, então viram dígito ou maiúscula.
 */
function prepararSequencia(
  lido: string,
  alfanumerica: (i: number) => boolean,
): { base: string[]; ambiguas: number[] } | null {
  const base: string[] = [];
  const ambiguas: number[] = [];
  for (let i = 0; i < lido.length; i++) {
    const c = lido[i];
    if (/\d/.test(c)) {
      base.push(c);
    } else if (alfanumerica(i)) {
      const maiuscula = c.toUpperCase();
      if (!/[A-Z]/.test(maiuscula)) return null;
      const temDigito = CONFUSAO_OCR[c] ?? CONFUSAO_OCR[maiuscula];
      if (c !== maiuscula) {
        // minúscula: ou é o dígito confundível ou a maiúscula
        base.push(temDigito ? c : maiuscula);
        if (temDigito) ambiguas.push(i);
      } else {
        base.push(c);
        if (temDigito) ambiguas.push(i);
      }
    } else {
      const d = CONFUSAO_OCR[c];
      if (!d) return null;
      base.push(d);
    }
  }
  return { base, ambiguas };
}

/** Escolhe a única variante que passa no validador (ou a original, se já passa). */
function escolherVariante(base: string[], ambiguas: number[], valido: (s: string) => boolean): string | null {
  const todas = variantes(base, ambiguas).map((v) => v.replace(/[a-z]/g, (c) => c.toUpperCase()));
  const original = todas[0];
  if (valido(original)) return original;
  const ok = [...new Set(todas.filter(valido))];
  return ok.length === 1 ? ok[0] : null;
}

export type DocumentoCorrigido = {
  /** sem pontuação; corrigido quando o DV fechou, senão como lido */
  valor: string;
  valido: boolean;
  /** true quando alguma letra foi trocada por dígito para o DV fechar */
  corrigido: boolean;
  tipo: "CNPJ" | "CPF" | null;
};

/**
 * Limpa um CNPJ/CPF lido e, se o DV não fecha, tenta as trocas de OCR
 * (O→0, l→1, S→5…). Só aceita a correção quando ela é a única que valida.
 */
export function corrigirDocumento(lido: string): DocumentoCorrigido {
  const limpo = lido.replace(/[\s.\-–/,]/g, "");
  const comoLido = limparAlfanumerico(limpo);
  if (limpo.length === 14) {
    const prep = prepararSequencia(limpo, (i) => i < 12);
    if (prep) {
      const v = escolherVariante(prep.base, prep.ambiguas, cnpjValido);
      if (v)
        return {
          valor: v,
          valido: true,
          corrigido: v !== comoLido,
          tipo: "CNPJ",
        };
    }
    return { valor: comoLido, valido: false, corrigido: false, tipo: "CNPJ" };
  }
  if (limpo.length === 11) {
    const prep = prepararSequencia(limpo, () => false);
    if (prep) {
      const v = prep.base.join("");
      if (cpfValido(v))
        return {
          valor: v,
          valido: true,
          corrigido: v !== comoLido,
          tipo: "CPF",
        };
    }
    return { valor: comoLido, valido: false, corrigido: false, tipo: "CPF" };
  }
  return { valor: comoLido, valido: false, corrigido: false, tipo: null };
}

/**
 * Corrige uma chave de acesso lida (44 posições, já sem separadores):
 * posições numéricas recebem o dígito confundível; nas do CNPJ (7–18) a
 * letra pode ser legítima. Devolve a chave válida ou null.
 */
export function corrigirChave(lida: string, tamanho: 44 | 50 = 44): string | null {
  if (lida.length !== tamanho) return null;
  const [ini, fim] = tamanho === 44 ? [6, 18] : [9, 21];
  const prep = prepararSequencia(lida, (i) => i >= ini && i < fim);
  if (!prep) return null;
  // com letras na faixa do CNPJ, o CNPJ embutido também precisa fechar o próprio DV
  const cnpjOk = (c: string) => {
    const cnpj = c.slice(ini, ini + 14);
    return /^\d{14}$/.test(cnpj) || cnpjValido(cnpj);
  };
  const valida = tamanho === 44 ? chaveAcessoValida : chaveNfseValida;
  return escolherVariante(prep.base, prep.ambiguas, (c) => valida(c) && cnpjOk(c));
}

// ---------------------------------------------------------------------------
// Localização de CNPJ/CPF no texto

/** Dígito ou letra que o OCR confunde com dígito. */
const C = "[0-9A-Za-z|]";
const PADRAO_CNPJ = new RegExp(
  `(?<![0-9A-Za-z])${C}{2}[.,]?${C}{3}[.,]?${C}{3}\\s?\\/\\s?${C}{4}\\s?[-–]?\\s?${C}{2}(?![0-9A-Za-z])`,
  "g",
);
const N = "[0-9OoQDIl|SsZzBGT]";
const PADRAO_CPF = new RegExp(`(?<![0-9A-Za-z.])${N}{3}\\.${N}{3}\\.${N}{3}\\s?[-–]\\s?${N}{2}(?![0-9A-Za-z/])`, "g");
const PADRAO_NUMERICO = /(?<![\d./-])(\d{14}|\d{11})(?![\d./-])/g;

export type DocumentoEncontrado = DocumentoCorrigido & {
  inicio: number;
  fim: number;
  texto: string;
};

/**
 * CNPJs e CPFs de um trecho de texto, na ordem. CNPJ formatado (com "/")
 * pode ser alfanumérico; sequências de 11/14 dígitos sem pontuação só
 * contam quando `aceitarSemPontuacao` (há rótulo CNPJ/CPF por perto).
 */
export function encontrarDocumentos(texto: string, aceitarSemPontuacao = false): DocumentoEncontrado[] {
  const r: DocumentoEncontrado[] = [];
  const ocupado = (i: number, f: number) => r.some((d) => i < d.fim && f > d.inicio);
  const tentar = (m: RegExpExecArray) => {
    const bruto = m[0];
    const inicio = m.index;
    const fim = inicio + bruto.length;
    if (ocupado(inicio, fim)) return;
    // pelo menos metade dígitos: evita casar palavras com barra
    const alnum = bruto.replace(/[^0-9A-Za-z]/g, "");
    if (alnum.replace(/\D/g, "").length < alnum.length * 0.5) return;
    const doc = corrigirDocumento(bruto);
    if (!doc.tipo) return;
    r.push({ ...doc, inicio, fim, texto: bruto });
  };
  for (const padrao of [PADRAO_CNPJ, PADRAO_CPF]) {
    padrao.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = padrao.exec(texto))) tentar(m);
  }
  if (aceitarSemPontuacao) {
    PADRAO_NUMERICO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PADRAO_NUMERICO.exec(texto))) {
      const doc = corrigirDocumento(m[0]);
      if (doc.valido && !ocupado(m.index, m.index + m[0].length)) {
        r.push({
          ...doc,
          inicio: m.index,
          fim: m.index + m[0].length,
          texto: m[0],
        });
      }
    }
  }
  return r.sort((a, b) => a.inicio - b.inicio);
}
