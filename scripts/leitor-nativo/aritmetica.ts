/**
 * Aritmética dos documentos do corpus: dígitos verificadores (CNPJ, CPF,
 * chave de acesso NF-e/NFC-e/NFS-e, boleto de cobrança, arrecadação),
 * fator de vencimento, hash do QR Code v2 da NFC-e e formatação pt-BR.
 *
 * Tudo aqui é recalculado e conferido pelo gerador — nenhum DV do corpus é
 * copiado "de olho" da especificação.
 */
import { createHash } from "node:crypto";

export const so = (s: string) => s.replace(/\D/g, "");

/** Módulo 11, pesos 2..9 da direita para a esquerda; resto < 2 → 0 (CNPJ, chave NF-e). */
function dvMod11Padrao(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function completarCnpj(base12: string): string {
  const d1 = dvMod11Padrao(base12);
  const d2 = dvMod11Padrao(base12 + d1);
  return `${base12}${d1}${d2}`;
}

export function completarCpf(base9: string): string {
  const dv = (b: string) => {
    const soma = [...b].reduce((acc, c, i) => acc + Number(c) * (b.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base9);
  return `${base9}${d1}${dv(base9 + d1)}`;
}

/** Chave NF-e/NFC-e: 43 posições + DV módulo 11. */
export function completarChave(base43: string): string {
  if (base43.length !== 43) throw new Error(`chave base com ${base43.length} posições`);
  return base43 + dvMod11Padrao(base43);
}

/** Chave NFS-e nacional: 49 posições + DV módulo 11 (mesmo algoritmo da NF-e — [VERIFICAR] na especificação). */
export function completarChaveNfse(base49: string): string {
  if (base49.length !== 49) throw new Error(`chave NFS-e base com ${base49.length} posições`);
  return base49 + dvMod11Padrao(base49);
}

/** Módulo 10 (boleto e arrecadação id 6/7): pesos 2,1,2,1… da direita, soma dos dígitos dos produtos. */
function dvMod10(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    let p = Number(base[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/** DV geral do boleto de cobrança: módulo 11 pesos 2..9; 0, 10 e 11 → 1. */
function dvBoletoGeral(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const d = 11 - (soma % 11);
  return d === 0 || d === 10 || d === 11 ? 1 : d;
}

/** Módulo 11 de arrecadação (id 8/9): resto 0 ou 1 → 0; senão 11 − resto. */
function dvArrecadacaoMod11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const DIA_MS = 86_400_000;

/** Fator de vencimento (ciclo reiniciado em 22/02/2025 = 1000). */
function fatorVencimento(iso: string): number {
  const dias = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse("2025-02-22T00:00:00Z")) / DIA_MS);
  if (dias >= 0) return 1000 + dias;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse("1997-10-07T00:00:00Z")) / DIA_MS);
}

type Boleto = { barras: string; linha: string; linhaFormatada: string };

/**
 * Boleto de cobrança: banco(3) moeda(1) [DV] fator(4) valor(10) campoLivre(25).
 * Devolve o código de barras (44) e a linha digitável (47).
 */
export function montarBoleto(banco: string, vencimentoIso: string, valorCents: number, campoLivre: string): Boleto {
  if (campoLivre.length !== 25) throw new Error("campo livre deve ter 25 dígitos");
  const fator = String(fatorVencimento(vencimentoIso)).padStart(4, "0");
  const valor = String(valorCents).padStart(10, "0");
  const semDv = `${banco}9${fator}${valor}${campoLivre}`;
  const dv = dvBoletoGeral(semDv);
  const barras = `${banco}9${dv}${fator}${valor}${campoLivre}`;
  const c1 = `${banco}9${campoLivre.slice(0, 5)}`;
  const c2 = campoLivre.slice(5, 15);
  const c3 = campoLivre.slice(15, 25);
  const campos = [c1 + dvMod10(c1), c2 + dvMod10(c2), c3 + dvMod10(c3)];
  const linha = `${campos.join("")}${dv}${fator}${valor}`;
  const linhaFormatada = `${campos[0].slice(0, 5)}.${campos[0].slice(5)} ${campos[1].slice(0, 5)}.${campos[1].slice(5)} ${campos[2].slice(0, 5)}.${campos[2].slice(5)} ${dv} ${fator}${valor}`;
  return { barras, linha, linhaFormatada };
}

/** Linha digitável (47) → código de barras (44). */
function linhaParaBarras(linha: string): string {
  const l = so(linha);
  return l.slice(0, 4) + l.slice(32, 33) + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
}

/** Confere os três DVs módulo 10 e o DV geral de uma linha digitável de cobrança. */
export function boletoValido(linha: string): boolean {
  const l = so(linha);
  if (l.length !== 47) return false;
  const campos = [l.slice(0, 10), l.slice(10, 21), l.slice(21, 32)];
  if (!campos.every((c) => dvMod10(c.slice(0, -1)) === Number(c.slice(-1)))) return false;
  const b = linhaParaBarras(l);
  return dvBoletoGeral(b.slice(0, 4) + b.slice(5)) === Number(b[4]);
}

type Arrecadacao = { barras: string; linha: string; linhaFormatada: string };

/**
 * Código de arrecadação (começa com 8): produto(1)=8 segmento(1) idValor(1) [DV] valor(11) resto(29).
 * idValor 6/7 → módulo 10; 8/9 → módulo 11.
 */
export function montarArrecadacao(segmento: string, idValor: string, valorCents: number, resto29: string): Arrecadacao {
  if (resto29.length !== 29) throw new Error("arrecadação: resto deve ter 29 dígitos");
  const mod = idValor === "6" || idValor === "7" ? dvMod10 : dvArrecadacaoMod11;
  const valor = String(valorCents).padStart(11, "0");
  const semDv = `8${segmento}${idValor}${valor}${resto29}`;
  const dv = mod(semDv);
  const barras = `8${segmento}${idValor}${dv}${valor}${resto29}`;
  const blocos = [0, 1, 2, 3].map((i) => barras.slice(i * 11, i * 11 + 11));
  const comDv = blocos.map((b) => `${b}${mod(b)}`);
  return {
    barras,
    linha: comDv.join(""),
    linhaFormatada: comDv.map((b) => `${b.slice(0, 11)}-${b.slice(11)}`).join(" "),
  };
}

export function arrecadacaoValida(linha: string): boolean {
  const l = so(linha);
  if (l.length !== 48 || l[0] !== "8") return false;
  const mod = l[2] === "6" || l[2] === "7" ? dvMod10 : dvArrecadacaoMod11;
  const blocos = [0, 1, 2, 3].map((i) => l.slice(i * 12, i * 12 + 12));
  if (!blocos.every((b) => mod(b.slice(0, 11)) === Number(b[11]))) return false;
  const barras = blocos.map((b) => b.slice(0, 11)).join("");
  return mod(barras.slice(0, 3) + barras.slice(4)) === Number(barras[3]);
}

/** cHashQRCode do QR v2 (NFC-e online): SHA-1 hex maiúsculo de `chave|2|tpAmb|cIdToken` + CSC. */
export function hashQrV2(chave: string, tpAmb: string, idToken: string, csc: string): string {
  return createHash("sha1").update(`${chave}|2|${tpAmb}|${Number(idToken)}${csc}`).digest("hex").toUpperCase();
}

// ---------------------------------------------------------------------------
// Formatação pt-BR

export function moeda(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const inteiro = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${inteiro},${String(abs % 100).padStart(2, "0")}`;
}

/** Número com casas fixas e vírgula decimal (quantidades/unitários do DANFE: 20,0000). */
export function decimal(v: number, casas: number): string {
  const [i, d] = v.toFixed(casas).split(".");
  const inteiro = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return casas > 0 ? `${inteiro},${d}` : inteiro;
}

export function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export function mesAno(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  const nome = MESES[m - 1];
  return `${nome[0].toUpperCase()}${nome.slice(1)}/${a}`;
}

export function fmtCnpj(d: string): string {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function fmtCpf(d: string): string {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Chave em 11 grupos de 4. */
export function grupos4(chave: string): string {
  return chave.replace(/(.{4})(?=.)/g, "$1 ");
}

/** "000.012.345" (nNF formatado do DANFE). */
export function numeroNf(n: number): string {
  return String(n).padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");
}

// ---------------------------------------------------------------------------
// Valor por extenso (reais), para o recibo

const UNID = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos",
  "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]);
  if (r < 20 && r > 0) partes.push(UNID[r]);
  else if (r >= 20) partes.push(DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNID[r % 10]}` : ""));
  return partes.join(" e ");
}

export function reaisPorExtenso(cents: number): string {
  const reais = Math.floor(cents / 100);
  const cent = cents % 100;
  const mil = Math.floor(reais / 1000);
  const resto = reais % 1000;
  const partes: string[] = [];
  if (mil) partes.push(mil === 1 ? "mil" : `${ate999(mil)} mil`);
  if (resto) partes.push(ate999(resto));
  let texto = partes.join(resto && (resto < 100 || resto % 100 === 0) ? " e " : " ");
  if (reais) texto += reais === 1 ? " real" : " reais";
  if (cent) texto += `${reais ? " e " : ""}${ate999(cent)} ${cent === 1 ? "centavo" : "centavos"}`;
  return texto;
}
