import { encontrarDocumentos, type DocumentoEncontrado } from "./digitos";
import type { Doc, Faixa, LinhaDoc, Token } from "./documento";
import { ehTraco, encontrarValores, lerData, limparEspacos } from "./normalizacao";

type Rotulo = { chave: string; padrao: RegExp };

const r = (chave: string, padrao: RegExp): Rotulo => ({ chave, padrao });

const ROTULOS: Rotulo[] = [
  r("CNPJ_BENEFICIARIO", /(?:CPF\s*\/\s*CNPJ|CNPJ\s*\/\s*CPF|CNPJ|CPF)\s*DO\s*BENEFICIARIO/),
  r("CNPJ_CPF", /\bC\s?NPJ\s*\/\s*CPF(?:\s*\/\s*NIF)?\b|\bCPF\s*\/\s*CNPJ(?:\s*\/\s*NIF)?\b/),
  r("CNPJ", /\bCNPJ\b(?:\s*\/\s*MF\b)?/),
  r("CPF", /\bCPF\b(?:\s*\/\s*MF\b)?/),
  r("IE_ST", /INSC(?:RICAO|R?\.)\s*EST(?:ADUAL|\.)?\s*DO\s*SUBST(?:ITUTO|\.)?\s*TRIB(?:UTARIO|\.)?/),
  r("IE", /INSC(?:RICAO|R?\.)\s*ESTADUAL\b|\bI\.?E\.?:/),
  r("IM", /INSC(?:RICAO|R?\.)\s*MUNICIPAL/),
  r("NOME_RAZAO", /NOME\s*\/\s*RAZAO\s*SOCIAL|NOME\s*\/\s*NOME\s*EMPRESARIAL|RAZAO\s*SOCIAL|NOME\s*EMPRESARIAL/),
  r("NOME", /\bNOME\b/),
  r("ENDERECO", /\bENDERECO\b/),
  r("BAIRRO", /\bBAIRRO(?:\s*\/\s*DISTRITO)?\b/),
  r("CEP", /\bCEP\b/),
  r("MUNICIPIO", /\bMUNICIPIO\b/),
  r("UF", /\bUF\b/),
  r("FONE", /\bFONE\s*\/\s*FAX\b|\bTELEFONE\b|\bFONE\b|\bTEL\b\.?/),
  r("EMAIL", /\bE-?\s?MAIL\b/),
  r("CONTRIBUINTE", /\bCONTRIBUINTE\b/),
  r("EMITENTE", /\bEMITENTE\b|\bRECEBEDOR\b/),
  r("DATA_EMISSAO_DPS", /DATA\s*E\s*HORA\s*DA\s*EMISSAO\s*DA\s*DPS/),
  r("DATA_EMISSAO", /DATA\s*(?:E\s*HORA\s*)?D[AE]\s*EMISSAO(?:\s*DA\s*NFS-?E)?|\bEMISSAO\b/),
  r("EMITIDA_EM", /EMITIDA\s*EM/),
  r("DATA_SAIDA", /DATA\s*D[AE]\s*SAIDA\s*\/?\s*ENTRADA/),
  r("HORA_SAIDA", /HORA\s*D[AE]\s*SAIDA\s*\/?\s*ENTRADA/),
  r("DATA_VENCIMENTO", /DATA\s*D[EO]\s*VENCIMENTO/),
  r("VENCIMENTO", /\bVENCIMENTO\b|\bVENC\b\.?/),
  r("PAGAR_ATE", /PAGAR\s*(?:ESTE\s*DOCUMENTO\s*)?ATE\b/),
  r("COMPETENCIA", /\bCOMPETENCIA(?:\s*DA\s*NFS-?E)?/),
  r("PERIODO_APURACAO", /PERIODO\s*DE\s*APURACAO/),
  r("DATA_DOCUMENTO", /DATA\s*DO\s*DOCUMENTO/),
  r("DATA_PROCESSAMENTO", /DATA\s*(?:DO\s*|DE\s*)?PROCESSAMENTO/),
  r("DATA_AUTORIZACAO", /DATA\s*DE\s*AUTORIZACAO/),
  r("NATUREZA", /NATUREZA\s*DA\s*OPERACAO/),
  r("PROTOCOLO", /PROTOCOLO\s*DE\s*AUTORIZACAO(?:\s*DE\s*USO)?/),
  r("CHAVE", /CHAVE\s*DE\s*ACESSO(?:\s*DA\s*NFS-?E)?/),
  r("BC_ICMS", /BASE\s*DE\s*CALC(?:ULO|\.)?\s*(?:DO\s*)?ICMS|\bB\.?\s*CALC\.?\s*ICMS/),
  r("BC_ST", /BASE\s*DE\s*CALC(?:ULO|\.)?\s*(?:DO\s*)?ICMS\s*(?:S\.?\s*T\.?|ST\b|SUBST(?:ITUICAO|\.)?)/),
  r("V_ICMS", /VALOR\s*DO\s*ICMS|\bV\.?\s*ICMS\b/),
  r("V_ST", /VALOR\s*DO\s*ICMS\s*(?:SUBST(?:ITUICAO|\.)?|S\.?\s*T\.?|ST\b)|\bV\.?\s*ICMS\s*SUBST\.?/),
  r("V_PROD", /V(?:ALOR|\.)?\s*TOTAL\s*(?:DOS\s*)?PRODUTOS/),
  r("V_FRETE", /VALOR\s*DO\s*FRETE|\bV\.?\s*FRETE\b/),
  r("V_SEGURO", /VALOR\s*DO\s*SEGURO|\bV\.?\s*SEGURO\b/),
  r("OUTRAS_DESPESAS", /OUTRAS\s*DESP(?:ESAS|\.)?(?:\s*ACESS(?:ORIAS|\.)?)?/),
  r("V_IPI", /VALOR\s*(?:TOTAL\s*)?(?:DO\s*)?IPI|\bV\.?\s*(?:TOTAL\s*)?IPI\b/),
  r("V_NF", /V(?:ALOR|\.)?\s*TOTAL\s*DA\s*NOTA(?!\s*FISCAL\s*DE\s*SERV)/),
  r("V_II", /V(?:ALOR|\.)?\s*(?:DO\s*)?IMP(?:OSTO|\.)?\s*(?:DE\s*)?IMPORTACAO/),
  r("V_ICMS_UF_REMET", /V\.?\s*ICMS\s*UF\s*REMET\.?/),
  r("V_ICMS_UF_DEST", /V\.?\s*ICMS\s*UF\s*DEST\.?/),
  r("V_FCP_UF_DEST", /V\.?\s*FCP\s*UF\s*DEST\.?/),
  r("V_FCP_ST", /V(?:ALOR|\.)?\s*(?:DO\s*)?FCP\s*(?:ST|S\.T\.)/),
  r("V_FCP", /V(?:ALOR|\.)?\s*(?:DO\s*)?FCP\b/),
  r("V_TOT_TRIB", /V(?:ALOR|\.)?\s*TOT(?:AL|\.)?\s*(?:APROX\.?\s*)?(?:DOS\s*)?TRIB(?:UTOS|\.)?/),
  r("V_PIS", /VALOR\s*DO\s*PIS/),
  r("V_COFINS", /VALOR\s*DA\s*COFINS/),
  r("DESCONTO", /\bDESCONTOS?\b/),
  r("FRETE_POR_CONTA", /FRETE\s*POR\s*CONTA/),
  r("CODIGO_ANTT", /CODIGO\s*ANTT/),
  r("PLACA", /PLACA\s*DO\s*VEICULO/),
  r("QUANTIDADE", /\bQUANTIDADE\b/),
  r("ESPECIE", /\bESPECIE\b/),
  r("MARCA", /\bMARCA\b/),
  r("NUMERACAO", /\bNUMERACAO\b/),
  r("PESO_BRUTO", /PESO\s*BRUTO/),
  r("PESO_LIQUIDO", /PESO\s*LIQUIDO/),
  r("BC_ISSQN", /BASE\s*DE\s*CALCULO\s*DO\s*ISSQN|\bBC\s*ISSQN\b/),
  r("V_ISSQN", /VALOR\s*DO\s*ISSQN|\bISSQN\s*APURADO\b/),
  r("NUMERO_NFSE", /N(?:UMERO|º|°|O\.?)\s*DA\s*(?:NFS-?E|NOTA)|\bN[º°]\s*(?:DA\s*)?NFS-?E/),
  r("NUMERO_DPS", /NUMERO\s*DA\s*DPS/),
  r("SERIE_DPS", /SERIE\s*DA\s*DPS/),
  r("CODIGO_VERIFICACAO", /CODIGO\s*DE\s*(?:VERIFICACAO|AUTENTICIDADE)/),
  r("VALOR_SERVICO", /VALOR\s*(?:TOTAL\s*)?D[OA]S?\s*SERVICOS?\b/),
  r("DESC_COND", /DESCONTO\s*CONDICIONADO/),
  r("DESC_INCOND", /DESCONTO\s*INCONDICIONADO/),
  r("ISS_RETIDO", /\bISS(?:QN)?\s*RETIDO\b/),
  r("RETENCAO_ISSQN", /RETENCAO\s*DO\s*ISS(?:QN)?/),
  r("ALIQUOTA", /ALIQUOTA(?:\s*APLICADA)?(?:\s*\(%\))?|\bALIQ\.?/),
  r("BASE_CALCULO", /BASE\s*DE\s*CALCULO(?:\s*\(R\$\))?/),
  r("DEDUCOES", /(?:VALOR\s*)?TOTAL\s*(?:DAS\s*)?DEDUCOES(?:\s*\/\s*REDUCOES)?(?:\s*\(R\$\))?|\bDEDUCOES\b/),
  r("CALCULO_BM", /CALCULO\s*DO\s*BM/),
  r("VALOR_ISS", /VALOR\s*DO\s*ISS\b(?:\s*\(R\$\))?/),
  r("CREDITO", /\bCREDITO\b(?:\s*\(R\$\))?/),
  r("IRRF", /\bIRRF\b(?:\s*\(R\$\))?|\bIR\b(?:\s*\(R\$\))?/),
  r("INSS", /\bINSS\b(?:\s*\(R\$\))?/),
  r("CSLL", /\bCSLL\b(?:\s*\(R\$\))?/),
  r("COFINS", /\bCOFINS\b(?:\s*\(R\$\))?/),
  r("PIS", /\bPIS\s*\/\s*PASEP\b(?:\s*\(R\$\))?|\bPIS\b(?:\s*\(R\$\))?/),
  r("PIS_COFINS", /PIS\s*\/\s*COFINS(?:\s*-\s*DEBITO\s*APUR\.?\s*PROPRIA)?/),
  r("CP_RETIDA", /CONTRIBUICAO\s*PREVIDENCIARIA\s*-?\s*RETIDA/),
  r("CS_RETIDAS", /CONTRIBUICOES\s*SOCIAIS\s*-?\s*RETIDAS/),
  r("RET_FEDERAIS", /(?:TOTAL\s*DAS\s*)?RETENCOES\s*FEDERAIS/),
  r("VALOR_LIQUIDO", /VALOR\s*LIQUIDO(?:\s*DA\s*(?:NFS-?E|NOTA))?/),
  r("VALOR_TOTAL_NOTA", /VALOR\s*TOTAL\s*DA\s*(?:NFS-?E|NOTA)/),
  r("COD_TRIB_NACIONAL", /CODIGO\s*DE\s*TRIBUTACAO\s*NACIONAL/),
  r("COD_TRIB_MUNICIPAL", /CODIGO\s*DE\s*TRIBUTACAO\s*MUNICIPAL/),
  r("LOCAL_PRESTACAO", /LOCAL\s*DA\s*PRESTACAO/),
  r("PAIS_PRESTACAO", /PAIS\s*DA\s*PRESTACAO/),
  r("MUNICIPIO_PRESTACAO", /MUNICIPIO\s*DA\s*PRESTACAO(?:\s*DO\s*SERVICO)?/),
  r("MUNICIPIO_INCIDENCIA", /MUNICIPIO\s*DE\s*INCIDENCIA(?:\s*DO\s*ISSQN)?/),
  r("TRIBUTACAO_ISSQN", /TRIBUTACAO\s*DO\s*ISSQN/),
  r("REGIME_ESPECIAL", /REGIME\s*ESPECIAL\s*DE\s*TRIBUTACAO/),
  r("CODIGO_SERVICO", /CODIGO\s*DO\s*SERVICO/),
  r("INSCRICAO_OBRA", /NUMERO\s*(?:DE\s*)?INSCRICAO\s*DA\s*OBRA/),
  r("LOCAL_PAGAMENTO", /LOCAL\s*DE\s*PAGAMENTO/),
  r("BENEFICIARIO", /\bBENEFICIARIO\b|\bCEDENTE\b/),
  r("AGENCIA_CODIGO", /AGENCIA\s*\/\s*CODIGO\s*(?:DO\s*)?(?:BENEFICIARIO|CEDENTE)/),
  r("NUM_DOCUMENTO", /\bN(?:UMERO|º|°|O\.?)\s*(?:DO\s*)?DOCUMENTO\b/),
  r("ESPECIE_DOC", /ESPECIE\s*(?:DOC\b\.?|DO\s*DOCUMENTO)/),
  r("ACEITE", /\bACEITE\b/),
  r("NOSSO_NUMERO", /NOSSO\s*NUMERO/),
  r("USO_BANCO", /USO\s*DO\s*BANCO/),
  r("CARTEIRA", /\bCARTEIRA\b/),
  r("VALOR_DOCUMENTO", /(?:\(=\)\s*)?VALOR\s*DO\s*DOCUMENTO/),
  r("DESCONTO_ABATIMENTO", /(?:\(-\)\s*)?DESCONTOS?\s*\/\s*ABATIMENTOS?/),
  r("OUTRAS_DEDUCOES", /(?:\(-\)\s*)?OUTRAS\s*DEDUCOES/),
  r("MORA_MULTA", /(?:\(\+\)\s*)?MORA\s*\/\s*MULTA/),
  r("OUTROS_ACRESCIMOS", /(?:\(\+\)\s*)?OUTROS\s*ACRESCIMOS/),
  r("VALOR_COBRADO", /(?:\(=\)\s*)?VALOR\s*COBRADO/),
  r("RECIBO_PAGADOR", /RECIBO\s*DO\s*(?:PAGADOR|SACADO)/),
  r("PAGADOR", /\bPAGADOR\b|\bSACADO\b/),
  r("SACADOR", /SACADOR\s*\/\s*AVALISTA/),
  r("INSTRUCOES", /\bINSTRUCOES\b(?:\s*\(TEXTO\s*DE\s*RESPONSABILIDADE\s*DO\s*BENEFICIARIO\))?/),
  r("AUTENTICACAO", /AUTENTICACAO\s*MECANICA/),
  r("FICHA_COMPENSACAO", /FICHA\s*DE\s*COMPENSACAO/),
  r("VALOR_TOTAL_DOCUMENTO", /VALOR\s*TOTAL\s*DO\s*DOCUMENTO|\b10\s*-?\s*VALOR\s*TOTAL\b|\b11\s*-\s*TOTAL\b/),
  r("NUMERO_CPF_CNPJ", /NUMERO\s*DO\s*(?:CPF\s*OU\s*CNPJ|CNPJ\s*OU\s*CPF)/),
  r("NOME_TELEFONE", /NOME\s*\/\s*TELEFONE/),
  r("NUMERO", /\bNUMERO\b/),
  r("CODIGO_RECEITA", /CODIGO\s*DA\s*RECEITA/),
  r("NUMERO_REFERENCIA", /NUMERO\s*DE\s*REFERENCIA/),
  r("IDENTIFICADOR", /\bIDENTIFICADOR\b/),
  r("CODIGO_PAGAMENTO", /CODIGO\s*DE\s*PAGAMENTO/),
  r("VALOR_INSS", /VALOR\s*DO\s*INSS/),
  r("VALOR_OUTRAS_ENTIDADES", /VALOR\s*DE\s*OUTRAS\s*ENTIDADES/),
  r("ATM_MULTA_JUROS", /ATM\s*,?\s*MULTA\s*E\s*JUROS/),
  r("VALOR_PRINCIPAL", /VALOR\s*DO\s*PRINCIPAL/),
  r("VALOR_A_PAGAR", /VALOR\s*A\s*PAGAR|TOTAL\s*A\s*PAGAR/),
  r("VALOR_TOTAL", /VALOR\s*TOTAL\b/),
  r("QTD_TOTAL_ITENS", /QT(?:DE|D)?\.?\s*TOTAL\s*DE\s*ITENS/),
  r("ACRESCIMOS", /ACRESCIMOS?\b/),
  r("FORMA_PAGAMENTO", /FORMAS?\s*(?:DE\s*)?PAGAMENTO/),
  r("VALOR_PAGO", /VALOR\s*PAGO/),
  r("TROCO", /\bTROCO\b/),
  r("VALOR", /\bVALOR\b(?:\s*\(R\$\))?/),
  r("TOTAL", /\bTOTAL\b/),
];

