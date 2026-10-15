import type { DocumentoLido } from "../../../leitura-documento";
import {
  avisosDeMarca,
  documentoVazio,
  formaPagamentoDoTexto,
  juntarObservacoes,
  positivoOuNull,
  tipoDoItem,
  type Ancoras,
  type Item,
} from "../comum";
import { cnpjValido, cpfValido, dadosChaveNfe } from "../digitos";
import { acharLinha, textoDasLinhas, type Doc, type Faixa } from "../documento";
import {
  arredondar2,
  corrigirOcrNumerico,
  encontrarDatas,
  formatarReais,
  lerDecimal,
  lerValor,
  limparEspacos,
} from "../normalizacao";
import { coberturaRotulos, dataDe, documentoDe, textoDe, valorDe } from "../rotulos";
import { parcelasDoTrecho, telefoneDoTrecho, type Resultado } from "./auxiliares";

// CNPJ, ou CPF de produtor rural ("000" + CPF), embutido na chave.
export function documentoDaChave(chave: string | null): string | null {
  if (!chave) return null;
  const c = dadosChaveNfe(chave).cnpj;
  if (cnpjValido(c)) return c;
  if (c.startsWith("000") && cpfValido(c.slice(3))) return c.slice(3);
  return null;
}

function mesAnoDaChave(chave: string | null): string | null {
  if (!chave) return null;
  const d = dadosChaveNfe(chave);
  return `${d.ano}-${String(d.mes).padStart(2, "0")}`;
}

const NUMERICO = /^-?\d[\d.]*,\d+$/;

type LinhaProduto = {
  codigo: string;
  descricao: string;
  ncm: string;
  cst: string;
  cfop: string;
  unidade: string;
  numeros: string[];
  iDescricao: number;
  iNcm: number;
};

// Âncora: NCM (8) + CST (3–4) + CFOP (4, começa por 1–7); à esquerda é código + descrição.
export function lerLinhaProduto(texto: string): LinhaProduto | null {
  const tokens = texto.trim().split(/\s+/);
  const num = (t: string) => corrigirOcrNumerico(t);
  for (let k = 1; k + 7 <= tokens.length; k++) {
    const ncm = num(tokens[k]);
    if (!/^(?:\d{8}|\d{4}\.\d{2}\.\d{2}|00)$/.test(ncm)) continue;
    const cst = num(tokens[k + 1] ?? "");
    const cfop = num(tokens[k + 2] ?? "");
    const un = tokens[k + 3] ?? "";
    if (!/^\d{2,4}$/.test(cst) || !/^[1-7]\d{3}$/.test(cfop)) continue;
    if (!/^[A-Za-z][A-Za-z0-9²³.]{0,5}$/.test(un)) continue;
    const numeros = tokens.slice(k + 4).map(num);
    if (numeros.length < 3 || !numeros.every((t) => NUMERICO.test(t))) continue;
    const descricao = tokens.slice(1, k).join(" ");
    return {
      codigo: tokens[0],
      descricao: k > 1 ? descricao : tokens[0],
      ncm: ncm.replace(/\./g, ""),
      cst,
      cfop,
      unidade: un.toUpperCase(),
      numeros,
      iDescricao: 1,
      iNcm: k,
    };
  }
  return null;
}

const CABECALHO_PRODUTOS = /C[OÓ]DIGO\s*(?:DO\s*)?PRODUTO|DESCRICAO\s*DO\s*PRODUTO|NCM\s*\/?\s*SH/;
const FIM_TABELA = /CALCULO\s*DO\s*ISSQN|DADOS\s*ADICIONAIS|INFORMACOES\s*COMPLEMENTARES|RESERVADO\s*AO\s*FISCO/;
const INICIO_TABELA = /DADOS\s*DOS?\s*PRODUTOS?/;
const COLUNA_DESCONTO = /\bV(?:ALOR|L)?\.?\s*DESC(?:ONTO|\.)?\b(?!RI)|\bDESCONTO\b/;

type ItensDanfe = { itens: Item[]; temTabela: boolean; somaBruta: number };

