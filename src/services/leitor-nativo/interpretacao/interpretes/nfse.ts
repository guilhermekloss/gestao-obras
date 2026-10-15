/**
 * NFS-e: DANFSe do padrão nacional e leiautes municipais (São Paulo,
 * ABRASF...). Estratégia ancorada em rótulos e seções (prestador, tomador,
 * discriminação, valores), robusta a prefeituras diferentes.
 *
 * valorTotal = valor BRUTO do serviço (custo da obra); líquido e retenções
 * (ISS retido, INSS 11%, IR, PIS/COFINS/CSLL) vão para `observacoes`.
 */
import type { DocumentoLido } from "../../../leitura-documento";
import { documentoVazio, juntarObservacoes, positivoOuNull, type Ancoras } from "../comum";
import { dadosChaveNfse, documentoValido } from "../digitos";
import { acharLinha, type Doc, type Faixa } from "../documento";
import { arredondar2, formatarReais, limparEspacos, normalizarTexto } from "../normalizacao";
import {
  buscarRotulo,
  coberturaRotulos,
  dataDe,
  documentoDe,
  numeroDe,
  textoDe,
  valorDe,
  type Extrator,
} from "../rotulos";
import type { Resultado } from "./auxiliares";

const extrairTelefone: Extrator<string> = (s) => /\(?\d{2}\)?\s*\d{4,5}-?\d{4}(?!\d)/.exec(s)?.[0].trim() ?? null;

const INICIO_PRESTADOR =
  /PRESTADOR\s*(?:DE|DO)\s*SERVICOS?|EMITENTE\s*DA\s*NFS-?E|DADOS\s*DO\s*PRESTADOR|^\s*PRESTADOR\b/;
const INICIO_TOMADOR = /TOMADOR\s*(?:DE|DO)\s*SERVICOS?|DADOS\s*DO\s*TOMADOR|^\s*TOMADOR\b/;
const INICIO_DESCRICAO = /DISCRIMINACAO\s*DOS?\s*SERVICOS?|DESCRICAO\s*DOS?\s*SERVICOS?|DISCRIMINACAO\s*DO\s*SERVICO/;
const FIM_DESCRICAO =
  /VALOR\s*TOTAL|TRIBUTACAO|CODIGO\s*DO\s*SERVICO|\bINSS\b|\bIRRF\b|RETENC|OUTRAS\s*INFORMACOES|INFORMACOES\s*COMPLEMENTARES|DEDUCOES|BASE\s*DE\s*CALCULO|VALOR\s*D[OA]S?\s*SERVICOS?|\bISSQN\b|INTERMEDIARIO|TOTAIS\s*APROXIMADOS/;

/** Discriminação do serviço: texto depois do rótulo até o próximo bloco. */
function descricaoDoServico(doc: Doc): string | null {
  const i = acharLinha(doc, INICIO_DESCRICAO);
  if (i === -1) return null;
  const partes: string[] = [];
  const linhaRotulo = doc.linhas[i];
  const m = INICIO_DESCRICAO.exec(linhaRotulo.norm);
  if (m) {
    const resto = linhaRotulo.texto.slice(m.index + m[0].length).replace(/^[\s:\-–]+/, "");
    if (/[A-Za-z]{3}/.test(resto)) partes.push(resto);
  }
  for (let k = i + 1; k < Math.min(doc.linhas.length, i + 12); k++) {
    const l = doc.linhas[k];
    if (FIM_DESCRICAO.test(l.norm) || coberturaRotulos(l) > 0.5) break;
    // dados de pagamento/pedido depois da discriminação não fazem parte do serviço
    if (partes.length && /^\s*(?:PEDIDO|DADOS\s*BANCARIOS|BANCO\b|CHAVE\s*PIX|PIX\b|OBS)/.test(l.norm)) break;
    partes.push(l.texto);
  }
  const texto = limparEspacos(partes.join(" "));
  return texto ? texto.slice(0, 500) : null;
}