type Ocorrencia = { chave: string; inicio: number; fim: number };

const cacheRotulos = new WeakMap<LinhaDoc, Ocorrencia[]>();

export function rotulosDaLinha(linha: LinhaDoc): Ocorrencia[] {
  const emCache = cacheRotulos.get(linha);
  if (emCache) return emCache;
  const todos: Ocorrencia[] = [];
  for (const rot of ROTULOS) {
    const re = new RegExp(rot.padrao.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(linha.norm))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      todos.push({
        chave: rot.chave,
        inicio: m.index,
        fim: m.index + m[0].length,
      });
    }
  }
  todos.sort((a, b) => b.fim - b.inicio - (a.fim - a.inicio) || a.inicio - b.inicio);
  const aceitos: Ocorrencia[] = [];
  for (const o of todos) {
    if (!aceitos.some((a) => o.inicio < a.fim && o.fim > a.inicio)) aceitos.push(o);
  }
  aceitos.sort((a, b) => a.inicio - b.inicio);
  cacheRotulos.set(linha, aceitos);
  return aceitos;
}

export function coberturaRotulos(linha: LinhaDoc): number {
  const total = linha.norm.replace(/[^A-Z0-9]/g, "").length;
  if (!total) return 0;
  let coberto = 0;
  for (const o of rotulosDaLinha(linha)) coberto += linha.norm.slice(o.inicio, o.fim).replace(/[^A-Z0-9]/g, "").length;
  return coberto / total;
}

