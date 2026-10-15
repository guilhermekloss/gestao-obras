/**
 * Códigos com dígito verificador: chave de acesso (texto, QR Code da NFC-e,
 * Code-128 do DANFE), linha digitável / código de barras de boleto (47/44) e
 * de arrecadação (48/44). São as âncoras mais confiáveis da leitura.
 */
import type { CodigoLido } from "../tipos";
import {
  chaveAcessoValida,
  corrigirChave,
  limparAlfanumerico,
  modulo10,
  modulo11Arrecadacao,
  modulo11Boleto,
  somenteDigitos,
} from "./digitos";
import { arredondar2, diferencaDias, somarDias } from "./normalizacao";

// ---------------------------------------------------------------------------
// Chave de acesso

/** 11 grupos de 4 (com espaço/ponto entre eles) ou 44 contíguos; letras toleradas para correção. */
const GRUPOS_CHAVE = /(?<![0-9A-Za-z])((?:[0-9A-Za-z|]{4}[ .]{0,2}){10}[0-9A-Za-z|]{4})(?![0-9A-Za-z])/g;

type ChaveEncontrada = { chave: string; valida: boolean };

/**
 * Procura a chave de acesso (44) num trecho. Devolve a primeira válida
 * (corrigindo confusões de OCR quando o DV fecha); se só houver uma
 * sequência no formato de chave que não fecha, devolve-a como lida (inválida).
 */
export function chaveNoTexto(texto: string): ChaveEncontrada | null {
  let invalida: string | null = null;
  GRUPOS_CHAVE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GRUPOS_CHAVE.exec(texto))) {
    const bruto = m[1].replace(/[ .]/g, "");
    if (bruto.length !== 44) continue;
    if (somenteDigitos(bruto).length < 30) continue;
    const corrigida = corrigirChave(bruto);
    if (corrigida) return { chave: corrigida, valida: true };
    if (!invalida && /^\d{44}$/.test(bruto)) invalida = bruto;
  }
  return invalida ? { chave: invalida, valida: false } : null;
}

/** Chave da NFS-e nacional (50 posições) num trecho; só válidas. */
export function chaveNfseNoTexto(texto: string): string | null {
  // sequências de tokens alfanuméricos separados por espaço/ponto; testa os
  // trechos contíguos de tokens que somam 50 caracteres
  const corridas = texto.match(/[0-9A-Za-z]+(?:[ .]{1,2}[0-9A-Za-z]+)*/g) ?? [];
  for (const corrida of corridas) {
    const tokens = corrida.split(/[ .]+/);
    for (let i = 0; i < tokens.length; i++) {
      let junto = "";
      for (let j = i; j < tokens.length && junto.length < 50; j++) {
        junto += tokens[j];
        if (junto.length === 50 && somenteDigitos(junto).length >= 40) {
          const corrigida = corrigirChave(junto, 50);
          if (corrigida) return corrigida;
        }
      }
    }
  }
  return null;
}

export type DadosQrNfce = {
  chave: string;
  versao: string | null;
  ambiente: string | null;
  /** dia da emissão (emissão offline) */
  dia: number | null;
  /** valor total (emissão offline / QR v1) */
  valor: number | null;
  /** CNPJ/CPF do consumidor (v3 offline / v1) */
  destinatario: string | null;
};

