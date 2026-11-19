// XML da NFS-e do padrão nacional (leiaute 1.01, com o grupo IBS/CBS da reforma). Mesmas defesas do leitor da NF-e
// (lerArvoreXml) e a mesma ideia: o servidor relê o XML; a prévia do client é só para mostrar.
//
// Valores: o custo da obra é o valor do serviço (menos descontos), não o líquido. A construtora paga o líquido ao
// prestador e recolhe as retenções em guia; somando as duas coisas dá o mesmo valor, então a nota entra pelo bruto
// (itens = total) e as parcelas separam o que vai ao prestador do que vira guia (ISS e federais).
import type { FormaPagto } from "@prisma/client";
import { formatarMoeda } from "@/lib/format";
import { calcularTotalItem } from "./rateio";
import { extrairCnos, formatarCno, normalizarCno } from "./cno";
import {
  DESCRICAO_IBS_CBS_POR_FORA,
  centavosOuNulo,
  lerArvoreXml,
  no,
  percentual,
  somaOuNulo,
  texto,
  type ItemNfe,
  type No,
} from "./nfe-xml";
import type { CrtEmitente, TotaisIbsCbs, TributacaoIbsCbs } from "./tributacao/ibs-cbs";

export type ItemNfse = ItemNfe & {
  /** Código NBS do serviço (cServ/cNBS). */
  nbs: string | null;
};

/** Pessoa como aparece no DANFSe (prestador ou tomador). */
export type PessoaNfse = {
  /** CNPJ/CPF só com dígitos (ou o NIF, para estrangeiro); nulo quando a nota não identifica. */
  documento: string | null;
  nome: string | null;
  inscricaoMunicipal: string | null;
  fone: string | null;
  email: string | null;
  /** Logradouro, número, complemento e bairro numa linha. */
  endereco: string | null;
  /** Código IBGE do município (cMun). */
  codigoMunicipio: string | null;
  uf: string | null;
  cep: string | null;
};

export type EmitenteNfse = PessoaNfse & {
  documento: string;
  tipoDocumento: "CNPJ" | "CPF";
  razaoSocial: string;
  nomeFantasia: string | null;
};

/** Situação do prestador perante o Simples (prest/regTrib), como veio na DPS. */
export type RegimePrestadorNfse = {
  /** 1 não optante, 2 MEI, 3 ME/EPP. */
  opSimpNac: string | null;
  /** Só para ME/EPP: 1 tudo pelo SN, 2 ISS por fora, 3 federais e ISS por fora (sublimite/limite ultrapassado). */
  regApTribSN: string | null;
  regEspTrib: string | null;
};

/** O que a construtora (tomadora) retém e recolhe em guia, derivado do valor líquido da nota. */
export type RetencoesNfse = {
  /** ISS retido (tpRetISSQN 2 ou 3): guia do município. */
  issCents: number;
  /** Retenções federais (INSS, IRRF, PIS/COFINS/CSLL): DARF. */
  federaisCents: number;
  /** Detalhe das federais, como informado na nota. */
  inssCents: number;
  irrfCents: number;
  /** O restante das federais: contribuições sociais (PIS/COFINS/CSLL). */
  contribuicoesCents: number;
  totalCents: number;
};

export type ParcelaNfse = {
  numero: number;
  valorCents: number;
  vencimento: string;
  rotulo: string;
};