function soRotulos(linha: LinhaDoc): boolean {
  let resto = linha.norm;
  for (const o of rotulosDaLinha(linha))
    resto = resto.slice(0, o.inicio) + " ".repeat(o.fim - o.inicio) + resto.slice(o.fim);
  return !/[A-Z0-9]/.test(resto);
}

type Unidade = {
  texto: string;
  inicio: number;
  fim: number;
  x0: number | null;
  x1: number | null;
  celula: number;
};

function ehAtomico(t: string): boolean {
  if (ehTraco(t) || t.includes("@")) return true;
  const alnum = t.replace(/[^0-9A-Za-z]/g, "");
  if (!alnum) return false;
  return alnum.replace(/\D/g, "").length >= alnum.length * 0.4;
}

function juntar(a: Unidade, b: Unidade, linha: LinhaDoc): Unidade {
  return {
    texto: linha.texto.slice(a.inicio, b.fim),
    inicio: a.inicio,
    fim: b.fim,
    x0: a.x0,
    x1: b.x1,
    celula: a.celula,
  };
}

export function unidadesDaLinha(linha: LinhaDoc): Unidade[] {
  const tokens: Unidade[] = linha.tokens.map((t: Token) => ({ ...t }));
  const unidos: Unidade[] = [];
  for (const t of tokens) {
    const ant = unidos[unidos.length - 1];
    if (ant && ant.celula === t.celula) {
      const a = ant.texto;
      const ehNum = /\d/.test(t.texto);
      if (
        (/^R\s?[$S5]\.?$/i.test(a) && ehNum) ||
        (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(a) && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t.texto)) ||
        (/^\(\d{2}\)$/.test(a) && /^\d{4,5}-?\d{4}$/.test(t.texto)) ||
        (/\d$/.test(a) && t.texto === "%")
      ) {
        unidos[unidos.length - 1] = juntar(ant, t, linha);
        continue;
      }
    }
    unidos.push(t);
  }
  const r: Unidade[] = [];
  for (const u of unidos) {
    const ant = r[r.length - 1];
    if (ant && ant.celula === u.celula && !ehAtomico(ant.texto) && !ehAtomico(u.texto)) {
      r[r.length - 1] = juntar(ant, u, linha);
      continue;
    }
    r.push(u);
  }
  return r;
}

