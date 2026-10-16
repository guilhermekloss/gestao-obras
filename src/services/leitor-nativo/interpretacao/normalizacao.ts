export function normalizarTexto(s: string): string {
  let r = "";
  for (const c of s) {
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const u = (base || c).toUpperCase();
    // mantém 1 caractere por caractere de entrada (índices iguais ao original)
    r += u.length === c.length ? u : c.length === 1 ? (u[0] ?? c) : c;
  }
  return r;
}

export function limparEspacos(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export const CONFUSAO_OCR: Record<string, string> = {
  O: "0",
  o: "0",
  Q: "0",
  D: "0",
  "°": "0",
  I: "1",
  l: "1",
  "|": "1",
  i: "1",
  "!": "1",
  L: "1",
  Z: "2",
  z: "2",
  S: "5",
  s: "5",
  G: "6",
  b: "6",
  T: "7",
  B: "8",
  g: "9",
  q: "9",
};

function proporcaoDigitos(s: string): number {
  const alnum = s.replace(/[^0-9A-Za-z]/g, "");
  if (!alnum) return 0;
  return alnum.replace(/\D/g, "").length / alnum.length;
}

export function corrigirOcrNumerico(token: string, forcar = false): string {
  if (!forcar && proporcaoDigitos(token) < 0.6) return token;
  let r = "";
  for (const c of token) r += /[0-9]/.test(c) ? c : (CONFUSAO_OCR[c] ?? c);
  return r;
}

const K = "[0-9OoDIl|SZB]";
const PREFIXO_RS = "(?:R\\s?[$S5]\\.?\\s?)";

// "R$1 234,56": milhar com espaço só depois de R$; não casa "20,0000" nem "5,00%".
const PADRAO_DINHEIRO = new RegExp(
  `(?<![0-9A-Za-z.,])(?:${PREFIXO_RS}-?\\s?${K}{1,3}(?: ${K}{3})+,${K}{2}|${PREFIXO_RS}?-?\\s?(?:${K}{1,3}(?:\\.${K}{3})+|${K}+),${K}{2})(?![0-9A-Za-z,]|\\s?%)`,
  "g",
);

type Encontrado<T> = {
  valor: T;
  inicio: number;
  fim: number;
  texto: string;
};

export function lerValor(s: string | null | undefined): number | null {
  if (!s) return null;
  let t = s.trim().replace(new RegExp(`^${PREFIXO_RS}`), "");
  t = t.replace(/^R\$/, "");
  const negativo = /^-/.test(t) || /^\(.*\)$/.test(t);
  t = t.replace(/[-()\s]/g, "");
  if (!t) return null;
  t = corrigirOcrNumerico(t, /\d/.test(t));
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const ult = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  let numero: number;
  if (ult === -1) {
    numero = Number(t);
  } else {
    const sep = t[ult];
    const dec = t.slice(ult + 1);
    const inteiro = t.slice(0, ult).replace(/[.,]/g, "");
    if (sep === "." && dec.length === 3 && !t.includes(",")) {
      numero = Number(inteiro + dec); // "1.234" = mil duzentos e trinta e quatro
    } else {
      numero = Number(`${inteiro || "0"}.${dec || "0"}`);
    }
  }
  if (!Number.isFinite(numero)) return null;
  return arredondar2(negativo ? -numero : numero);
}

// Só ponto e 3 dígitos depois ("1.500"): o ponto é milhar; com vírgula é sempre decimal.
export function lerDecimal(s: string | null | undefined): number | null {
  if (!s) return null;
  let t = s.trim().replace(/\s/g, "");
  t = corrigirOcrNumerico(t, proporcaoDigitos(t) >= 0.5);
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const negativo = t.startsWith("-");
  t = t.replace(/^-/, "");
  const virgula = t.lastIndexOf(",");
  let numero: number;
  if (virgula !== -1) {
    numero = Number(`${t.slice(0, virgula).replace(/[.,]/g, "") || "0"}.${t.slice(virgula + 1)}`);
  } else {
    const ponto = t.lastIndexOf(".");
    if (ponto === -1) numero = Number(t);
    else if (t.length - ponto - 1 === 3 && t.split(".").length >= 2 && !/^0\./.test(t))
      numero = Number(t.replace(/\./g, ""));
    else numero = Number(`${t.slice(0, ponto).replace(/\./g, "") || "0"}.${t.slice(ponto + 1)}`);
  }
  if (!Number.isFinite(numero)) return null;
  return negativo ? -numero : numero;
}

export function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function encontrarValores(texto: string): Encontrado<number>[] {
  const r: Encontrado<number>[] = [];
  PADRAO_DINHEIRO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PADRAO_DINHEIRO.exec(texto))) {
    const bruto = m[0];
    if (!/\d/.test(bruto)) continue;
    const valor = lerValor(bruto);
    if (valor === null) continue;
    r.push({
      valor,
      inicio: m.index,
      fim: m.index + bruto.length,
      texto: bruto,
    });
  }
  return r;
}