export type Nfse = {
  /** Chave de acesso da NFS-e (50 dígitos, sem o prefixo "NFS"). */
  chave: string;
  numero: string;
  dps: { serie: string | null; numero: string | null; emitidaEm: string | null };
  /** Data e hora de geração da NFS-e (dhProc), como veio. */
  emitidaEm: string | null;
  /** aaaa-mm-dd no fuso do emissor: a emissão da NFS-e, como impressa no DANFSe. */
  dataEmissao: string;
  /** Início da prestação (dCompet), aaaa-mm-dd. */
  dataCompetencia: string | null;
  /** cStat (100 = NFS-e gerada). */
  situacao: string | null;
  /** tpAmb 2: emitida em homologação, sem validade jurídica. */
  homologacao: boolean;
  emitente: EmitenteNfse;
  regime: RegimePrestadorNfse;
  tomador: PessoaNfse | null;
  /** CNPJ/CPF do tomador, só dígitos (o "destinatário" da NF-e). */
  destinatario: string | null;
  servico: {
    codigoTributacaoNacional: string | null;
    codigoTributacaoMunicipal: string | null;
    /** xTribNac / xTribMun: descrição do código de tributação. */
    descricaoTributacao: string | null;
    nbs: string | null;
    descricaoNbs: string | null;
    descricao: string;
    localPrestacao: string | null;
    municipioIncidencia: string | null;
    informacoesComplementares: string | null;
    /** Grupo serv/obra: CNO/CEI, CIB ou inscrição imobiliária. */
    obra: { codigo: string | null; cib: string | null; inscricaoImobiliaria: string | null } | null;
  };
  issqn: {
    /** tribISSQN: 1 tributável, 2 imunidade, 3 exportação, 4 não incidência. */
    tributacao: string | null;
    /** tpRetISSQN: 1 não retido, 2 retido pelo tomador, 3 retido pelo intermediário. */
    tipoRetencao: string | null;
    retido: boolean;
    baseCents: number | null;
    aliquota: string | null;
    valorCents: number | null;
    deducoesCents: number | null;
  };
  valores: {
    servicoCents: number;
    descontoIncondicionadoCents: number;
    descontoCondicionadoCents: number;
    liquidoCents: number;
    /** vTotalRet como veio (nem toda emissão preenche). */
    totalRetencoesXmlCents: number | null;
  };
  /** tribFed como veio, para mostrar (o cálculo das guias usa `retencoes`). */
  federais: {
    irrfCents: number | null;
    cpCents: number | null;
    csllCents: number | null;
    pisCents: number | null;
    cofinsCents: number | null;
    tipoRetencaoPisCofins: string | null;
  };
  retencoes: RetencoesNfse;
  /** IBS/CBS no formato do item da NF-e (CST/cClassTrib da DPS, valores apurados pela Sefin). */
  ibsCbs: TributacaoIbsCbs | null;
  /** Dados do IBS/CBS só da NFS-e, para o DANFSe. */
  ibsCbsNfse: {
    indicadorOperacao: string | null;
    codigoLocalidade: string | null;
    localidade: string | null;
    pAliqEfetUf: string | null;
    pAliqEfetMun: string | null;
    pAliqEfetCbs: string | null;
    /** vTotNF: líquido + IBS/CBS por fora (igual ao líquido em 2026). */
    vTotNfCents: number | null;
  } | null;
  totaisIbsCbs: TotaisIbsCbs | null;
  crtEmitente: CrtEmitente | null;
  cno: string | null;
  itens: ItemNfse[];
  /** Total da nota = custo: serviço − descontos + IBS/CBS por fora. Igual à soma dos itens e das parcelas. */
  totalCents: number;
  /** O que vai ao prestador: líquido + IBS/CBS por fora (vTotNF). */
  aPagarPrestadorCents: number;
  parcelas: ParcelaNfse[];
  formaPagto: FormaPagto;
  avisos: string[];
};

type ResultadoNfse = { ok: true; nfse: Nfse } | { ok: false; erro: string };

const NAO_E_NFSE = "O arquivo não é o XML de uma NFS-e do padrão nacional (esperado <NFSe> com <infNFSe>).";

const MAX_DESCRICAO_ITEM = 500;

/** O XML parece de NFS-e nacional (tem infNFSe)? Decide qual leitor usar, sem montar a árvore. */
export function pareceNfse(xml: string): boolean {
  return /<(?:[\w.-]+:)?infNFSe[\s>/]/.test(xml);
}