function lerItens(doc: Doc): ItensDanfe {
  const itens: Item[] = [];
  let temTabela = false;
  let naTabela = false;
  let colunaDesconto = false;
  let somaBruta = 0;
  let ultimo: {
    item: Item;
    x0Descricao: number | null;
    x0Ncm: number | null;
  } | null = null;
  let pularAte = -1;
  for (const linha of doc.linhas) {
    if (linha.indice <= pularAte) continue;
    const n = linha.norm;
    if (INICIO_TABELA.test(n)) {
      naTabela = true;
      temTabela = true;
      ultimo = null;
      continue;
    }
    if (!naTabela) continue;
    if (FIM_TABELA.test(n)) {
      naTabela = false;
      ultimo = null;
      continue;
    }
    if (CABECALHO_PRODUTOS.test(n)) {
      if (COLUNA_DESCONTO.test(n.replace(/DESCRICAO/g, ""))) colunaDesconto = true;
      ultimo = null;
      continue;
    }
    let p = lerLinhaProduto(linha.texto);
    if (!p && /(?:^|\s)\d{8}\s+\d{2,4}\s+[1-7]\d{3}(?:\s|$)/.test(linha.texto)) {
      const prox = doc.linhas[linha.indice + 1];
      const junto = prox ? lerLinhaProduto(`${linha.texto} ${prox.texto}`) : null;
      if (junto) {
        p = junto;
        pularAte = linha.indice + 1;
      }
    }
    if (p) {
      const quantidade = lerDecimal(p.numeros[0]);
      const unitario = lerDecimal(p.numeros[1]);
      const bruto = lerValor(p.numeros[2]);
      const resto = p.numeros.slice(3);
      const desconto = colunaDesconto || resto.length >= 6 ? lerValor(resto[0]) : null;
      const descontoItem = desconto && desconto > 0 ? desconto : null;
      if (bruto !== null) somaBruta += bruto;
      const item: Item = {
        descricao: limparEspacos(p.descricao),
        quantidade,
        unidade: p.unidade,
        valorUnitario: unitario,
        desconto: descontoItem,
        valorTotal: bruto === null ? null : arredondar2(bruto - (descontoItem ?? 0)),
        tipo: tipoDoItem(p.descricao, "MATERIAL", p.cfop),
      };
      itens.push(item);
      const t = linha.tokens;
      ultimo = {
        item,
        x0Descricao: t[p.iDescricao]?.x0 ?? null,
        x0Ncm: t[p.iNcm]?.x0 ?? null,
      };
      continue;
    }
    if (!ultimo) continue;
    if (coberturaRotulos(linha) > 0.5) continue;
    const numericos = linha.tokens.filter((t) => NUMERICO.test(t.texto)).length;
    if (numericos >= 3) {
      ultimo = null;
      continue;
    }
    const x0 = linha.tokens[0]?.x0 ?? null;
    if (x0 !== null && ultimo.x0Descricao !== null) {
      const tol = 0.02;
      if (x0 < ultimo.x0Descricao - tol || (ultimo.x0Ncm !== null && x0 >= ultimo.x0Ncm)) continue;
    }
    ultimo.item.descricao = limparEspacos(`${ultimo.item.descricao} ${linha.texto}`);
  }
  return { itens, temTabela, somaBruta: arredondar2(somaBruta) };
}

function nomeDoCanhoto(doc: Doc): string | null {
  const ate = Math.min(doc.linhas.length, 4);
  const texto = doc.linhas
    .slice(0, ate)
    .map((l) => l.texto)
    .join(" ");
  const norm = doc.linhas
    .slice(0, ate)
    .map((l) => l.norm)
    .join(" ");
  const m = /RECEBEMOS\s*DE\s+(.+?)\s+OS\s*PRODUTOS/.exec(norm);
  if (!m) return null;
  const inicio = m.index + m[0].indexOf(m[1]);
  return limparEspacos(texto.slice(inicio, inicio + m[1].length)) || null;
}

function nomeDoTopo(doc: Doc, ate: number): string | null {
  for (let i = 0; i < Math.min(ate, doc.linhas.length); i++) {
    const l = doc.linhas[i];
    if (
      /RECEBEMOS|DATA\s*DE\s*RECEBIMENTO|IDENTIFICACAO\s*E\s*ASSINATURA|ELETRONICA\s*INDICADA|IDENTIFICACAO\s*DO\s*EMITENTE/.test(
        l.norm,
      )
    )
      continue;
    const primeira = l.texto.split(/\s{2,}/)[0] ?? "";
    const n = l.norm.slice(0, primeira.length);
    if (/DANFE|DOCUMENTO\s*AUXILIAR|NOTA\s*FISCAL|CHAVE|^\s*N[º°O]|SERIE|FOLHA|ENTRADA|SAIDA/.test(n)) continue;
    if (coberturaRotulos(l) > 0.3) continue;
    const letras = primeira.replace(/[^A-Za-zÀ-ú]/g, "").length;
    const digitos = primeira.replace(/\D/g, "").length;
    if (primeira.trim().split(/\s+/).length >= 2 && letras >= 6 && digitos <= letras / 4)
      return limparEspacos(primeira);
  }
  return null;
}