function celulasDaLinha(linha: LinhaDoc): Unidade[] {
  const r: Unidade[] = [];
  for (const t of linha.tokens) {
    const ant = r[r.length - 1];
    if (ant && ant.celula === t.celula) r[r.length - 1] = juntar(ant, { ...t }, linha);
    else r.push({ ...t });
  }
  return r;
}

type Intervalo = { x0: number; x1: number };

function extensao(linha: LinhaDoc, inicio: number, fim: number, real: boolean): Intervalo | null {
  if (!real) return { x0: inicio, x1: fim };
  const ts = linha.tokens.filter((t) => t.inicio < fim && t.fim > inicio && t.x0 !== null && t.x1 !== null);
  if (ts.length === 0) return null;
  return {
    x0: Math.min(...ts.map((t) => t.x0!)),
    x1: Math.max(...ts.map((t) => t.x1!)),
  };
}

function larguraCaractere(linha: LinhaDoc, real: boolean): number {
  if (!real) return 1;
  let soma = 0;
  let n = 0;
  for (const t of linha.tokens) {
    if (t.x0 === null || t.x1 === null) continue;
    soma += t.x1 - t.x0;
    n += t.texto.length;
  }
  return n ? soma / n : 0.01;
}

function porColuna(rotulos: LinhaDoc, valores: LinhaDoc, oc: Ocorrencia, real: boolean): string | null {
  const ocs = rotulosDaLinha(rotulos);
  const k = ocs.indexOf(oc);
  const ext = extensao(rotulos, oc.inicio, oc.fim, real);
  if (!ext) return null;
  let direita = Number.POSITIVE_INFINITY;
  for (const o of ocs.slice(k + 1)) {
    const e = extensao(rotulos, o.inicio, o.fim, real);
    if (e) direita = Math.min(direita, e.x0);
  }
  const celulaRotulo = rotulos.tokens.find((t) => t.fim > oc.inicio)?.celula ?? -1;
  for (const t of rotulos.tokens) {
    if (t.inicio >= oc.fim && t.celula > celulaRotulo) {
      const e = extensao(rotulos, t.inicio, t.fim, real);
      if (e) direita = Math.min(direita, e.x0);
      break;
    }
  }
  let esquerda = Number.NEGATIVE_INFINITY;
  if (k > 0) {
    const e = extensao(rotulos, ocs[k - 1].inicio, ocs[k - 1].fim, real);
    if (e) esquerda = e.x1;
  }
  const tol = larguraCaractere(rotulos, real);
  const inicioColuna = Math.max(esquerda, ext.x0 - 2 * tol);
  const escolhidas = unidadesDaLinha(valores).filter((u) => {
    const e = extensao(valores, u.inicio, u.fim, real);
    if (!e) return false;
    const centro = (e.x0 + e.x1) / 2;
    return centro >= inicioColuna && centro < direita - tol / 2;
  });
  if (escolhidas.length === 0) return null;
  return escolhidas.map((u) => u.texto).join(" ");
}