// Simples Nacional na DPS → CRT da NF-e, para o resto do app tratar os dois documentos igual.
// Não optante = regime normal (3); MEI = 4; ME/EPP = 1, ou 2 quando apura algo por fora do SN (sublimite).
export function crtDoRegime(regime: Pick<RegimePrestadorNfse, "opSimpNac" | "regApTribSN">): CrtEmitente | null {
  switch (regime.opSimpNac) {
    case "1":
      return "3";
    case "2":
      return "4";
    case "3":
      return regime.regApTribSN === "2" || regime.regApTribSN === "3" ? "2" : "1";
    default:
      return null;
  }
}

/** Mesmo dia do mês seguinte ao de `data` (aaaa-mm-dd), para o vencimento das guias. */
export function diaDoMesSeguinte(data: string, dia: number): string {
  const [ano, mes] = data.split("-").map(Number);
  const proximo = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  return `${proximo.ano}-${String(proximo.mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Prazos usuais: ISS retido no dia 10 do mês seguinte (o mais cedo entre as capitais; cada município tem o seu)
// e INSS/IRRF/CSRF retidos no dia 20 (DCTFWeb). Melhor avisar cedo que perder o prazo; o aviso pede conferência.
const DIA_GUIA_ISS = 10;
const DIA_GUIA_FEDERAIS = 20;

function pessoa(n: No | undefined, endereco: No | undefined, municipio: No | undefined): PessoaNfse {
  const linha = [texto(endereco, "xLgr"), texto(endereco, "nro"), texto(endereco, "xCpl"), texto(endereco, "xBairro")]
    .filter(Boolean)
    .join(", ");
  return {
    documento: (texto(n, "CNPJ") ?? texto(n, "CPF") ?? texto(n, "NIF"))?.toUpperCase().replace(/[^0-9A-Z]/g, "") || null,
    nome: texto(n, "xNome") ?? null,
    inscricaoMunicipal: texto(n, "IM") ?? null,
    fone: texto(n, "fone") ?? null,
    email: texto(n, "email") ?? null,
    endereco: linha || null,
    codigoMunicipio: texto(municipio, "cMun") ?? null,
    uf: texto(municipio, "UF") ?? null,
    cep: texto(municipio, "CEP") ?? texto(endereco, "CEP") ?? null,
  };
}

function dataDe(dataHora: string | undefined): string | null {
  const d = (dataHora ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function truncar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// IBS/CBS: a classificação (CST, cClassTrib, crédito presumido) é declarada na DPS; base, alíquotas e valores
// vêm do grupo que a Sefin calcula (infNFSe/IBSCBS). Sem CST ou cClassTrib não há o que conferir (como na NF-e).
function lerIbsCbsNfse(gerado: No | undefined, declarado: No | undefined): TributacaoIbsCbs | null {
  const sitClas = no(no(no(declarado?.valores)?.trib)?.gIBSCBS);
  const cst = texto(sitClas, "CST");
  const cClassTrib = texto(sitClas, "cClassTrib");
  if (!cst || !cClassTrib) return null;

  const valores = no(gerado?.valores);
  const uf = no(valores?.uf);
  const mun = no(valores?.mun);
  const fed = no(valores?.fed);
  const tot = no(gerado?.totCIBS);
  const gIbs = no(tot?.gIBS);
  const ibsUf = no(gIbs?.gIBSUFTot);
  const ibsMun = no(gIbs?.gIBSMunTot);
  const gCbs = no(tot?.gCBS);
  return {
    cst,
    cClassTrib,
    ibsCbsBaseCents: centavosOuNulo(valores, "vBC"),
    pCbs: percentual(fed, "pCBS"),
    pIbsUf: percentual(uf, "pIBSUF"),
    pIbsMun: percentual(mun, "pIBSMun"),
    pRedCbs: percentual(fed, "pRedAliqCBS"),
    pRedIbs: percentual(uf, "pRedAliqUF") ?? percentual(mun, "pRedAliqMun"),
    cbsCents: centavosOuNulo(gCbs, "vCBS"),
    ibsUfCents: centavosOuNulo(ibsUf, "vIBSUF"),
    ibsMunCents: centavosOuNulo(ibsMun, "vIBSMun"),
    ibsCbsDiferidoCents: somaOuNulo([
      centavosOuNulo(ibsUf, "vDifUF"),
      centavosOuNulo(ibsMun, "vDifMun"),
      centavosOuNulo(gCbs, "vDifCBS"),
    ]),
    cCredPres: texto(sitClas, "cCredPres") ?? null,
    credPresCents: somaOuNulo([
      centavosOuNulo(no(gIbs?.gIBSCredPres), "vCredPresIBS"),
      centavosOuNulo(no(gCbs?.gCBSCredPres), "vCredPresCBS"),
    ]),
  };
}

function totaisDoItem(t: TributacaoIbsCbs | null): TotaisIbsCbs | null {
  if (!t) return null;
  return {
    ibsCbsBaseCents: t.ibsCbsBaseCents ?? 0,
    cbsCents: t.cbsCents ?? 0,
    ibsUfCents: t.ibsUfCents ?? 0,
    ibsMunCents: t.ibsMunCents ?? 0,
    ibsCbsDiferidoCents: t.ibsCbsDiferidoCents ?? 0,
    credPresCents: t.credPresCents ?? 0,
    cbsMonoCents: 0,
    ibsMonoCents: 0,
  };
}

// A NFS-e tem um serviço só; o CNO vem no grupo de obra e, quando não vem, costuma estar no texto livre.
function cnosDaNfse(obra: No | undefined, textos: (string | undefined)[], avisos: string[]): string[] {
  const codigo = texto(obra, "cObra");
  const doGrupo = normalizarCno(codigo);
  if (codigo && !doGrupo) {
    avisos.push(`O código da obra na nota (${codigo}) não é um CNO de 12 dígitos; confira a obra no rateio.`);
  }
  return [...new Set([...(doGrupo ? [doGrupo] : []), ...textos.flatMap((t) => extrairCnos(t))])];
}

export function parseNfseXml(xml: string): ResultadoNfse {
  const arvore = lerArvoreXml(xml, NAO_E_NFSE);
  if (!arvore.ok) return arvore;

  const inf = no(no(arvore.raiz.NFSe)?.infNFSe);
  if (!inf) return { ok: false, erro: NAO_E_NFSE };

  const chave = (texto(inf, "@_Id") ?? "").replace(/^NFS/, "");
  if (!/^\d{50}$/.test(chave)) {
    return { ok: false, erro: "Chave de acesso ausente ou inválida (infNFSe/@Id deve ter 50 dígitos)." };
  }

  const numero = texto(inf, "nNFSe")?.replace(/^0+(?=\d)/, "");
  if (!numero) return { ok: false, erro: "NFS-e sem número (infNFSe/nNFSe)." };

  const dps = no(no(inf.DPS)?.infDPS);
  if (!dps) return { ok: false, erro: "NFS-e sem a DPS (infNFSe/DPS/infDPS)." };

  const emitidaEm = texto(inf, "dhProc") ?? null;
  const dataEmissao = dataDe(emitidaEm ?? undefined) ?? dataDe(texto(dps, "dhEmi"));
  if (!dataEmissao) return { ok: false, erro: "NFS-e sem data de emissão válida (infNFSe/dhProc)." };

  const emit = no(inf.emit);
  const cnpj = texto(emit, "CNPJ");
  const cpf = texto(emit, "CPF");
  const razaoSocial = texto(emit, "xNome");
  if (!(cnpj || cpf) || !razaoSocial) {
    return { ok: false, erro: "NFS-e sem emitente identificado (emit/CNPJ e emit/xNome)." };
  }
  const enderEmit = no(emit?.enderNac);
  const emitente: EmitenteNfse = {
    ...pessoa(emit, enderEmit, enderEmit),
    documento: (cnpj ?? cpf)!.replace(/\D/g, ""),
    tipoDocumento: cnpj ? "CNPJ" : "CPF",
    razaoSocial,
    nomeFantasia: texto(emit, "xFant") ?? null,
  };

  const avisos: string[] = [];
  // a chave carrega a inscrição do emitente (posições 10–23) e o número (24–36): divergência indica XML adulterado
  if (chave.slice(9, 23) !== emitente.documento.padStart(14, "0") || chave.slice(23, 36) !== numero.padStart(13, "0")) {
    avisos.push("A chave de acesso não confere com o emitente ou o número da nota; confira o XML com o prestador.");
  }
  const homologacao = texto(dps, "tpAmb") === "2";
  if (homologacao) avisos.push("NFS-e emitida em ambiente de homologação (teste): não tem validade jurídica.");
  const situacao = texto(inf, "cStat") ?? null;
  if (situacao === "101" || situacao === "102") {
    avisos.push(
      `A NFS-e consta como ${situacao === "101" ? "cancelada" : "substituída"} (cStat ${situacao}): confirme com o prestador antes de lançar.`,
    );
  }

  const regTrib = no(no(dps.prest)?.regTrib);
  const regime: RegimePrestadorNfse = {
    opSimpNac: texto(regTrib, "opSimpNac") ?? null,
    regApTribSN: texto(regTrib, "regApTribSN") ?? null,
    regEspTrib: texto(regTrib, "regEspTrib") ?? null,
  };

  const toma = no(dps.toma);
  const endToma = no(toma?.end);
  const tomador = toma ? pessoa(toma, endToma, no(endToma?.endNac)) : null;

  const serv = no(dps.serv);
  const cServ = no(serv?.cServ);
  const obra = no(serv?.obra);
  const infoCompl = no(serv?.infoCompl);
  const xDescServ = texto(cServ, "xDescServ")?.replace(/\s+/g, " ");
  const descricaoTributacao = texto(inf, "xTribMun") ?? texto(inf, "xTribNac") ?? null;
  const descricaoCompleta = xDescServ ?? descricaoTributacao ?? "Serviço (NFS-e)";
  const nbs = texto(cServ, "cNBS") ?? null;

  // valores da DPS (declarados) e da NFS-e (apurados pela Sefin)
  const valDps = no(dps.valores);
  const valNfse = no(inf.valores);
  const descontos = no(valDps?.vDescCondIncond);
  const tribMun = no(no(valDps?.trib)?.tribMun);
  const tribFed = no(no(valDps?.trib)?.tribFed);
  const pisCofins = no(tribFed?.piscofins);

  const servicoCents = centavosOuNulo(no(valDps?.vServPrest), "vServ") ?? 0;
  if (servicoCents <= 0) return { ok: false, erro: "NFS-e sem valor do serviço (DPS/valores/vServPrest/vServ)." };
  const liquidoXml = centavosOuNulo(valNfse, "vLiq");
  if (liquidoXml === null) return { ok: false, erro: "NFS-e sem valor líquido (infNFSe/valores/vLiq)." };
  const descontoIncondicionadoCents = centavosOuNulo(descontos, "vDescIncond") ?? 0;
  const descontoCondicionadoCents = centavosOuNulo(descontos, "vDescCond") ?? 0;
  const descontoCents = descontoIncondicionadoCents + descontoCondicionadoCents;
  if (descontoCents > servicoCents) {
    return { ok: false, erro: "Os descontos da NFS-e são maiores que o valor do serviço." };
  }
  const servicoLiquidoCents = servicoCents - descontoCents;

  // Retido = o que sai do serviço e não vai ao prestador. Vem do líquido, que a Sefin calcula: os campos de
  // retenção federal mudaram de sentido entre versões (vRetCSLL já foi o total da CSRF), o líquido não.
  const tipoRetencaoIss = texto(tribMun, "tpRetISSQN") ?? null;
  const issRetido = tipoRetencaoIss === "2" || tipoRetencaoIss === "3";
  const issCents = centavosOuNulo(valNfse, "vISSQN");
  let liquidoCents = liquidoXml;
  let retidoCents = servicoLiquidoCents - liquidoXml;
  if (retidoCents < 0) {
    avisos.push(
      `O valor líquido (${formatarMoeda(liquidoXml)}) é maior que o valor do serviço menos descontos (${formatarMoeda(servicoLiquidoCents)}); foi usado o valor do serviço. Confira com o prestador.`,
    );
    liquidoCents = servicoLiquidoCents;
    retidoCents = 0;
  }
  let issRetidoCents = issRetido ? (issCents ?? 0) : 0;
  if (issRetidoCents > retidoCents) {
    avisos.push("O ISS retido é maior que a diferença entre o serviço e o valor líquido; confira as retenções.");
    issRetidoCents = retidoCents;
  }
  const federaisCents = retidoCents - issRetidoCents;
  const cpCents = centavosOuNulo(tribFed, "vRetCP");
  const irrfCents = centavosOuNulo(tribFed, "vRetIRRF");
  const csllCents = centavosOuNulo(tribFed, "vRetCSLL");
  const tipoRetencaoPisCofins = texto(pisCofins, "tpRetPisCofins") ?? null;
  // NT 008 (DANFSe): com tpRetPisCofins 1 o PIS/COFINS informado é o retido e entra nas contribuições retidas
  const pisCofinsRetidoCents =
    tipoRetencaoPisCofins === "1" ? (centavosOuNulo(pisCofins, "vPis") ?? 0) + (centavosOuNulo(pisCofins, "vCofins") ?? 0) : 0;
  const federaisInformadosCents = (cpCents ?? 0) + (irrfCents ?? 0) + (csllCents ?? 0) + pisCofinsRetidoCents;
  if (federaisInformadosCents > 0 && federaisInformadosCents !== federaisCents) {
    avisos.push(
      `As retenções federais informadas (${formatarMoeda(federaisInformadosCents)}) não fecham com o valor líquido da nota (${formatarMoeda(federaisCents)} retidos); as parcelas seguem o valor líquido. Confira com o prestador.`,
    );
  }
  const inssCents = Math.min(cpCents ?? 0, federaisCents);
  const irrfRetidoCents = Math.min(irrfCents ?? 0, federaisCents - inssCents);
  const retencoes: RetencoesNfse = {
    issCents: issRetidoCents,
    federaisCents,
    inssCents,
    irrfCents: irrfRetidoCents,
    contribuicoesCents: federaisCents - inssCents - irrfRetidoCents,
    totalCents: retidoCents,
  };

  const gerado = no(inf.IBSCBS);
  const declarado = no(dps.IBSCBS);
  const ibsCbs = lerIbsCbsNfse(gerado, declarado);
  const totCIBS = no(gerado?.totCIBS);
  const vTotNfCents = centavosOuNulo(totCIBS, "vTotNF");
  // a partir de 2027 vTotNF = líquido + IBS/CBS (por fora): a diferença também é paga ao prestador
  const porForaCents = vTotNfCents !== null && vTotNfCents > liquidoXml ? vTotNfCents - liquidoXml : 0;
  const valoresIbsCbs = no(gerado?.valores);

  const itens: ItemNfse[] = [
    {
      descricao: truncar(descricaoCompleta, MAX_DESCRICAO_ITEM),
      // código interno do prestador: faz o papel do cProd da NF-e no vínculo com o catálogo
      codigo: texto(cServ, "cIntContrib") ?? null,
      ncm: null,
      nbs,
      qtde: 1,
      unidade: "UN",
      unitCents: servicoCents,
      descontoCents,
      totalCents: calcularTotalItem(1, servicoCents, descontoCents),
      origem: "PRODUTO",
      tipoSugerido: "SERVICO",
      ...(ibsCbs ? { ibsCbs } : {}),
    },
  ];
  if (descricaoCompleta.length > MAX_DESCRICAO_ITEM) {
    avisos.push("A descrição do serviço é longa e foi resumida no item; o texto completo continua no XML anexado.");
  }
  // IBS/CBS por fora: item próprio, custo até virar crédito (ver tributacao/credito.ts), como na NF-e
  if (porForaCents > 0) {
    itens.push({
      descricao: DESCRICAO_IBS_CBS_POR_FORA,
      codigo: null,
      ncm: null,
      nbs: null,
      qtde: 1,
      unidade: "UN",
      unitCents: porForaCents,
      descontoCents: 0,
      totalCents: porForaCents,
      origem: "ACESSORIO",
      tipoSugerido: "ENCARGO",
    });
  }

  const aPagarPrestadorCents = liquidoCents + porForaCents;
  const totalCents = aPagarPrestadorCents + retidoCents;

  const competencia = dataDe(texto(dps, "dCompet"));
  const baseGuias = competencia ?? dataEmissao;
  const parcelas: ParcelaNfse[] = [
    {
      numero: 1,
      valorCents: aPagarPrestadorCents,
      vencimento: dataEmissao,
      rotulo: porForaCents > 0 ? "Prestador (valor líquido + IBS/CBS)" : "Prestador (valor líquido)",
    },
  ];
  if (retencoes.issCents > 0) {
    parcelas.push({
      numero: parcelas.length + 1,
      valorCents: retencoes.issCents,
      vencimento: diaDoMesSeguinte(baseGuias, DIA_GUIA_ISS),
      rotulo: "Guia do ISS retido",
    });
  }
  if (retencoes.federaisCents > 0) {
    parcelas.push({
      numero: parcelas.length + 1,
      valorCents: retencoes.federaisCents,
      vencimento: diaDoMesSeguinte(baseGuias, DIA_GUIA_FEDERAIS),
      rotulo: "DARF das retenções federais",
    });
  }
  if (retencoes.totalCents > 0) avisos.push(avisoDeRetencoes(retencoes, parcelas));

  const cnos = cnosDaNfse(obra, [texto(infoCompl, "xInfComp"), xDescServ, texto(infoCompl, "docRef")], avisos);
  if (cnos.length > 1) {
    avisos.push(`A nota cita mais de um CNO (${cnos.map(formatarCno).join(", ")}); foi usado o primeiro — confira a obra.`);
  }

  return {
    ok: true,
    nfse: {
      chave,
      numero,
      dps: { serie: texto(dps, "serie") ?? null, numero: texto(dps, "nDPS") ?? null, emitidaEm: texto(dps, "dhEmi") ?? null },
      emitidaEm,
      dataEmissao,
      dataCompetencia: competencia,
      situacao,
      homologacao,
      emitente,
      regime,
      tomador,
      destinatario: tomador?.documento ?? null,
      servico: {
        codigoTributacaoNacional: texto(cServ, "cTribNac") ?? null,
        codigoTributacaoMunicipal: texto(cServ, "cTribMun") ?? null,
        descricaoTributacao,
        nbs,
        descricaoNbs: texto(inf, "xNBS") ?? null,
        descricao: descricaoCompleta,
        localPrestacao: texto(inf, "xLocPrestacao") ?? null,
        municipioIncidencia: texto(inf, "xLocIncid") ?? null,
        informacoesComplementares: texto(infoCompl, "xInfComp") ?? null,
        obra: obra
          ? {
              codigo: texto(obra, "cObra") ?? null,
              cib: texto(obra, "cCIB") ?? null,
              inscricaoImobiliaria: texto(obra, "inscImobFisc") ?? null,
            }
          : null,
      },
      issqn: {
        tributacao: texto(tribMun, "tribISSQN") ?? null,
        tipoRetencao: tipoRetencaoIss,
        retido: issRetido,
        baseCents: centavosOuNulo(valNfse, "vBC"),
        aliquota: percentual(valNfse, "pAliqAplic"),
        valorCents: issCents,
        deducoesCents: centavosOuNulo(valNfse, "vCalcDR") ?? centavosOuNulo(no(valDps?.vDedRed), "vDR"),
      },
      valores: {
        servicoCents,
        descontoIncondicionadoCents,
        descontoCondicionadoCents,
        liquidoCents: liquidoXml,
        totalRetencoesXmlCents: centavosOuNulo(valNfse, "vTotalRet"),
      },
      federais: {
        irrfCents,
        cpCents,
        csllCents,
        pisCents: centavosOuNulo(pisCofins, "vPis"),
        cofinsCents: centavosOuNulo(pisCofins, "vCofins"),
        tipoRetencaoPisCofins,
      },
      retencoes,
      ibsCbs,
      ibsCbsNfse: gerado
        ? {
            indicadorOperacao: texto(declarado, "cIndOp") ?? null,
            codigoLocalidade: texto(gerado, "cLocalidadeIncid") ?? null,
            localidade: texto(gerado, "xLocalidadeIncid") ?? null,
            pAliqEfetUf: percentual(no(valoresIbsCbs?.uf), "pAliqEfetUF"),
            pAliqEfetMun: percentual(no(valoresIbsCbs?.mun), "pAliqEfetMun"),
            pAliqEfetCbs: percentual(no(valoresIbsCbs?.fed), "pAliqEfetCBS"),
            vTotNfCents,
          }
        : null,
      totaisIbsCbs: totaisDoItem(ibsCbs),
      crtEmitente: crtDoRegime(regime),
      cno: cnos[0] ?? null,
      itens,
      totalCents,
      aPagarPrestadorCents,
      parcelas,
      // a NFS-e não informa como o serviço é pago: o mesmo padrão da NF-e sem detPag
      formaPagto: "BOLETO",
      avisos,
    },
  };
}

function detalheFederais(r: RetencoesNfse): string {
  const detalhe = [
    r.inssCents > 0 && `INSS ${formatarMoeda(r.inssCents)}`,
    r.irrfCents > 0 && `IRRF ${formatarMoeda(r.irrfCents)}`,
    r.contribuicoesCents > 0 && `PIS/COFINS/CSLL ${formatarMoeda(r.contribuicoesCents)}`,
  ].filter(Boolean);
  return `federais ${formatarMoeda(r.federaisCents)}${detalhe.length ? ` (${detalhe.join(", ")})` : ""}`;
}

function avisoDeRetencoes(r: RetencoesNfse, parcelas: ParcelaNfse[]): string {
  const onde = (rotulo: string) => {
    const p = parcelas.find((x) => x.rotulo === rotulo);
    return p ? ` na parcela ${p.numero}, vencendo em ${p.vencimento.split("-").reverse().join("/")}` : "";
  };
  const partes: string[] = [];
  if (r.issCents > 0) {
    partes.push(`ISS retido ${formatarMoeda(r.issCents)}${onde("Guia do ISS retido")} (confira o prazo do município)`);
  }
  if (r.federaisCents > 0) partes.push(`${detalheFederais(r)}${onde("DARF das retenções federais")}`);
  return `Retenções que a obra recolhe em guia, não pagas ao prestador: ${partes.join("; ")}. O custo da obra continua sendo o valor do serviço.`;
}

/** Observação gravada na nota: as parcelas não têm descrição, então o texto diz o que é guia. */
export function observacaoDaNfse(nfse: Pick<Nfse, "dataCompetencia" | "retencoes">): string {
  const c = nfse.dataCompetencia;
  const base = `Importada do XML da NFS-e${c ? ` (competência ${c.slice(5, 7)}/${c.slice(0, 4)})` : ""}`;
  const r = nfse.retencoes;
  if (r.totalCents === 0) return base;
  const partes = [r.issCents > 0 && `ISS retido ${formatarMoeda(r.issCents)}`, r.federaisCents > 0 && detalheFederais(r)];
  return `${base}. Retenções a recolher em guia, não pagas ao prestador: ${partes.filter(Boolean).join("; ")}.`;
}