function decodificarUrl(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Lê o conteúdo do QR Code da NFC-e: v2/v3 (`?p=chave|versao|tpAmb|...`) e
 * v1 (`chNFe=...&vNF=...`). Só devolve quando a chave fecha o DV.
 */
export function lerQrNfce(conteudo: string): DadosQrNfce | null {
  const texto = decodificarUrl(conteudo.trim());
  const p = /[?&]p=([^&\s]+)/i.exec(texto);
  if (p) {
    const campos = p[1].split("|");
    const chave = limparAlfanumerico(campos[0]);
    if (!chaveAcessoValida(chave)) return null;
    const versao = campos[1] ?? null;
    const offline = campos.length >= 8;
    const valor = offline ? Number(campos[4]) : NaN;
    let destinatario: string | null = null;
    if (versao === "3" && offline && (campos[5] === "1" || campos[5] === "2"))
      destinatario = somenteDigitos(campos[6]) || null;
    return {
      chave,
      versao,
      ambiente: campos[2] ?? null,
      dia: offline && /^\d{1,2}$/.test(campos[3] ?? "") ? Number(campos[3]) : null,
      valor: Number.isFinite(valor) && valor > 0 ? arredondar2(valor) : null,
      destinatario,
    };
  }
  const ch = /chNFe=([0-9A-Za-z]{44})/i.exec(texto);
  if (ch && chaveAcessoValida(ch[1])) {
    const vnf = /[?&]vNF=([\d.]+)/i.exec(texto);
    const dest = /[?&]cDest=([0-9A-Za-z]+)/i.exec(texto);
    return {
      chave: ch[1].toUpperCase(),
      versao: "1",
      ambiente: /[?&]tpAmb=(\d)/i.exec(texto)?.[1] ?? null,
      dia: null,
      valor: vnf ? arredondar2(Number(vnf[1])) : null,
      destinatario: dest ? dest[1] : null,
    };
  }
  return null;
}

/** Chave vinda dos códigos lidos (QR da NFC-e ou Code-128 do DANFE). */
export function chaveDosCodigos(codigos: CodigoLido[]): { chave: string; qr: DadosQrNfce | null } | null {
  for (const c of codigos) {
    if (c.formato === "QR" || /p=|chNFe=/i.test(c.texto)) {
      const qr = lerQrNfce(c.texto);
      if (qr) return { chave: qr.chave, qr };
    }
  }
  for (const c of codigos) {
    const limpo = limparAlfanumerico(c.texto);
    if (limpo.length === 44 && chaveAcessoValida(limpo) && !boletoDasBarras(limpo) && !arrecadacaoDasBarras(limpo)) {
      return { chave: limpo, qr: null };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Boleto de cobrança

/** 07/10/1997: base do fator de vencimento original. */
const BASE_FATOR = "1997-10-07";
/** 22/02/2025: o fator recomeça em 1000 (ciclo de 9000 dias). */
const BASE_FATOR_NOVA = "2025-02-22";

/**
 * Data do fator de vencimento. Desde 22/02/2025 o fator 1000 volta a valer
 * essa data; o mesmo fator pode então significar duas datas — escolhe a mais
 * próxima da referência (emissão do documento). Sem referência, o ciclo novo.
 */
export function vencimentoDoFator(fator: number, referencia?: string | null): string | null {
  if (!Number.isInteger(fator) || fator <= 0) return null;
  if (fator < 1000) return somarDias(BASE_FATOR, fator);
  const antigo = somarDias(BASE_FATOR, fator);
  const novo = somarDias(BASE_FATOR_NOVA, fator - 1000);
  if (!referencia) return novo;
  return Math.abs(diferencaDias(referencia, antigo)) < Math.abs(diferencaDias(referencia, novo)) ? antigo : novo;
}

type Boleto = {
  barras: string;
  linha: string | null;
  banco: string;
  fator: number;
  /** null quando o código traz valor zerado (valor em aberto) */
  valor: number | null;
};

/** Barras (44) de cobrança: banco(3) moeda(9) DV fator(4) valor(10) livre(25). */
export function boletoDasBarras(barras: string): Boleto | null {
  if (!/^\d{44}$/.test(barras) || barras[0] === "8" || barras[3] !== "9") return null;
  if (modulo11Boleto(barras.slice(0, 4) + barras.slice(5)) !== Number(barras[4])) return null;
  const valor = Number(barras.slice(9, 19)) / 100;
  return {
    barras,
    linha: null,
    banco: barras.slice(0, 3),
    fator: Number(barras.slice(5, 9)),
    valor: valor > 0 ? valor : null,
  };
}

/** Linha digitável (47) → boleto, conferindo os 3 DVs de campo (mód. 10) e o DV geral. */
export function boletoDaLinha(linha: string): Boleto | null {
  const d = somenteDigitos(linha);
  if (d.length !== 47) return null;
  const c1 = d.slice(0, 10);
  const c2 = d.slice(10, 21);
  const c3 = d.slice(21, 32);
  for (const c of [c1, c2, c3]) {
    if (modulo10(c.slice(0, -1)) !== Number(c[c.length - 1])) return null;
  }
  const barras = c1.slice(0, 4) + d[32] + d.slice(33, 47) + c1.slice(4, 9) + c2.slice(0, 10) + c3.slice(0, 10);
  const b = boletoDasBarras(barras);
  return b ? { ...b, linha: d } : null;
}

// ---------------------------------------------------------------------------
// Arrecadação (contas de consumo, tributos: começa com 8)

type Arrecadacao = {
  barras: string;
  linha: string | null;
  segmento: string;
  /** 6/8 = valor em reais; 7/9 = valor de referência (não é reais) */
  identificadorValor: string;
  /** reais; null quando o identificador é de referência ou o valor está zerado */
  valor: number | null;
  /** código do órgão/empresa (posições 16–19) */
  orgao: string;
};

function moduloArrecadacao(id: string): ((base: string) => number) | null {
  if (id === "6" || id === "7") return modulo10;
  if (id === "8" || id === "9") return modulo11Arrecadacao;
  return null;
}

/** Barras (44) de arrecadação, conferindo o DV geral (posição 4). */
export function arrecadacaoDasBarras(barras: string): Arrecadacao | null {
  if (!/^8\d{43}$/.test(barras)) return null;
  const modulo = moduloArrecadacao(barras[2]);
  if (!modulo || modulo(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) return null;
  const real = barras[2] === "6" || barras[2] === "8";
  const valor = Number(barras.slice(4, 15)) / 100;
  return {
    barras,
    linha: null,
    segmento: barras[1],
    identificadorValor: barras[2],
    valor: real && valor > 0 ? valor : null,
    orgao: barras.slice(15, 19),
  };
}

/** Linha digitável de arrecadação (48 = 4 blocos de 11 + DV). */
export function arrecadacaoDaLinha(linha: string): Arrecadacao | null {
  const d = somenteDigitos(linha);
  if (d.length !== 48 || d[0] !== "8") return null;
  const modulo = moduloArrecadacao(d[2]);
  if (!modulo) return null;
  let barras = "";
  for (let i = 0; i < 4; i++) {
    const bloco = d.slice(i * 12, i * 12 + 11);
    if (modulo(bloco) !== Number(d[i * 12 + 11])) return null;
    barras += bloco;
  }
  const a = arrecadacaoDasBarras(barras);
  return a ? { ...a, linha: d } : null;
}

// ---------------------------------------------------------------------------
// Busca no texto e nos códigos lidos

export type CodigoPagamento = { tipo: "BOLETO"; boleto: Boleto } | { tipo: "ARRECADACAO"; arrecadacao: Arrecadacao };

/**
 * Procura uma linha digitável válida numa sequência de dígitos de uma ou
 * duas linhas de texto: testa todas as janelas de 47/48 dígitos (o DV
 * descarta as falsas).
 */
export function codigoPagamentoNoTexto(texto: string): CodigoPagamento | null {
  // trechos de dígitos com separadores típicos da linha digitável
  const trechos = texto.match(/[0-9OoIl][0-9OoIl .\-|]{40,}[0-9OoIl]/g) ?? [];
  for (const trecho of trechos) {
    const d = trecho.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/\D/g, "");
    for (let i = 0; i + 47 <= d.length; i++) {
      const janela48 = d.slice(i, i + 48);
      if (janela48.length === 48 && janela48[0] === "8") {
        const a = arrecadacaoDaLinha(janela48);
        if (a) return { tipo: "ARRECADACAO", arrecadacao: a };
      }
      const b = boletoDaLinha(d.slice(i, i + 47));
      if (b) return { tipo: "BOLETO", boleto: b };
    }
  }
  return null;
}

/** Código de barras (ITF/Code-128) decodificado pelo leitor. */
export function codigoPagamentoDosCodigos(codigos: CodigoLido[]): CodigoPagamento | null {
  for (const c of codigos) {
    const d = somenteDigitos(c.texto);
    if (d.length === 44) {
      const a = arrecadacaoDasBarras(d);
      if (a) return { tipo: "ARRECADACAO", arrecadacao: a };
      const b = boletoDasBarras(d);
      if (b) return { tipo: "BOLETO", boleto: b };
    }
    if (d.length === 47 || d.length === 48) {
      const r = codigoPagamentoNoTexto(d);
      if (r) return r;
    }
  }
  return null;
}