/** "Retido pelo Tomador", "Sim", "2 - Retido" → true; "Não Retido", "Não" → false. */
function indicaRetencao(s: string | null): boolean | null {
  if (!s) return null;
  const n = normalizarTexto(s);
  if (/NAO\s*RETIDO|^\s*NAO\b|^\s*1\s*-/.test(n)) return false;
  if (/RETIDO|^\s*SIM\b|^\s*[23]\s*-/.test(n)) return true;
  return null;
}

function faixaEntre(doc: Doc, de: number, fins: number[]): Faixa {
  const ate = fins.filter((f) => f > de).sort((a, b) => a - b)[0] ?? doc.linhas.length;
  return { de, ate };
}

export function interpretarNfse(doc: Doc, ancoras: Ancoras): Resultado {
  const lido: DocumentoLido = documentoVazio("NFSE");
  const notas: string[] = [];
  const daChave = ancoras.chaveNfse ? dadosChaveNfse(ancoras.chaveNfse) : null;

  const iPrest = acharLinha(doc, INICIO_PRESTADOR);
  const iTom = acharLinha(doc, INICIO_TOMADOR, iPrest + 1);
  const iInter = acharLinha(doc, /INTERMEDIARIO/, Math.max(iPrest, iTom) + 1);
  const iDesc = acharLinha(doc, INICIO_DESCRICAO);
  const iServ = acharLinha(
    doc,
    /SERVICO\s*PRESTADO|CODIGO\s*DO\s*SERVICO|TRIBUTACAO\s*MUNICIPAL/,
    Math.max(iPrest, iTom) + 1,
  );
  const limites = [iTom, iInter, iDesc, iServ];

  // Prestador (emitente)
  const faixaPrest =
    iPrest !== -1 ? faixaEntre(doc, iPrest, limites) : { de: 0, ate: iTom !== -1 ? iTom : doc.linhas.length };
  const docPrest = documentoDe(doc, ["CNPJ_CPF", "CNPJ", "CPF"], {
    faixa: faixaPrest,
  });
  const candidatosPrest = ancoras.documentos.filter((d) => d.linha >= faixaPrest.de && d.linha < faixaPrest.ate);
  let documento = docPrest?.valor ?? candidatosPrest.find((d) => d.valido)?.valor ?? candidatosPrest[0]?.valor ?? null;
  if (daChave && documentoValido(daChave.documento) && (!documento || !documentoValido(documento)))
    documento = daChave.documento;
  lido.emitente.documento = documento;
  lido.emitente.nome = textoDe(doc, ["NOME_RAZAO", "NOME"], {
    faixa: faixaPrest,
  });
  lido.emitente.telefone = buscarRotulo(doc, ["FONE"], extrairTelefone, { faixa: faixaPrest })?.valor ?? null;

  // Tomador (destinatário)
  if (iTom !== -1) {
    const faixaTom = faixaEntre(doc, iTom, [iInter, iDesc, iServ]);
    const d = documentoDe(doc, ["CNPJ_CPF", "CNPJ", "CPF"], {
      faixa: faixaTom,
    });
    const candidatos = ancoras.documentos.filter((x) => x.linha >= faixaTom.de && x.linha < faixaTom.ate);
    lido.destinatario.documento = d?.valor ?? candidatos.find((x) => x.valido)?.valor ?? candidatos[0]?.valor ?? null;
    lido.destinatario.nome = textoDe(doc, ["NOME_RAZAO", "NOME"], {
      faixa: faixaTom,
    });
  }

  // Número e data
  lido.numero = numeroDe(doc, ["NUMERO_NFSE"]) ?? (daChave ? daChave.numero : null);
  lido.dataEmissao = dataDe(doc, ["DATA_EMISSAO", "EMITIDA_EM"]);
  if (!lido.dataEmissao) {
    const competencia = dataDe(doc, ["COMPETENCIA"]);
    if (competencia) {
      lido.dataEmissao = competencia;
      notas.push("Data de emissão não encontrada; foi usada a data de competência.");
    }
  }

  // Valores
  const bruto = valorDe(doc, ["VALOR_SERVICO"]) ?? valorDe(doc, ["VALOR_TOTAL_NOTA"]) ?? valorDe(doc, ["VALOR_TOTAL"]);
  const liquido = valorDe(doc, ["VALOR_LIQUIDO"]);
  const descIncond = positivoOuNull(valorDe(doc, ["DESC_INCOND"]));
  const issApurado = valorDe(doc, ["V_ISSQN", "VALOR_ISS"]);
  let issRetido = positivoOuNull(valorDe(doc, ["ISS_RETIDO"]));
  const retencao =
    indicaRetencao(textoDe(doc, ["RETENCAO_ISSQN"])) ??
    indicaRetencao(
      buscarRotulo(doc, ["ISS_RETIDO"], (s) => (/[A-Za-z]{2}/.test(s) ? limparEspacos(s) : null))?.valor ?? null,
    );
  if (!issRetido && retencao && issApurado) issRetido = issApurado;
  const retidos: [string, number | null][] = [
    ["INSS retido", positivoOuNull(valorDe(doc, ["CP_RETIDA", "INSS"]))],
    ["IRRF retido", positivoOuNull(valorDe(doc, ["IRRF"]))],
    ["CSLL retida", positivoOuNull(valorDe(doc, ["CSLL"]))],
    ["COFINS retida", positivoOuNull(valorDe(doc, ["COFINS"]))],
    ["PIS retido", positivoOuNull(valorDe(doc, ["PIS"]))],
    ["contribuições sociais retidas", positivoOuNull(valorDe(doc, ["CS_RETIDAS"]))],
  ];
  const totalFederais = positivoOuNull(valorDe(doc, ["RET_FEDERAIS"]));

  if (bruto !== null && bruto > 0) {
    lido.valorTotal = descIncond ? arredondar2(bruto - descIncond) : bruto;
    lido.descontoGeral = descIncond;
  } else if (liquido) {
    notas.push("Valor bruto do serviço não encontrado; confira o total (foi lido só o valor líquido).");
  }

  const partes: string[] = [];
  if (issRetido) partes.push(`ISS retido ${formatarReais(issRetido)}`);
  for (const [rotulo, v] of retidos) if (v) partes.push(`${rotulo} ${formatarReais(v)}`);
  if (descIncond) partes.push(`desconto incondicionado ${formatarReais(descIncond)}`);
  const temLiquido = liquido !== null && liquido > 0 && (bruto === null || Math.abs(liquido - bruto) > 0.005);
  if (bruto && (temLiquido || partes.length)) {
    const lista =
      partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : (partes[0] ?? "");
    const inicio = temLiquido ? `Valor líquido ${formatarReais(liquido!)}` : "Retenções";
    notas.push(
      `${inicio}${lista ? `: ${lista}` : ""}. O total lançado é o valor bruto do serviço (${formatarReais(bruto)}).`,
    );
  }
  if (bruto && liquido) {
    const federais = totalFederais ?? retidos.reduce((s, [, v]) => s + (v ?? 0), 0);
    const esperado = arredondar2(bruto - (descIncond ?? 0) - (issRetido ?? 0) - federais);
    if (Math.abs(esperado - liquido) > 0.02)
      notas.push("O valor líquido não fecha com o bruto menos as retenções lidas; confira.");
  }

  // Item: a discriminação do serviço
  const descricao = descricaoDoServico(doc);
  if (descricao && bruto) {
    lido.itens = [
      {
        descricao,
        quantidade: null,
        unidade: null,
        valorUnitario: null,
        desconto: null,
        valorTotal: bruto,
        tipo: "SERVICO",
      },
    ];
  } else if (!descricao) {
    notas.push("Discriminação do serviço não identificada na leitura.");
  }

  // Forma de pagamento: a NFS-e não tem campo próprio; texto livre ("pagamento por
  // transferência em até 10 dias") é condição comercial, não meio de pagamento — fica NAO_INFORMADA.

  lido.observacoes = juntarObservacoes(notas);
  return { lido };
}