export function ehTraco(s: string): boolean {
  return /^\s*[-–—]+\s*$/.test(s);
}

// Sem Intl: saída determinística.
export function formatarReais(v: number): string {
  const centavos = Math.round(Math.abs(v) * 100);
  const inteiro = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = String(centavos % 100).padStart(2, "0");
  return `${v < 0 ? "-" : ""}R$ ${inteiro},${dec}`;
}

const MESES: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};

const NOMES_MESES =
  "JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO|JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ";

export function montarData(ano: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  if (ano < 1990 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function anoCompleto(aa: number, anoReferencia?: number): number {
  if (aa >= 100) return aa;
  if (anoReferencia) return 2000 + aa <= anoReferencia + 1 ? 2000 + aa : 1900 + aa;
  return aa < 70 ? 2000 + aa : 1900 + aa;
}

const D = "[0-9OoIl]";
const DATA_NUMERICA = new RegExp(
  `(?<![0-9A-Za-z/.\\-])(${D}{1,2})\\s?([/.\\-])\\s?(${D}{1,2})\\s?\\2\\s?(${D}{4}|${D}{2})(?![0-9A-Za-z/]|[.\\-]\\d)`,
  "g",
);
const DATA_EXTENSO = new RegExp(
  `(?<!\\d)(\\d{1,2})\\s*[º°O]?\\s*(?:DE\\s+|\\/\\s*|-\\s*)?(${NOMES_MESES})(?![A-Z])\\.?\\s*(?:DE\\s+|\\/\\s*|-\\s*)?(\\d{4})(?!\\d)`,
  "g",
);
const DATA_ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;

export function encontrarDatas(texto: string, anoReferencia?: number): Encontrado<string>[] {
  const r: Encontrado<string>[] = [];
  const corrigir = (s: string) => Number(corrigirOcrNumerico(s, true));
  DATA_NUMERICA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATA_NUMERICA.exec(texto))) {
    const bruto = m[0];
    if (bruto.replace(/\D/g, "").length < 4) continue;
    const anoTxt = m[4];
    // ano com 2 dígitos só com barra ("07.02.01" costuma ser código, não data)
    if (anoTxt.length === 2 && m[2] !== "/") continue;
    const ano = anoTxt.length === 2 ? anoCompleto(corrigir(anoTxt), anoReferencia) : corrigir(anoTxt);
    const data = montarData(ano, corrigir(m[3]), corrigir(m[1]));
    if (data)
      r.push({
        valor: data,
        inicio: m.index,
        fim: m.index + bruto.length,
        texto: bruto,
      });
  }
  const norm = normalizarTexto(texto);
  DATA_EXTENSO.lastIndex = 0;
  while ((m = DATA_EXTENSO.exec(norm))) {
    const mes = MESES[m[2].slice(0, 3)];
    const data = montarData(Number(m[3]), mes, Number(m[1]));
    if (data)
      r.push({
        valor: data,
        inicio: m.index,
        fim: m.index + m[0].length,
        texto: texto.slice(m.index, m.index + m[0].length),
      });
  }
  DATA_ISO.lastIndex = 0;
  while ((m = DATA_ISO.exec(texto))) {
    const data = montarData(Number(m[1]), Number(m[2]), Number(m[3]));
    if (data)
      r.push({
        valor: data,
        inicio: m.index,
        fim: m.index + m[0].length,
        texto: m[0],
      });
  }
  return r.sort((a, b) => a.inicio - b.inicio).filter((d, i, todas) => i === 0 || d.inicio >= todas[i - 1].fim);
}