function valorAbaixo(doc: Doc, indiceLinha: number, oc: Ocorrencia): string | null {
  const rotulos = doc.linhas[indiceLinha];
  const valores = doc.linhas[indiceLinha + 1];
  if (!valores || valores.pagina !== rotulos.pagina) return null;
  if (coberturaRotulos(valores) > 0.5) return null;
  const ocs = rotulosDaLinha(rotulos);
  const k = ocs.indexOf(oc);
  if (k === -1) return null;
  const real = rotulos.comPosicao && valores.comPosicao;
  if (real) {
    const v = porColuna(rotulos, valores, oc, true);
    if (v) return v;
  }
  if (soRotulos(rotulos)) {
    const celulas = celulasDaLinha(valores);
    if (celulas.length === ocs.length) return celulas[k].texto;
    const unidades = unidadesDaLinha(valores);
    if (unidades.length === ocs.length) return unidades[k].texto;
    if (unidades.length < ocs.length) {
      const palavras = unidades.flatMap((u) => (/\s/.test(u.texto) && !/\d/.test(u.texto) ? u.texto.split(/\s+/) : [u.texto]));
      if (palavras.length === ocs.length) return palavras[k];
    }
  }
  if (!real) return porColuna(rotulos, valores, oc, false);
  return null;
}

