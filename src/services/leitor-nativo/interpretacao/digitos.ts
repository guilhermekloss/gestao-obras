import { CONFUSAO_OCR } from "./normalizacao";

export function limparAlfanumerico(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function somenteDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// CNPJ alfanumérico (IN RFB 2.229/2024): valor = charCode − 48 ("0" = 0, "A" = 17).
function valorCaractere(c: string): number {
  return c.charCodeAt(0) - 48;
}

// Pesos 2..9 da direita; resto < 2 → 0 (CNPJ e chave NF-e).
function dvModulo11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valorCaractere(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function dvsCnpj(base12: string): string {
  const dv1 = dvModulo11(base12);
  const dv2 = dvModulo11(base12 + dv1);
  return `${dv1}${dv2}`;
}

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

// Chave NF-e/NFC-e (44): cUF+AAMM numéricos, CNPJ pode ser alfanumérico, DV módulo 11.
export function chaveAcessoValida(chave: string | null | undefined): boolean {
  const c = limparAlfanumerico(chave);
  return /^\d{6}[0-9A-Z]{12}\d{26}$/.test(c) && dvModulo11(c.slice(0, 43)) === Number(c[43]);
}

// NFS-e nacional (50): mesmo módulo 11 sobre as 49 primeiras posições.
export function chaveNfseValida(chave: string | null | undefined): boolean {
  const c = limparAlfanumerico(chave);
  return /^\d{9}[0-9A-Z]{12}\d{29}$/.test(c) && dvModulo11(c.slice(0, 49)) === Number(c[49]);
}

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

// Módulo 10 (FEBRABAN): pesos 2,1,2,1… da direita; soma os algarismos de cada produto.
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

// DV geral do boleto de cobrança: 11 − resto; 0, 10 e 11 viram 1.
export function modulo11Boleto(base: string): number {
  const d = 11 - (somaPesos2a9(base) % 11);
  return d === 0 || d === 10 || d === 11 ? 1 : d;
}

// Módulo 11 da arrecadação: resto 0 ou 1 → 0; senão 11 − resto.
export function modulo11Arrecadacao(base: string): number {
  const resto = somaPesos2a9(base) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

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
        // CNPJ alfanumérico não tem minúscula: é o dígito confundível ou a maiúscula.
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

function escolherVariante(base: string[], ambiguas: number[], valido: (s: string) => boolean): string | null {
  const todas = variantes(base, ambiguas).map((v) => v.replace(/[a-z]/g, (c) => c.toUpperCase()));
  const original = todas[0];
  if (valido(original)) return original;
  const ok = [...new Set(todas.filter(valido))];
  return ok.length === 1 ? ok[0] : null;
}

type DocumentoCorrigido = {
  valor: string;
  valido: boolean;
  corrigido: boolean;
  tipo: "CNPJ" | "CPF" | null;
};

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

// Só na faixa do CNPJ a letra pode ser legítima (CNPJ alfanumérico).
export function corrigirChave(lida: string, tamanho: 44 | 50 = 44): string | null {
  if (lida.length !== tamanho) return null;
  const [ini, fim] = tamanho === 44 ? [6, 18] : [9, 21];
  const prep = prepararSequencia(lida, (i) => i >= ini && i < fim);
  if (!prep) return null;
  const cnpjOk = (c: string) => {
    const cnpj = c.slice(ini, ini + 14);
    return /^\d{14}$/.test(cnpj) || cnpjValido(cnpj);
  };
  const valida = tamanho === 44 ? chaveAcessoValida : chaveNfseValida;
  return escolherVariante(prep.base, prep.ambiguas, (c) => valida(c) && cnpjOk(c));
}

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