export function lerData(texto: string | null | undefined, anoReferencia?: number): string | null {
  if (!texto) return null;
  return encontrarDatas(texto, anoReferencia)[0]?.valor ?? null;
}

// Em UTC: sem deslocamento de fuso.
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

export function diferencaDias(a: string, b: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

const UNIDADES: Record<string, number> = {
  ZERO: 0,
  UM: 1,
  UMA: 1,
  DOIS: 2,
  DUAS: 2,
  TRES: 3,
  QUATRO: 4,
  CINCO: 5,
  SEIS: 6,
  SETE: 7,
  OITO: 8,
  NOVE: 9,
  DEZ: 10,
  ONZE: 11,
  DOZE: 12,
  TREZE: 13,
  QUATORZE: 14,
  CATORZE: 14,
  QUINZE: 15,
  DEZESSEIS: 16,
  DEZESSETE: 17,
  DEZOITO: 18,
  DEZENOVE: 19,
  VINTE: 20,
  TRINTA: 30,
  QUARENTA: 40,
  CINQUENTA: 50,
  SESSENTA: 60,
  SETENTA: 70,
  OITENTA: 80,
  NOVENTA: 90,
  CEM: 100,
  CENTO: 100,
  DUZENTOS: 200,
  DUZENTAS: 200,
  TREZENTOS: 300,
  TREZENTAS: 300,
  QUATROCENTOS: 400,
  QUATROCENTAS: 400,
  QUINHENTOS: 500,
  QUINHENTAS: 500,
  SEISCENTOS: 600,
  SEISCENTAS: 600,
  SETECENTOS: 700,
  SETECENTAS: 700,
  OITOCENTOS: 800,
  OITOCENTAS: 800,
  NOVECENTOS: 900,
  NOVECENTAS: 900,
};

function extensoInteiro(palavras: string[]): number | null {
  let total = 0;
  let grupo = 0;
  let algum = false;
  for (const p of palavras) {
    if (p === "E" || p === "DE") continue;
    if (p in UNIDADES) {
      grupo += UNIDADES[p];
      algum = true;
    } else if (p === "MIL") {
      total += (grupo || 1) * 1000;
      grupo = 0;
      algum = true;
    } else if (p === "MILHAO" || p === "MILHOES") {
      total += (grupo || 1) * 1_000_000;
      grupo = 0;
      algum = true;
    } else {
      return null;
    }
  }
  return algum ? total + grupo : null;
}

export function extensoParaNumero(texto: string): number | null {
  const norm = normalizarTexto(texto).replace(/[^A-Z ]/g, " ");
  const palavras = norm.split(/\s+/).filter(Boolean);
  const iReais = palavras.findIndex((p) => p === "REAIS" || p === "REAL");
  const iCentavos = palavras.findIndex((p) => p === "CENTAVOS" || p === "CENTAVO");
  if (iReais === -1 && iCentavos === -1) return null;
  let reais = 0;
  let centavos = 0;
  if (iReais !== -1) {
    const v = extensoInteiro(palavras.slice(0, iReais));
    if (v === null) return null;
    reais = v;
  }
  if (iCentavos !== -1) {
    const inicio = iReais === -1 ? 0 : iReais + 1;
    const v = extensoInteiro(palavras.slice(inicio, iCentavos));
    if (v === null || v > 99) return null;
    centavos = v;
  }
  return arredondar2(reais + centavos / 100);
}