function valorMesmaLinha(linha: LinhaDoc, oc: Ocorrencia, ignorar: string[] = []): string {
  const prox = rotulosDaLinha(linha).find((o) => o.inicio >= oc.fim && !ignorar.includes(o.chave));
  return linha.texto.slice(oc.fim, prox ? prox.inicio : linha.texto.length);
}

export type Extrator<T> = (s: string) => T | null;

const extrairValor: Extrator<number> = (s) => {
  const t = s.replace(/^[\s:=]+/, "");
  if (ehTraco(t.split(/\s{2,}/)[0] ?? "")) return 0;
  return encontrarValores(t)[0]?.valor ?? null;
};

const extrairData: Extrator<string> = (s) => lerData(s);

const extrairDocumento: Extrator<DocumentoEncontrado> = (s) => encontrarDocumentos(s, true)[0] ?? null;

const extrairNumero: Extrator<string> = (s) => {
  for (const bruto of s.split(/\s+/)) {
    const t = bruto.replace(/^[:#º°.\-]+|[:,;.]+$/g, "");
    if (!/\d/.test(t) || !/^[0-9A-Za-z][0-9A-Za-z./\-]*$/.test(t)) continue;
    if (lerData(t) || /,\d{2}$/.test(t)) continue;
    return t;
  }
  return null;
};

const extrairTexto: Extrator<string> = (s) => {
  let t = s.replace(/^[\s:=\-–.]+/, "");
  t = t.split(/\s{2,}/)[0] ?? "";
  const doc = encontrarDocumentos(t, true)[0];
  if (doc) t = t.slice(0, doc.inicio);
  t = t.replace(/[\s,;-]*\b(?:CNPJ|CPF|C\.N\.P\.J\.?)(?:\s*\/\s*(?:MF|CPF|CNPJ))?\s*:?\s*$/i, "");
  t = t.replace(/[\s\-–:,;/]+$/, "");
  t = limparEspacos(t);
  if (!/[A-Za-zÀ-ú]{2}/.test(t)) return null;
  return t;
};

type Achado<T> = { valor: T; linha: number };

type OpcoesBusca = {
  faixa?: Faixa;
  mesmaLinha?: boolean;
  abaixo?: boolean;
  ignorar?: string[];
};

export function buscarRotulo<T>(
  doc: Doc,
  chaves: string[],
  extrair: Extrator<T>,
  opcoes: OpcoesBusca = {},
): Achado<T> | null {
  const de = opcoes.faixa?.de ?? 0;
  const ate = Math.min(opcoes.faixa?.ate ?? doc.linhas.length, doc.linhas.length);
  for (const chave of chaves) {
    for (let i = de; i < ate; i++) {
      const linha = doc.linhas[i];
      for (const oc of rotulosDaLinha(linha)) {
        if (oc.chave !== chave) continue;
        if (opcoes.mesmaLinha !== false) {
          const v = extrair(valorMesmaLinha(linha, oc, opcoes.ignorar));
          if (v !== null) return { valor: v, linha: i };
        }
        if (opcoes.abaixo !== false && i + 1 < ate) {
          const abaixo = valorAbaixo(doc, i, oc);
          const v = abaixo !== null ? extrair(abaixo) : null;
          if (v !== null) return { valor: v, linha: i + 1 };
        }
      }
    }
  }
  return null;
}

export const valorDe = (doc: Doc, chaves: string[], opcoes?: OpcoesBusca) =>
  buscarRotulo(doc, chaves, extrairValor, opcoes)?.valor ?? null;
export const dataDe = (doc: Doc, chaves: string[], opcoes?: OpcoesBusca) =>
  buscarRotulo(doc, chaves, extrairData, opcoes)?.valor ?? null;
export const textoDe = (doc: Doc, chaves: string[], opcoes?: OpcoesBusca) =>
  buscarRotulo(doc, chaves, extrairTexto, opcoes)?.valor ?? null;
export const numeroDe = (doc: Doc, chaves: string[], opcoes?: OpcoesBusca) =>
  buscarRotulo(doc, chaves, extrairNumero, opcoes)?.valor ?? null;
export const documentoDe = (doc: Doc, chaves: string[], opcoes?: OpcoesBusca) =>
  buscarRotulo(doc, chaves, extrairDocumento, {
    ignorar: ["CNPJ", "CPF", "CNPJ_CPF"],
    ...opcoes,
  })?.valor ?? null;