function numeroESerie(doc: Doc, ate: number): { numero: string | null; serie: string | null } {
  let numero: string | null = null;
  let serie: string | null = null;
  for (let i = 0; i < Math.min(ate, doc.linhas.length); i++) {
    const l = doc.linhas[i];
    if (!numero) {
      const m =
        /\bN\s*[º°O.]?\s*[:.]?\s*(\d{3}\.\d{3}\.\d{3})/.exec(l.norm) ??
        /(?:NF-?E|DANFE)?\s*\bN\s*[º°O]\s*\.?\s*:?\s*(\d{1,9})\b/.exec(l.norm);
      if (m) {
        const ini = m.index + m[0].lastIndexOf(m[1]);
        numero = l.texto.slice(ini, ini + m[1].length);
      }
    }
    if (!serie) {
      const s = /\bSERIE\s*:?\s*(\d{1,3})\b/.exec(l.norm);
      if (s) serie = s[1];
    }
    if (numero && serie) break;
  }
  return { numero, serie };
}

export function interpretarDanfe(doc: Doc, ancoras: Ancoras): Resultado {
  const lido: DocumentoLido = documentoVazio("NFE");
  const notas: string[] = [...avisosDeMarca(doc)];
  const fim = doc.linhas.length;

  let iDest = acharLinha(doc, /DESTINATARIO\s*\/\s*REMETENTE/);
  if (iDest === -1) iDest = acharLinha(doc, /^\s*DESTINATARIO\b(?!\s*:)/);
  const iCalc = acharLinha(doc, /CALCULO\s*DO\s*IMPOSTO/);
  const iFatura = acharLinha(doc, /\bFATURA\b|DUPLICATAS?\b/, iDest === -1 ? 0 : iDest);
  const iTransp = acharLinha(doc, /TRANSPORTADOR/, iCalc === -1 ? 0 : iCalc);
  const iProd = acharLinha(doc, INICIO_TABELA);
  const iAdic = acharLinha(doc, /DADOS\s*ADICIONAIS|INFORMACOES\s*COMPLEMENTARES/);
  const fimTopo = iDest !== -1 ? iDest : iCalc !== -1 ? iCalc : Math.min(fim, 15);

  lido.chaveAcesso = ancoras.chave ?? ancoras.chaveInvalida;
  const docChave = documentoDaChave(ancoras.chave);

  lido.emitente.nome = nomeDoCanhoto(doc) ?? nomeDoTopo(doc, fimTopo);
  const candidatos = ancoras.documentos.filter((d) => d.linha < fimTopo);
  const rotulado = documentoDe(doc, ["CNPJ", "CNPJ_CPF"], {
    faixa: { de: 0, ate: fimTopo },
  });
  if (docChave && candidatos.some((d) => d.valor === docChave)) lido.emitente.documento = docChave;
  else if (rotulado?.valido) lido.emitente.documento = rotulado.valor;
  else if (docChave) lido.emitente.documento = docChave;
  else
    lido.emitente.documento =
      rotulado?.valor ?? candidatos.find((d) => d.valido)?.valor ?? candidatos[0]?.valor ?? null;
  lido.emitente.telefone = telefoneDoTrecho(textoDasLinhas(doc, 0, fimTopo));

  const ns = numeroESerie(doc, fimTopo === fim ? Math.min(fim, 15) : fimTopo);
  lido.numero = ns.numero;
  lido.serie = ns.serie;
  const fimDest = [iFatura, iCalc, iTransp, iProd].filter((i) => i > iDest).sort((a, b) => a - b)[0] ?? fim;
  const faixaDest: Faixa | null = iDest !== -1 ? { de: iDest, ate: fimDest } : null;
  lido.dataEmissao =
    (faixaDest ? dataDe(doc, ["DATA_EMISSAO"], { faixa: faixaDest }) : null) ?? dataDe(doc, ["DATA_EMISSAO"]) ?? null;
  const mesChave = mesAnoDaChave(ancoras.chave);
  if (!lido.dataEmissao && mesChave) {
    lido.dataEmissao = encontrarDatas(doc.textoCompleto).find((d) => d.valor.startsWith(mesChave))?.valor ?? null;
  }

  if (faixaDest) {
    lido.destinatario.nome = textoDe(doc, ["NOME_RAZAO"], { faixa: faixaDest });
    const d = documentoDe(doc, ["CNPJ_CPF", "CNPJ", "CPF"], {
      faixa: faixaDest,
    });
    const doBloco = ancoras.documentos.filter((x) => x.linha >= faixaDest.de && x.linha < faixaDest.ate);
    lido.destinatario.documento = d?.valor ?? doBloco.find((x) => x.valido)?.valor ?? doBloco[0]?.valor ?? null;
  }

  const faixaTotais: Faixa | undefined =
    iCalc !== -1
      ? {
          de: iCalc,
          ate: [iTransp, iProd, iAdic].filter((i) => i > iCalc).sort((a, b) => a - b)[0] ?? fim,
        }
      : undefined;
  const total = (chaves: string[]) => valorDe(doc, chaves, { faixa: faixaTotais });
  const vNF =
    total(["V_NF"]) ??
    valorDe(doc, ["V_NF"]) ??
    valorDe(doc, ["VALOR_TOTAL"], { faixa: { de: 0, ate: Math.min(4, fim) } });
  const vProd = total(["V_PROD"]);
  const vFrete = total(["V_FRETE"]);
  const vDesc = total(["DESCONTO"]);
  const outras = [
    total(["V_SEGURO"]),
    total(["OUTRAS_DESPESAS"]),
    total(["V_IPI"]),
    total(["V_ST"]),
    total(["V_FCP_ST"]),
    total(["V_II"]),
  ];
  lido.valorTotal = positivoOuNull(vNF);
  lido.valorFrete = positivoOuNull(vFrete);
  lido.valorOutrasDespesas = positivoOuNull(arredondar2(outras.reduce<number>((s, v) => s + (v ?? 0), 0)));

  const { itens, temTabela, somaBruta } = lerItens(doc);
  lido.itens = itens;
  const descontoNosItens = itens.some((i) => i.desconto);
  lido.descontoGeral = descontoNosItens ? null : positivoOuNull(vDesc);
  if (itens.length === 0) {
    notas.push(
      temTabela
        ? "Itens não identificados na leitura; confira a tabela de produtos."
        : "Quadro de produtos não encontrado na leitura; confira os itens.",
    );
  } else if (vProd && Math.abs(somaBruta - vProd) > 0.01) {
    notas.push(
      `A soma dos itens lidos (${formatarReais(somaBruta)}) difere do total dos produtos impresso (${formatarReais(vProd)}); alguma linha pode não ter sido lida.`,
    );
  }

  if (lido.valorTotal && vProd) {
    const esperado = arredondar2(vProd - (vDesc ?? 0) + (lido.valorFrete ?? 0) + (lido.valorOutrasDespesas ?? 0));
    if (Math.abs(esperado - lido.valorTotal) > 0.02) {
      notas.push("Os valores do quadro de totais não fecham com o total da nota; confira frete, impostos e desconto.");
    }
  }

  if (iFatura !== -1 && iFatura > iDest) {
    const fimFatura =
      [iCalc, iTransp, iProd].filter((i) => i > iFatura).sort((a, b) => a - b)[0] ?? Math.min(fim, iFatura + 6);
    lido.parcelas = parcelasDoTrecho(doc, { de: iFatura, ate: fimFatura });
  }

  const trechos = [
    iFatura !== -1 && iFatura > iDest ? textoDasLinhas(doc, iFatura, iCalc > iFatura ? iCalc : iFatura + 4) : "",
    iAdic !== -1 ? textoDasLinhas(doc, iAdic, fim) : "",
  ].join("\n");
  lido.formaPagamento = formaPagamentoDoTexto(trechos);

  let incompleto = false;
  const folhas = [...doc.normCompleto.matchAll(/\b(?:FOLHA|FL\.?)\s*(\d{1,2})\s*\/\s*(\d{1,2})/g)];
  if (folhas.length) {
    const totalFolhas = Math.max(...folhas.map((f) => Number(f[2])));
    const lidas = new Set(folhas.map((f) => Number(f[1])));
    if (lidas.size < totalFolhas) {
      incompleto = true;
      notas.push(`O DANFE tem ${totalFolhas} folhas e só ${lidas.size} foi(ram) lida(s); itens podem estar faltando.`);
    }
  }

  lido.observacoes = juntarObservacoes(notas);
  return { lido, incompleto };
}
