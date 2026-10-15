/**
 * Documentos do corpus: os dados (verdade de referência, no formato
 * `DocumentoLido`) e o modelo HTML/CSS que imita o leiaute real de cada um.
 *
 * Os dados são a fonte: o HTML é gerado a partir deles, e o `esperado.json`
 * é exatamente o objeto `esperado` (validado contra `documentoLidoSchema`).
 * Todos os nomes são fictícios; CNPJ/CPF/chaves/linhas têm DV calculado em
 * `aritmetica.ts`.
 */
import type { DocumentoLido } from "@/services/leitura-documento";
import {
  completarChave,
  completarChaveNfse,
  completarCnpj,
  completarCpf,
  dataBr,
  dataPorExtenso,
  decimal,
  fmtCnpj,
  fmtCpf,
  grupos4,
  hashQrV2,
  mesAno,
  moeda,
  montarArrecadacao,
  montarBoleto,
  numeroNf,
  reaisPorExtenso,
} from "./aritmetica";
import { svgCodigo, type FormatoEscrita } from "./codigos";

type Pagina = "A4" | "A5-paisagem" | "cupom-80mm";

export type ParametrosFoto = {
  /** graus, positivo = horário */
  angulo: number;
  /** sigma do desfoque gaussiano */
  desfoque: number;
  /** 0..1: quanto escurece o canto mais sombreado */
  sombra: number;
  /** direção da sombra (graus do gradiente) */
  direcaoSombra: number;
  /** cisalhamento leve (perspectiva aproximada) */
  cisalhamento: number;
  qualidade: number;
  /** cor do fundo (mesa) em volta do papel */
  fundo: string;
  /** cor do papel */
  papel?: string;
};

export type DocCorpus = {
  id: string;
  titulo: string;
  /** o que o fixture exercita (vai para o README) */
  exercita: string[];
  pagina: Pagina;
  esperado: DocumentoLido;
  html: string;
  /** códigos impressos — o gerador confere que decodificam de volta */
  codigos: { formato: FormatoEscrita; texto: string }[];
  /** trechos que precisam estar na camada de texto do PDF */
  textosNoPdf: string[];
  foto: ParametrosFoto;
};

// ---------------------------------------------------------------------------
// Partes comuns (fictícias)

const CNPJ_EMITENTE = completarCnpj("112223330001"); // 11.222.333/0001-81 (da especificação)
const CNPJ_CONSTRUTORA = completarCnpj("987654320001"); // 98.765.432/0001-98
const CNPJ_TRANSPORTADORA = completarCnpj("456789010001");
const CPF_CONSUMIDOR = completarCpf("123456789"); // 123.456.789-09
const CPF_PEDREIRO = completarCpf("529982247"); // 529.982.247-25

const CONSTRUTORA = {
  nome: "CONSTRUTORA EXEMPLO LTDA",
  endereco: "AV. DO CANTEIRO, 500",
  bairro: "JARDIM OBRA",
  cep: "04001-000",
  municipio: "SAO PAULO",
  uf: "SP",
  fone: "(11) 5555-6666",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const reais = (c: number) => c / 100;

function pagina(css: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${css}</style></head><body>${corpo}</body></html>`;
}

/** Célula de DANFE: rótulo pequeno em cima, valor embaixo. */
function cx(rotulo: string, valor: string, attrs = "", classeValor = "") {
  return `<td ${attrs}><div class="r">${rotulo}</div><div class="v ${classeValor}">${valor || "&nbsp;"}</div></td>`;
}

// ---------------------------------------------------------------------------
// 1. DANFE NF-e (modelo 55), A4 retrato

type ItemNfe = {
  cod: string;
  desc: string;
  ncm: string;
  cst: string;
  cfop: string;
  un: string;
  qtd: number;
  unit: number;
  aliqIpi?: number;
};

const CSS_DANFE = `
@page{size:A4;margin:0}
body{font-family:"Liberation Sans",Arial,sans-serif}
.folha{width:210mm;height:297mm;padding:6mm 7mm 6mm 7mm;overflow:hidden}
table.g{width:100%;border-collapse:collapse;table-layout:fixed}
table.g td{border:0.7pt solid #000;padding:0.5mm 1mm 0.6mm;vertical-align:top;overflow:hidden}
.r{font-size:5.4pt;line-height:1.2;text-transform:uppercase;white-space:nowrap}
.v{font-size:7.8pt;line-height:1.3;white-space:nowrap;min-height:10pt}
.dir{text-align:right}
.cen{text-align:center}
.t{font-size:6.6pt;font-weight:bold;margin:1.6mm 0 0.4mm;text-transform:uppercase}
.corte{border-top:0.8pt dashed #000;margin:2mm 0 2mm}
.canhoto .txt{font-size:6.4pt;line-height:1.3}
.nfc{text-align:center;font-size:9pt;font-weight:bold;vertical-align:middle!important;line-height:1.35}
.emit-nome{font-size:11pt;font-weight:bold;margin:2.5mm 0 2mm;line-height:1.2;text-align:center}
.emit-end{font-size:7.4pt;line-height:1.45;text-align:center}
.danfe{text-align:center}
.danfe-t{font-size:15pt;font-weight:bold;margin-top:1mm}
.danfe .sub{font-size:6.4pt;line-height:1.25;margin:0.6mm 0 1.4mm}
.es{display:flex;justify-content:center;align-items:center;gap:2mm;font-size:6.6pt;line-height:1.3;text-align:left}
.es .box{border:0.8pt solid #000;width:5mm;height:5mm;display:inline-flex;align-items:center;justify-content:center;font-size:9pt;font-weight:bold}
.danfe .num{font-size:8.6pt;font-weight:bold;line-height:1.35;margin-top:1.6mm}
.direita{padding:0!important}
.direita>div{border-bottom:0.7pt solid #000;padding:0.6mm 1.2mm}
.direita>div:last-child{border-bottom:0}
.barras{height:13mm;padding:1.2mm 4mm!important}
.chave{font-size:8.6pt;font-weight:bold;letter-spacing:0.15pt;text-align:center;margin-top:0.4mm}
.consulta{font-size:7pt;text-align:center;line-height:1.35}
.dup{display:flex;gap:1.2mm}
.dup>div{border:0.7pt solid #000;padding:0.6mm 1.4mm;font-size:7pt;line-height:1.35;width:40mm}
table.prod{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.5pt}
table.prod th{border:0.7pt solid #000;font-weight:normal;font-size:5.3pt;padding:0.5mm 0.6mm;text-transform:uppercase;vertical-align:middle;line-height:1.15}
table.prod td{border-left:0.7pt solid #000;border-right:0.7pt solid #000;border-bottom:0.5pt dotted #777;padding:0.6mm 0.6mm;vertical-align:top;line-height:1.3}
table.prod td.n{text-align:right;white-space:nowrap}
table.prod td.c{text-align:center}
table.prod tr.vazio td{height:52mm;border-bottom:0.7pt solid #000}
.adic{height:30mm}
.adic .v{white-space:normal;font-size:6.8pt;line-height:1.35}
`;

async function montarNfe(): Promise<DocCorpus> {
  const emitente = {
    nome: "DEPOSITO DE MATERIAIS FICTICIOS LTDA",
    endereco: "RUA DAS PEDRAS, 100 - CENTRO",
    cidade: "SAO PAULO - SP CEP 01001-000",
    fone: "(11) 3333-4444",
    ie: "110.042.490.114",
  };
  const emissao = "2026-09-15";
  const nNF = 12345;
  const serie = 1;
  // cUF 35 · AAMM 2609 · CNPJ · mod 55 · série 001 · nNF · tpEmis 1 · cNF 87654321
  const chave = completarChave(`352609${CNPJ_EMITENTE}55${"001"}${String(nNF).padStart(9, "0")}1${"87654321"}`);

  const itens: ItemNfe[] = [
    { cod: "000123", desc: "CIMENTO CP II-F-32 50KG", ncm: "25232910", cst: "060", cfop: "5405", un: "SC", qtd: 20, unit: 32.9 },
    {
      cod: "000456",
      desc: "VERGALHAO CA-50 10,0MM BARRA 12M NERVURADO - FEIXE COM 10 BARRAS",
      ncm: "72142000", cst: "000", cfop: "5102", un: "BR", qtd: 15, unit: 38.5,
    },
    { cod: "000789", desc: "AREIA MEDIA LAVADA", ncm: "25051000", cst: "000", cfop: "5102", un: "M3", qtd: 3.5, unit: 120 },
    { cod: "001010", desc: "BLOCO CONCRETO ESTRUTURAL 14X19X39CM", ncm: "68101100", cst: "000", cfop: "5102", un: "UN", qtd: 200, unit: 3.85 },
    { cod: "001122", desc: "TUBO PVC ESGOTO SERIE NORMAL 100MM 6M", ncm: "39172300", cst: "000", cfop: "5102", un: "BR", qtd: 6, unit: 64.9, aliqIpi: 5 },
    { cod: "001234", desc: "ARGAMASSA AC-II CINZA 20KG", ncm: "32149000", cst: "000", cfop: "5102", un: "SC", qtd: 12, unit: 24.75 },
    { cod: "001300", desc: "PREGO 17X21 COM CABECA", ncm: "73170020", cst: "000", cfop: "5102", un: "KG", qtd: 5.5, unit: 18.9 },
  ];
  const linhas = itens.map((it) => {
    const total = Math.round(it.qtd * it.unit * 100);
    const temIcms = it.cst !== "060";
    const bc = temIcms ? total : 0;
    const icms = temIcms ? Math.round(total * 0.18) : 0;
    const ipi = it.aliqIpi ? Math.round((total * it.aliqIpi) / 100) : 0;
    return { ...it, total, bc, icms, ipi, aliqIcms: temIcms ? 18 : 0 };
  });
  const vProd = linhas.reduce((a, l) => a + l.total, 0);
  const vBc = linhas.reduce((a, l) => a + l.bc, 0);
  const vIcms = linhas.reduce((a, l) => a + l.icms, 0);
  const vIpi = linhas.reduce((a, l) => a + l.ipi, 0);
  const vFrete = 12000;
  const vNF = vProd + vFrete + vIpi;
  const dup1 = Math.ceil(vNF / 2);
  const dup2 = vNF - dup1;
  const parcelas = [
    { num: "001", venc: "2026-10-15", valor: dup1 },
    { num: "002", venc: "2026-11-14", valor: dup2 },
  ];
  const vTrib = Math.round(vNF * 0.1628);

  const svg = await svgCodigo(chave, "Code128");

  const esperado: DocumentoLido = {
    tipo: "NFE",
    legibilidade: "BOA",
    emitente: { nome: emitente.nome, documento: CNPJ_EMITENTE, telefone: emitente.fone },
    destinatario: { nome: CONSTRUTORA.nome, documento: CNPJ_CONSTRUTORA },
    numero: numeroNf(nNF),
    serie: "001",
    chaveAcesso: chave,
    dataEmissao: emissao,
    valorTotal: reais(vNF),
    valorFrete: reais(vFrete),
    valorOutrasDespesas: reais(vIpi),
    descontoGeral: null,
    formaPagamento: "BOLETO",
    itens: linhas.map((l) => ({
      descricao: l.desc,
      quantidade: l.qtd,
      unidade: l.un,
      valorUnitario: l.unit,
      desconto: null,
      valorTotal: reais(l.total),
      tipo: "MATERIAL" as const,
    })),
    parcelas: parcelas.map((p) => ({ vencimento: p.venc, valor: reais(p.valor) })),
    observacoes: null,
  };

  const corpo = `<div class="folha">
<table class="g canhoto"><colgroup><col style="width:24%"><col style="width:58%"><col style="width:18%"></colgroup>
<tr><td colspan="2"><div class="txt">RECEBEMOS DE ${esc(emitente.nome)} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: ${dataBr(emissao)} VALOR TOTAL: R$ ${moeda(vNF)} DESTINATÁRIO: ${esc(CONSTRUTORA.nome)} - ${CONSTRUTORA.endereco} ${CONSTRUTORA.bairro} ${CONSTRUTORA.municipio}-${CONSTRUTORA.uf}</div></td>
<td rowspan="2" class="nfc">NF-e<br>Nº ${numeroNf(nNF)}<br>SÉRIE ${String(serie).padStart(3, "0")}</td></tr>
<tr>${cx("DATA DE RECEBIMENTO", "")}${cx("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", "")}</tr>
</table>
<div class="corte"></div>
<table class="g"><colgroup><col style="width:37%"><col style="width:18%"><col style="width:45%"></colgroup>
<tr>
<td><div class="r">IDENTIFICAÇÃO DO EMITENTE</div>
<div class="emit-nome">${esc(emitente.nome)}</div>
<div class="emit-end">${emitente.endereco}<br>${emitente.cidade}<br>FONE: ${emitente.fone}</div></td>
<td class="danfe"><div class="danfe-t">DANFE</div>
<div class="sub">DOCUMENTO AUXILIAR DA<br>NOTA FISCAL ELETRÔNICA</div>
<div class="es"><span>0 - ENTRADA<br>1 - SAÍDA</span><span class="box">1</span></div>
<div class="num">Nº ${numeroNf(nNF)}<br>SÉRIE ${String(serie).padStart(3, "0")}<br>FOLHA 1/1</div></td>
<td class="direita"><div class="barras">${svg}</div>
<div><div class="r">CHAVE DE ACESSO</div><div class="chave">${grupos4(chave)}</div></div>
<div class="consulta">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</div></td>
</tr></table>
<table class="g"><colgroup><col style="width:55%"><col style="width:45%"></colgroup><tr>
${cx("NATUREZA DA OPERAÇÃO", "VENDA DE MERCADORIA")}
${cx("PROTOCOLO DE AUTORIZAÇÃO DE USO", `135260001234567 ${dataBr(emissao)} 10:21:33`, "", "cen")}
</tr></table>
<table class="g"><colgroup><col style="width:33%"><col style="width:34%"><col style="width:33%"></colgroup><tr>
${cx("INSCRIÇÃO ESTADUAL", emitente.ie)}${cx("INSCRIÇÃO ESTADUAL DO SUBST. TRIB.", "")}${cx("CNPJ", fmtCnpj(CNPJ_EMITENTE))}
</tr></table>

<div class="t">DESTINATÁRIO / REMETENTE</div>
<table class="g"><colgroup><col style="width:56%"><col style="width:26%"><col style="width:18%"></colgroup><tr>
${cx("NOME / RAZÃO SOCIAL", CONSTRUTORA.nome)}${cx("CNPJ / CPF", fmtCnpj(CNPJ_CONSTRUTORA))}${cx("DATA DA EMISSÃO", dataBr(emissao), "", "cen")}
</tr></table>
<table class="g"><colgroup><col style="width:44%"><col style="width:26%"><col style="width:12%"><col style="width:18%"></colgroup><tr>
${cx("ENDEREÇO", CONSTRUTORA.endereco)}${cx("BAIRRO / DISTRITO", CONSTRUTORA.bairro)}${cx("CEP", CONSTRUTORA.cep)}${cx("DATA DA SAÍDA/ENTRADA", dataBr(emissao), "", "cen")}
</tr></table>
<table class="g"><colgroup><col style="width:34%"><col style="width:22%"><col style="width:6%"><col style="width:20%"><col style="width:18%"></colgroup><tr>
${cx("MUNICÍPIO", CONSTRUTORA.municipio)}${cx("FONE / FAX", CONSTRUTORA.fone)}${cx("UF", CONSTRUTORA.uf)}${cx("INSCRIÇÃO ESTADUAL", "ISENTO")}${cx("HORA DA SAÍDA/ENTRADA", "10:30:00", "", "cen")}
</tr></table>

<div class="t">FATURA / DUPLICATA</div>
<div class="dup">${parcelas
    .map((p) => `<div>Num. ${p.num}<br>Venc. ${dataBr(p.venc)}<br>Valor R$ ${moeda(p.valor)}</div>`)
    .join("")}</div>

<div class="t">CÁLCULO DO IMPOSTO</div>
<table class="g"><tr>
${cx("BASE DE CÁLC. DO ICMS", moeda(vBc), "", "dir")}${cx("VALOR DO ICMS", moeda(vIcms), "", "dir")}${cx("BASE DE CÁLC. ICMS S.T.", "0,00", "", "dir")}${cx("VALOR DO ICMS SUBST.", "0,00", "", "dir")}${cx("V. TOTAL PRODUTOS", moeda(vProd), "", "dir")}
</tr></table>
<table class="g"><tr>
${cx("VALOR DO FRETE", moeda(vFrete), "", "dir")}${cx("VALOR DO SEGURO", "0,00", "", "dir")}${cx("DESCONTO", "0,00", "", "dir")}${cx("OUTRAS DESPESAS", "0,00", "", "dir")}${cx("VALOR TOTAL IPI", moeda(vIpi), "", "dir")}${cx("V. TOTAL DA NOTA", `<b>${moeda(vNF)}</b>`, "", "dir")}
</tr></table>

<div class="t">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
<table class="g"><colgroup><col style="width:32%"><col style="width:17%"><col style="width:12%"><col style="width:13%"><col style="width:5%"><col style="width:21%"></colgroup><tr>
${cx("NOME / RAZÃO SOCIAL", "TRANSPORTES FICTICIOS LTDA")}${cx("FRETE POR CONTA", "0-Remetente (CIF)")}${cx("CÓDIGO ANTT", "")}${cx("PLACA DO VEÍCULO", "ABC1D23")}${cx("UF", "SP")}${cx("CNPJ / CPF", fmtCnpj(CNPJ_TRANSPORTADORA))}
</tr></table>
<table class="g"><tr>
${cx("QUANTIDADE", "1")}${cx("ESPÉCIE", "CARGA")}${cx("MARCA", "")}${cx("NUMERAÇÃO", "")}${cx("PESO BRUTO", "4.870,000", "", "dir")}${cx("PESO LÍQUIDO", "4.850,000", "", "dir")}
</tr></table>

<div class="t">DADOS DO PRODUTO / SERVIÇO</div>
<table class="prod"><colgroup>
<col style="width:12mm"><col style="width:56mm"><col style="width:13mm"><col style="width:8mm"><col style="width:8mm"><col style="width:7mm"><col style="width:13mm"><col style="width:14mm"><col style="width:14mm"><col style="width:13mm"><col style="width:11mm"><col style="width:10mm"><col style="width:8.5mm"><col style="width:8.5mm">
</colgroup>
<tr><th>CÓDIGO PRODUTO</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>O/CST</th><th>CFOP</th><th>UN</th><th>QUANT</th><th>VALOR UNIT</th><th>VALOR TOTAL</th><th>BC ICMS</th><th>VALOR ICMS</th><th>VALOR IPI</th><th>ALÍQ. ICMS</th><th>ALÍQ. IPI</th></tr>
${linhas
    .map(
      (l) =>
        `<tr><td>${l.cod}</td><td>${esc(l.desc)}</td><td class="c">${l.ncm}</td><td class="c">${l.cst}</td><td class="c">${l.cfop}</td><td class="c">${l.un}</td><td class="n">${decimal(l.qtd, 4)}</td><td class="n">${decimal(l.unit, 4)}</td><td class="n">${moeda(l.total)}</td><td class="n">${moeda(l.bc)}</td><td class="n">${moeda(l.icms)}</td><td class="n">${moeda(l.ipi)}</td><td class="n">${decimal(l.aliqIcms, 2)}</td><td class="n">${decimal(l.aliqIpi ?? 0, 2)}</td></tr>`,
    )
    .join("\n")}
<tr class="vazio">${"<td></td>".repeat(14)}</tr>
</table>

<div class="t">DADOS ADICIONAIS</div>
<table class="g adic"><colgroup><col style="width:68%"><col style="width:32%"></colgroup><tr>
<td><div class="r">INFORMAÇÕES COMPLEMENTARES</div><div class="v">PAGAMENTO VIA BOLETO BANCARIO EM 2 PARCELAS (VER FATURA). PEDIDO 4471 - OBRA RESIDENCIAL JARDIM.<br>Valor aproximado dos tributos: R$ ${moeda(vTrib)} (16,28%) Fonte: IBPT.<br>ICMS recolhido por substituição tributária no item 000123 (CST 060).</div></td>
<td><div class="r">RESERVADO AO FISCO</div><div class="v"></div></td>
</tr></table>
</div>`;

  return {
    id: "nfe-materiais",
    titulo: "DANFE NF-e (modelo 55) — depósito de materiais, A4 retrato",
    exercita: [
      "blocos do DANFE em caixas (rótulo em cima, valor embaixo), canhoto no topo",
      `chave em 11 grupos de 4 + Code-128C da chave`,
      `7 itens com NCM/CST/CFOP/UN/QUANT(4 casas)/V.UNIT(4 casas)/V.TOTAL; item 2 com descrição que quebra em 2 linhas e contém "10,0MM"`,
      `quantidades fracionárias (3,5 M3; 5,5 KG); CST 060 sem BC`,
      `frete R$ ${moeda(vFrete)} + IPI R$ ${moeda(vIpi)} no quadro de totais (vNF = vProd + frete + IPI)`,
      "2 duplicatas; CNPJ do transportador como distrator; forma BOLETO só nas informações complementares",
    ],
    pagina: "A4",
    esperado,
    html: pagina(CSS_DANFE, corpo),
    codigos: [{ formato: "Code128", texto: chave }],
    textosNoPdf: [grupos4(chave), fmtCnpj(CNPJ_EMITENTE), moeda(vNF), "VERGALHAO CA-50", dataBr(emissao)],
    foto: { angulo: 2.4, desfoque: 0.9, sombra: 0.32, direcaoSombra: 35, cisalhamento: 0.012, qualidade: 70, fundo: "#6f5a45" },
  };
}

// ---------------------------------------------------------------------------
// 2. NFC-e (modelo 65) — cupom térmico 80 mm

const CSS_CUPOM = `
@page{size:80mm auto;margin:0}
body{font-family:"DejaVu Sans Mono","Liberation Mono",monospace;font-size:7pt;line-height:1.38;width:80mm}
.cupom{width:80mm;padding:4mm 4mm 6mm}
.c{text-align:center}
.b{font-weight:bold}
.lr{display:flex;justify-content:space-between;gap:2mm}
.sep{border-top:0.8pt dashed #000;margin:1.2mm 0}
.it{margin-bottom:0.6mm}
.it .q{padding-left:6mm}
.qr{width:31mm;height:31mm;margin:1.6mm auto}
.peq{font-size:6.3pt}
`;

async function montarNfce(): Promise<DocCorpus> {
  const emitente = {
    nome: "FERRAGENS FICTICIAS COMERCIO LTDA",
    fone: "(11) 2222-3333",
  };
  const emissao = "2026-10-15";
  const nNF = 789;
  const chave = completarChave(`352610${CNPJ_EMITENTE}65001${String(nNF).padStart(9, "0")}1${"13572468"}`);
  const hash = hashQrV2(chave, "1", "1", "0123456789ABCDEF0123456789ABCDEF");
  const urlQr = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${chave}|2|1|1|${hash}`;

  const itens = [
    { cod: "7891000100103", desc: "FITA VEDA ROSCA 18MMX25M", qtd: 2, un: "UN", unit: 6.9 },
    { cod: "7896543210987", desc: "LUVA PVC SOLDAVEL 25MM", qtd: 10, un: "UN", unit: 1.85 },
    { cod: "7890000000017", desc: "REGISTRO ESFERA 3/4 BRUTO", qtd: 1, un: "UN", unit: 42.7 },
    { cod: "7891234567895", desc: "ADESIVO PVC 175G", qtd: 1, un: "UN", unit: 19.9 },
    { cod: "7899876543210", desc: "JOELHO PVC 90 GRAUS 25MM", qtd: 4, un: "UN", unit: 2.15 },
  ].map((it) => ({ ...it, total: Math.round(it.qtd * it.unit * 100) }));
  const vProd = itens.reduce((a, it) => a + it.total, 0);
  const vDesc = 500;
  const vPagar = vProd - vDesc;

  const svgQr = await svgCodigo(urlQr, "QRCode", "ecLevel=M");

  const esperado: DocumentoLido = {
    tipo: "NFCE",
    legibilidade: "BOA",
    emitente: { nome: emitente.nome, documento: CNPJ_EMITENTE, telefone: emitente.fone },
    destinatario: { nome: null, documento: CPF_CONSUMIDOR },
    numero: String(nNF).padStart(9, "0"),
    serie: "001",
    chaveAcesso: chave,
    dataEmissao: emissao,
    valorTotal: reais(vPagar),
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: reais(vDesc),
    formaPagamento: "PIX",
    itens: itens.map((it) => ({
      descricao: it.desc,
      quantidade: it.qtd,
      unidade: it.un,
      valorUnitario: it.unit,
      desconto: null,
      valorTotal: reais(it.total),
      tipo: "MATERIAL" as const,
    })),
    parcelas: [],
    observacoes: null,
  };

  const corpo = `<div class="cupom">
<div class="c b">${emitente.nome}</div>
<div class="c">CNPJ: ${fmtCnpj(CNPJ_EMITENTE)} IE: 110.042.490.114</div>
<div class="c">RUA DO TUBO, 45 - VILA HIDRAULICA</div>
<div class="c">SAO PAULO - SP  FONE: ${emitente.fone}</div>
<div class="sep"></div>
<div class="c b">Documento Auxiliar da Nota Fiscal de<br>Consumidor Eletrônica</div>
<div class="sep"></div>
<div class="lr b"><span># CÓDIGO DESCRIÇÃO</span><span>QTD UN VL UNIT VL TOTAL</span></div>
${itens
    .map(
      (it, i) => `<div class="it"><div>${String(i + 1).padStart(3, "0")} ${it.cod} ${it.desc}</div>
<div class="lr q"><span>${decimal(it.qtd, 0)} ${it.un} x ${moeda(Math.round(it.unit * 100))}</span><span>${moeda(it.total)}</span></div></div>`,
    )
    .join("\n")}
<div class="sep"></div>
<div class="lr"><span>Qtde. total de itens</span><span>${itens.length}</span></div>
<div class="lr"><span>Valor total R$</span><span>${moeda(vProd)}</span></div>
<div class="lr"><span>Descontos R$</span><span>${moeda(vDesc)}</span></div>
<div class="lr b"><span>Valor a Pagar R$</span><span>${moeda(vPagar)}</span></div>
<div class="lr b"><span>FORMA PAGAMENTO</span><span>VALOR PAGO R$</span></div>
<div class="lr"><span>Pagamento Instantâneo (PIX)</span><span>${moeda(vPagar)}</span></div>
<div class="lr"><span>Troco R$</span><span>0,00</span></div>
<div class="sep"></div>
<div class="c b">Consulte pela Chave de Acesso em</div>
<div class="c">https://www.nfce.fazenda.sp.gov.br/consulta</div>
<div class="c">${grupos4(chave)}</div>
<div class="sep"></div>
<div class="c b">CONSUMIDOR - CPF ${fmtCpf(CPF_CONSUMIDOR)}</div>
<div class="sep"></div>
<div class="c b">NFC-e nº ${String(nNF).padStart(9, "0")} Série 001 ${dataBr(emissao)} 14:32:10</div>
<div class="c">Protocolo de Autorização: 135260004567890</div>
<div class="c">Data de Autorização: ${dataBr(emissao)} 14:32:12</div>
<div class="qr">${svgQr}</div>
<div class="c peq">Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ 15,23</div>
<div class="c peq">Obrigado pela preferência! Volte sempre.</div>
</div>`;

  return {
    id: "nfce-ferragens",
    titulo: "DANFE NFC-e (modelo 65) — cupom térmico 80 mm",
    exercita: [
      "fonte monoespaçada de impressora térmica; itens em 2 linhas (código+descrição / qtd UN x unit  total)",
      `desconto no total (R$ ${moeda(vDesc)}) — Σ itens R$ ${moeda(vProd)} ≠ Valor a Pagar R$ ${moeda(vPagar)}`,
      "forma de pagamento PIX (\"Pagamento Instantâneo (PIX)\")",
      "consumidor identificado por CPF; chave em grupos de 4",
      "QR Code v2 `...?p=CHAVE|2|1|1|HASH` (hash SHA-1 recalculado com CSC fictício)",
    ],
    pagina: "cupom-80mm",
    esperado,
    html: pagina(CSS_CUPOM, corpo),
    codigos: [{ formato: "QRCode", texto: urlQr }],
    textosNoPdf: [grupos4(chave), fmtCnpj(CNPJ_EMITENTE), `Valor a Pagar R$`, moeda(vPagar), fmtCpf(CPF_CONSUMIDOR)],
    foto: {
      angulo: -3.4, desfoque: 0.8, sombra: 0.28, direcaoSombra: 200, cisalhamento: -0.01, qualidade: 70,
      fundo: "#3d4a57", papel: "#f4f1ea",
    },
  };
}

// ---------------------------------------------------------------------------
// 3. NFS-e padrão nacional (DANFSe v1.0)

const CSS_DANFSE = `
@page{size:A4;margin:0}
body{font-family:"Liberation Sans",Arial,sans-serif}
.folha{width:210mm;height:297mm;padding:8mm 9mm;overflow:hidden}
.cab{display:flex;align-items:center;border:0.8pt solid #000;padding:2mm 3mm;gap:4mm}
.cab .logo{font-size:15pt;font-weight:bold;letter-spacing:0.5pt}
.cab .meio{flex:1;text-align:center;line-height:1.35}
.cab .meio .p{font-size:10pt;font-weight:bold}
.cab .meio .s{font-size:7.5pt}
.cab .dir{font-size:7pt;text-align:right;line-height:1.35}
.bloco{border:0.8pt solid #000;border-top:0;padding:1.4mm 3mm 1.6mm}
.sec{font-size:7.6pt;font-weight:bold;text-transform:uppercase;margin-bottom:1mm}
.sec small{font-weight:normal;text-transform:none;font-size:6.8pt;margin-left:2mm}
.grid{display:grid;grid-template-columns:repeat(4,1fr);column-gap:3mm;row-gap:1.4mm}
.grid.g3{grid-template-columns:repeat(3,1fr)}
.grid.g6{grid-template-columns:repeat(6,1fr)}
.l{font-size:6.3pt;font-weight:bold;line-height:1.2}
.x{font-size:8pt;line-height:1.3;min-height:9pt}
.s2{grid-column:span 2}
.s3{grid-column:span 3}
.s4{grid-column:1/-1}
.topo{display:flex;gap:4mm}
.topo .dados{flex:1}
.qr{width:27mm;height:27mm;flex:none}
.aut{font-size:6.4pt;line-height:1.3;margin-top:1.2mm}
.chave{font-size:9pt;font-weight:bold;letter-spacing:0.3pt}
.desc{font-size:8pt;line-height:1.4}
.total .x{font-weight:bold}
`;

async function montarNfseNacional(): Promise<DocCorpus> {
  const emissao = "2026-10-15";
  // IBGE 3550308 · amb 2 · tpInsc 2 · CNPJ · nNFSe 13 · AAMM · código 9
  const chave = completarChaveNfse(`3550308${"2"}${"2"}${CNPJ_EMITENTE}${"123".padStart(13, "0")}2610${"123456789"}`);
  const urlQr = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`;
  const bruto = 500000;
  const iss = 25000;
  const inss = 55000;
  const liquido = bruto - iss - inss;
  const emitente = { nome: "ENGENHARIA FICTICIA SERVICOS LTDA", fone: "(11) 3333-4444" };
  const descricao =
    "EXECUCAO DE FUNDACOES TIPO ESTACA HELICE CONTINUA - OBRA RESIDENCIAL JARDIM CNO 90.000.12345/67 - MEDICAO 03 (01/09/2026 A 30/09/2026)";

  const svgQr = await svgCodigo(urlQr, "QRCode", "ecLevel=M");

  const esperado: DocumentoLido = {
    tipo: "NFSE",
    legibilidade: "BOA",
    emitente: { nome: emitente.nome, documento: CNPJ_EMITENTE, telefone: emitente.fone },
    destinatario: { nome: CONSTRUTORA.nome, documento: CNPJ_CONSTRUTORA },
    numero: "123",
    serie: null,
    // a chave da NFS-e nacional tem 50 posições; o campo do schema é a chave de 44 da NF-e/NFC-e
    chaveAcesso: null,
    dataEmissao: emissao,
    valorTotal: reais(bruto),
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "NAO_INFORMADA",
    itens: [
      {
        descricao,
        quantidade: null,
        unidade: null,
        valorUnitario: null,
        desconto: null,
        valorTotal: reais(bruto),
        tipo: "SERVICO",
      },
    ],
    parcelas: [],
    observacoes: `Valor líquido R$ ${moeda(liquido)}: ISSQN retido pelo tomador R$ ${moeda(iss)} e INSS retido R$ ${moeda(inss)}.`,
  };

  const campo = (l: string, x: string, cls = "") => `<div class="${cls}"><div class="l">${l}</div><div class="x">${x || "&nbsp;"}</div></div>`;

  const corpo = `<div class="folha">
<div class="cab"><div class="logo">NFS-e</div>
<div class="meio"><div class="p">DANFSe v1.0</div><div class="s">Documento Auxiliar da NFS-e</div></div>
<div class="dir"><b>PREFEITURA DO MUNICÍPIO DE SÃO PAULO</b><br>Secretaria Municipal da Fazenda</div></div>
<div class="bloco"><div class="topo"><div class="dados">
<div class="l">Chave de Acesso da NFS-e</div><div class="chave">${chave}</div>
<div class="grid g3" style="margin-top:1.6mm">
${campo("Número da NFS-e", "123")}${campo("Competência da NFS-e", "01/10/2026")}${campo("Data e Hora da emissão da NFS-e", `${dataBr(emissao)} 09:12:45`)}
${campo("Número da DPS", "57")}${campo("Série da DPS", "1")}${campo("Data e Hora da emissão da DPS", `${dataBr(emissao)} 09:12:40`)}
</div>
<div class="aut">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e</div>
</div><div class="qr">${svgQr}</div></div></div>

<div class="bloco"><div class="sec">EMITENTE DA NFS-e<small>Prestador do Serviço</small></div><div class="grid">
${campo("CNPJ / CPF / NIF", fmtCnpj(CNPJ_EMITENTE))}${campo("Inscrição Municipal", "1.234.567-8")}${campo("Telefone", emitente.fone, "s2")}
${campo("Nome / Nome Empresarial", emitente.nome, "s2")}${campo("E-mail", "contato@engenhariaficticia.com.br", "s2")}
${campo("Endereço", "RUA DAS PEDRAS, 100, CENTRO", "s2")}${campo("Município", "São Paulo - SP")}${campo("CEP", "01001-000")}
${campo("Simples Nacional na Data de Competência", "Não Optante", "s2")}${campo("Regime de Apuração Tributária pelo SN", "-", "s2")}
</div></div>

<div class="bloco"><div class="sec">TOMADOR DO SERVIÇO</div><div class="grid">
${campo("CNPJ / CPF / NIF", fmtCnpj(CNPJ_CONSTRUTORA))}${campo("Inscrição Municipal", "-")}${campo("Telefone", CONSTRUTORA.fone, "s2")}
${campo("Nome / Nome Empresarial", CONSTRUTORA.nome, "s2")}${campo("E-mail", "compras@construtoraexemplo.com.br", "s2")}
${campo("Endereço", "AV. DO CANTEIRO, 500, JARDIM OBRA", "s2")}${campo("Município", "São Paulo - SP")}${campo("CEP", CONSTRUTORA.cep)}
</div></div>

<div class="bloco"><div class="sec">INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e</div></div>

<div class="bloco"><div class="sec">SERVIÇO PRESTADO</div><div class="grid">
${campo("Código de Tributação Nacional", "07.02.01")}${campo("Código de Tributação Municipal", "-")}${campo("Local da Prestação", "São Paulo - SP")}${campo("País da Prestação", "-")}
<div class="s4"><div class="l">Descrição do Serviço</div><div class="desc">${descricao}</div></div>
</div></div>

<div class="bloco"><div class="sec">TRIBUTAÇÃO MUNICIPAL</div><div class="grid">
${campo("Tributação do ISSQN", "Operação Tributável")}${campo("Município de Incidência do ISSQN", "São Paulo - SP")}${campo("Regime Especial de Tributação", "Nenhum")}${campo("Tipo de Imunidade", "-")}
${campo("Valor do Serviço", `R$ ${moeda(bruto)}`)}${campo("Desconto Incondicionado", "-")}${campo("Total Deduções/Reduções", "-")}${campo("Cálculo do BM", "-")}
${campo("BC ISSQN", `R$ ${moeda(bruto)}`)}${campo("Alíquota Aplicada", "5,00%")}${campo("Retenção do ISSQN", "Retido pelo Tomador")}${campo("ISSQN Apurado", `R$ ${moeda(iss)}`)}
</div></div>

<div class="bloco"><div class="sec">TRIBUTAÇÃO FEDERAL</div><div class="grid">
${campo("IRRF", "-")}${campo("Contribuição Previdenciária - Retida", `R$ ${moeda(inss)}`)}${campo("Contribuições Sociais - Retidas", "-")}${campo("Descrição Contrib. Sociais - Retidas", "-")}
${campo("PIS - Débito Apuração Própria", "-")}${campo("COFINS - Débito Apuração Própria", "-")}
</div></div>

<div class="bloco total"><div class="sec">VALOR TOTAL DA NFS-E</div><div class="grid g6">
${campo("Valor do Serviço", `R$ ${moeda(bruto)}`)}${campo("Desconto Condicionado", "-")}${campo("Desconto Incondicionado", "-")}${campo("ISSQN Retido", `R$ ${moeda(iss)}`)}${campo("Total das Retenções Federais", `R$ ${moeda(inss)}`)}${campo("Valor Líquido da NFS-e", `R$ ${moeda(liquido)}`)}
</div></div>

<div class="bloco"><div class="sec">TOTAIS APROXIMADOS DOS TRIBUTOS</div><div class="grid g3">
${campo("Federais", "R$ 680,00")}${campo("Estaduais", "-")}${campo("Municipais", "R$ 250,00")}
</div></div>

<div class="bloco" style="min-height:24mm"><div class="sec">INFORMAÇÕES COMPLEMENTARES</div>
<div class="desc">Retenção de 11% de INSS conforme IN RFB 2.110/2022 (cessão de mão de obra / empreitada). Pagamento por transferência ao prestador em até 10 dias.</div></div>
</div>`;

  return {
    id: "nfse-nacional",
    titulo: "NFS-e padrão nacional (DANFSe v1.0)",
    exercita: [
      "chave de acesso de 50 posições (NÃO vai em chaveAcesso, que é a de 44)",
      "rótulos em linha e valores na linha de baixo (grade de 3/4/6 colunas)",
      "valores com R$ e '-' como zero; bruto R$ 5.000,00 ≠ líquido R$ 4.200,00 (ISS e INSS retidos)",
      "descrição do serviço longa (2 linhas) → 1 item SERVICO sem quantidade impressa",
      "QR Code com URL de consulta da chave",
    ],
    pagina: "A4",
    esperado,
    html: pagina(CSS_DANFSE, corpo),
    codigos: [{ formato: "QRCode", texto: urlQr }],
    textosNoPdf: [chave, fmtCnpj(CNPJ_EMITENTE), `R$ ${moeda(bruto)}`, `R$ ${moeda(liquido)}`, "Valor Líquido da NFS-e"],
    foto: { angulo: 1.4, desfoque: 1.0, sombra: 0.35, direcaoSombra: 120, cisalhamento: 0.008, qualidade: 70, fundo: "#58626b" },
  };
}

// ---------------------------------------------------------------------------
// 4. NFS-e São Paulo (leiaute municipal)

const CSS_NFSE_SP = `
@page{size:A4;margin:0}
body{font-family:"Liberation Sans",Arial,sans-serif}
.folha{width:210mm;height:297mm;padding:8mm 9mm;overflow:hidden}
.borda{border:0.9pt solid #000}
.cab{display:flex}
.cab .esq{flex:1;padding:3mm;text-align:center;line-height:1.45}
.cab .esq .p{font-size:11pt;font-weight:bold}
.cab .esq .s{font-size:8.5pt;font-weight:bold}
.cab .esq .t{font-size:10pt;font-weight:bold;margin-top:2mm}
.cab .dir{width:52mm;border-left:0.9pt solid #000}
.cab .dir div{border-bottom:0.9pt solid #000;padding:0.8mm 2mm;font-size:6.8pt}
.cab .dir div:last-child{border-bottom:0}
.cab .dir b{display:block;font-size:9pt}
.tit{background:#ddd;border-top:0.9pt solid #000;border-bottom:0.9pt solid #000;text-align:center;font-weight:bold;font-size:8pt;padding:0.6mm}
.sec{padding:1.6mm 3mm;font-size:8pt;line-height:1.55}
.sec span{margin-right:7mm}
.disc{height:62mm;padding:2mm 3mm;font-size:8.6pt;line-height:1.5}
.total{border-top:0.9pt solid #000;border-bottom:0.9pt solid #000;text-align:center;font-weight:bold;font-size:10.5pt;padding:1.4mm}
table.v{width:100%;border-collapse:collapse;table-layout:fixed}
table.v td{border-right:0.9pt solid #000;border-bottom:0.9pt solid #000;text-align:center;font-size:7pt;padding:0.6mm 1mm;line-height:1.4}
table.v td:last-child{border-right:0}
table.v td b{display:block;font-size:8.4pt}
.cod{border-bottom:0.9pt solid #000;padding:1mm 3mm;font-size:7pt;line-height:1.4}
.cod b{font-size:8.2pt}
.outras{padding:1.6mm 3mm;font-size:7pt;line-height:1.45;min-height:30mm}
`;

async function montarNfseSp(): Promise<DocCorpus> {
  const emissao = "2026-10-08";
  const valor = 180000;
  const iss = 9000;
  const emitente = { nome: "LOCADORA FICTICIA DE EQUIPAMENTOS LTDA" };
  const descricao = "LOCACAO DE BETONEIRA 400L COM OPERADOR - PERIODO 15/09/2026 A 30/09/2026 - OBRA RESIDENCIAL JARDIM";

  const esperado: DocumentoLido = {
    tipo: "NFSE",
    legibilidade: "BOA",
    emitente: { nome: emitente.nome, documento: CNPJ_EMITENTE, telefone: null },
    destinatario: { nome: CONSTRUTORA.nome, documento: CNPJ_CONSTRUTORA },
    numero: "00004567",
    serie: null,
    chaveAcesso: null,
    dataEmissao: emissao,
    valorTotal: reais(valor),
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "NAO_INFORMADA",
    itens: [
      { descricao, quantidade: null, unidade: null, valorUnitario: null, desconto: null, valorTotal: reais(valor), tipo: "SERVICO" },
    ],
    parcelas: [],
    observacoes: null,
  };

  const corpo = `<div class="folha"><div class="borda">
<div class="cab"><div class="esq"><div class="p">PREFEITURA DO MUNICÍPIO DE SÃO PAULO</div>
<div class="s">SECRETARIA MUNICIPAL DA FAZENDA</div>
<div class="t">NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e</div></div>
<div class="dir"><div>Número da Nota<b>00004567</b></div><div>Data e Hora de Emissão<b>${dataBr(emissao)} 10:15:22</b></div><div>Código de Verificação<b>AB1C-2D3E</b></div></div></div>
<div class="tit">PRESTADOR DE SERVIÇOS</div>
<div class="sec"><span>CPF/CNPJ: <b>${fmtCnpj(CNPJ_EMITENTE)}</b></span><span>Inscrição Municipal: <b>1.234.567-8</b></span><br>
Nome/Razão Social: <b>${emitente.nome}</b><br>
Endereço: R DAS PEDRAS 00100 - CENTRO - CEP: 01001-000<br>
<span>Município: São Paulo</span><span>UF: SP</span></div>
<div class="tit">TOMADOR DE SERVIÇOS</div>
<div class="sec">Nome/Razão Social: <b>${CONSTRUTORA.nome}</b><br>
<span>CPF/CNPJ: <b>${fmtCnpj(CNPJ_CONSTRUTORA)}</b></span><span>Inscrição Municipal: ----</span><br>
Endereço: AV DO CANTEIRO 00500 - JARDIM OBRA - CEP: ${CONSTRUTORA.cep}<br>
<span>Município: São Paulo</span><span>UF: SP</span><span>E-mail: compras@construtoraexemplo.com.br</span></div>
<div class="tit">INTERMEDIÁRIO DE SERVIÇOS</div>
<div class="sec"><span>CPF/CNPJ: ----</span><span>Nome/Razão Social: ----</span></div>
<div class="tit">DISCRIMINAÇÃO DOS SERVIÇOS</div>
<div class="disc">${descricao}<br><br>PEDIDO DE COMPRA 2026/0915.<br>DADOS BANCARIOS PARA PAGAMENTO: BANCO 341 AG 1234 CC 56789-0.</div>
<div class="total">VALOR TOTAL DO SERVIÇO = R$ ${moeda(valor)}</div>
<table class="v"><tr><td>INSS (R$)<b>-</b></td><td>IRRF (R$)<b>-</b></td><td>CSLL (R$)<b>-</b></td><td>COFINS (R$)<b>-</b></td><td>PIS/PASEP (R$)<b>-</b></td></tr></table>
<div class="cod">Código do Serviço<br><b>07102 - Execução por administração, empreitada ou subempreitada de obras de construção civil</b></div>
<table class="v"><tr><td>Valor Total das Deduções (R$)<b>0,00</b></td><td>Base de Cálculo (R$)<b>${moeda(valor)}</b></td><td>Alíquota (%)<b>5,00%</b></td><td>Valor do ISS (R$)<b>${moeda(iss)}</b></td><td>Crédito (R$)<b>0,00</b></td></tr></table>
<table class="v"><tr><td>Município da Prestação do Serviço<b>São Paulo</b></td><td>Número Inscrição da Obra<b>-</b></td><td>Valor Aproximado dos Tributos / Fonte<b>R$ 263,16 (14,62%) / IBPT</b></td></tr></table>
<div class="tit">OUTRAS INFORMAÇÕES</div>
<div class="outras">(1) Esta NFS-e foi emitida com respaldo na Lei nº 14.097/2005; (2) Esta NFS-e não gera crédito;
(3) Data de vencimento do ISS desta NFS-e: 10/11/2026; (4) O ISS desta NFS-e não foi retido pelo tomador.</div>
</div></div>`;

  return {
    id: "nfse-sp",
    titulo: "NFS-e São Paulo (leiaute municipal próprio)",
    exercita: [
      "rótulos `Rótulo: valor` na mesma linha, dois por linha (CPF/CNPJ + Inscrição Municipal)",
      "TOMADOR com nome antes do CNPJ (ordem invertida em relação ao prestador)",
      "número com zeros à esquerda (00004567) e código de verificação alfanumérico",
      "`VALOR TOTAL DO SERVIÇO = R$ 1.800,00`; datas distratoras (período do serviço, vencimento do ISS 10/11/2026)",
      "sem chave, sem QR, sem código de barras (só texto)",
    ],
    pagina: "A4",
    esperado,
    html: pagina(CSS_NFSE_SP, corpo),
    codigos: [],
    textosNoPdf: ["00004567", fmtCnpj(CNPJ_EMITENTE), `VALOR TOTAL DO SERVIÇO = R$ ${moeda(valor)}`, `${dataBr(emissao)} 10:15:22`],
    foto: { angulo: -2.1, desfoque: 0.9, sombra: 0.3, direcaoSombra: 300, cisalhamento: -0.012, qualidade: 70, fundo: "#7a6e60" },
  };
}

// ---------------------------------------------------------------------------
// 5. Boleto de cobrança (Ficha de Compensação)

const CSS_BOLETO = `
@page{size:A4;margin:0}
body{font-family:"Liberation Sans",Arial,sans-serif}
.folha{width:210mm;height:297mm;padding:9mm 10mm;overflow:hidden}
table.b{width:100%;border-collapse:collapse;table-layout:fixed}
table.b td{border:0.7pt solid #000;padding:0.4mm 1.2mm 0.6mm;vertical-align:top}
.r{font-size:5.8pt;line-height:1.2;white-space:nowrap}
.v{font-size:8.4pt;line-height:1.3;min-height:10pt;white-space:nowrap}
.dir{text-align:right}
.cinza{background:#e6e6e6}
.topo{display:flex;align-items:flex-end;border-bottom:1.6pt solid #000;padding-bottom:0.8mm}
.topo .banco{font-size:13pt;font-weight:bold;width:40mm}
.topo .cod{font-size:14pt;font-weight:bold;border-left:1.6pt solid #000;border-right:1.6pt solid #000;padding:0 3mm;margin-right:3mm}
.topo .linha{font-size:11.2pt;font-weight:bold;flex:1;text-align:right;letter-spacing:0.2pt}
.topo .rot{font-size:8.6pt;font-weight:bold;flex:1;text-align:right}
.corte{border-top:0.8pt dashed #000;margin:7mm 0 1mm;position:relative}
.corte span{position:absolute;right:0;top:-3.4mm;font-size:6pt}
.instr{height:24mm}
.instr .v{white-space:normal;font-size:7.2pt}
.pagador .v{white-space:normal;font-size:7.6pt}
.barras{width:103mm;height:13mm;margin-top:2mm}
.aut{font-size:6.4pt;text-align:right}
`;

async function montarDocBoleto(): Promise<DocCorpus> {
  const vencimento = "2026-10-30";
  const valor = 123456;
  const bol = montarBoleto_(vencimento, valor);
  const benef = { nome: "DEPOSITO DE MATERIAIS FICTICIOS LTDA" };
  const dataDoc = "2026-09-15";
  const numDoc = "12345/002";
  const nossoNumero = "109/12345678-2";

  const svg = await svgCodigo(bol.barras, "ITF");

  const esperado: DocumentoLido = {
    tipo: "BOLETO",
    legibilidade: "BOA",
    emitente: { nome: benef.nome, documento: CNPJ_EMITENTE, telefone: null },
    destinatario: { nome: CONSTRUTORA.nome, documento: CNPJ_CONSTRUTORA },
    numero: numDoc,
    serie: null,
    chaveAcesso: null,
    dataEmissao: dataDoc,
    valorTotal: reais(valor),
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "BOLETO",
    itens: [],
    parcelas: [{ vencimento, valor: reais(valor) }],
    observacoes: null,
  };

  const td = (rot: string, val: string, attrs = "", cls = "") =>
    `<td ${attrs}><div class="r">${rot}</div><div class="v ${cls}">${val || "&nbsp;"}</div></td>`;
  const cabecalho = (direita: string, cls: string) =>
    `<div class="topo"><div class="banco">Banco Itaú</div><div class="cod">341-7</div><div class="${cls}">${direita}</div></div>`;

  const corpo = `<div class="folha">
${cabecalho("Recibo do Pagador", "rot")}
<table class="b"><colgroup><col style="width:58%"><col style="width:22%"><col style="width:20%"></colgroup>
<tr>${td("Beneficiário", benef.nome)}${td("CPF/CNPJ do Beneficiário", fmtCnpj(CNPJ_EMITENTE))}${td("Vencimento", dataBr(vencimento), 'class="cinza"', "dir")}</tr>
<tr>${td("Pagador", `${CONSTRUTORA.nome} - CNPJ ${fmtCnpj(CNPJ_CONSTRUTORA)}`)}${td("Nosso Número", nossoNumero)}${td("Valor do Documento", `R$ ${moeda(valor)}`, 'class="cinza"', "dir")}</tr>
<tr>${td("Agência/Código do Beneficiário", "1234/56789-0")}${td("Nº do Documento", numDoc)}${td("(=) Valor Cobrado", "", "", "dir")}</tr>
</table>
<div class="aut">Autenticação Mecânica</div>
<div class="corte"><span>Corte na linha pontilhada</span></div>

${cabecalho(bol.linhaFormatada, "linha")}
<table class="b"><colgroup><col style="width:14%"><col style="width:16%"><col style="width:11%"><col style="width:8%"><col style="width:16%"><col style="width:13%"><col style="width:22%"></colgroup>
<tr>${td("Local de Pagamento", "PAGÁVEL EM QUALQUER BANCO ATÉ O VENCIMENTO", 'colspan="6"')}${td("Vencimento", `<b>${dataBr(vencimento)}</b>`, 'class="cinza"', "dir")}</tr>
<tr>${td("Beneficiário", `${benef.nome} - CNPJ ${fmtCnpj(CNPJ_EMITENTE)}`, 'colspan="6"')}${td("Agência/Código do Beneficiário", "1234/56789-0", "", "dir")}</tr>
<tr>${td("Data do Documento", dataBr(dataDoc))}${td("Nº do Documento", numDoc, 'colspan="2"')}${td("Espécie Doc.", "DM")}${td("Aceite", "N")}${td("Data do Processamento", dataBr(dataDoc))}${td("Nosso Número", nossoNumero, "", "dir")}</tr>
<tr>${td("Uso do Banco", "")}${td("Carteira", "109")}${td("Espécie", "R$")}${td("Quantidade", "", 'colspan="2"')}${td("Valor", "")}${td("(=) Valor do Documento", `<b>${moeda(valor)}</b>`, 'class="cinza"', "dir")}</tr>
<tr><td colspan="6" rowspan="5" class="instr"><div class="r">Instruções (Texto de responsabilidade do beneficiário)</div><div class="v">APÓS O VENCIMENTO COBRAR MULTA DE 2% E JUROS DE 1% AO MÊS.<br>NÃO RECEBER APÓS 60 DIAS DO VENCIMENTO.<br>REFERENTE À NF-e 12345 - DUPLICATA 002.</div></td>${td("(-) Desconto / Abatimento", "", "", "dir")}</tr>
<tr>${td("(-) Outras Deduções", "", "", "dir")}</tr>
<tr>${td("(+) Mora / Multa", "", "", "dir")}</tr>
<tr>${td("(+) Outros Acréscimos", "", "", "dir")}</tr>
<tr>${td("(=) Valor Cobrado", "", "", "dir")}</tr>
<tr class="pagador"><td colspan="7"><div class="r">Pagador</div><div class="v">${CONSTRUTORA.nome} CNPJ: ${fmtCnpj(CNPJ_CONSTRUTORA)}<br>${CONSTRUTORA.endereco} - ${CONSTRUTORA.bairro} - SAO PAULO/SP - ${CONSTRUTORA.cep}</div><div class="r" style="margin-top:1mm">Sacador/Avalista:</div></td></tr>
</table>
<div class="aut">Autenticação Mecânica - <b>Ficha de Compensação</b></div>
<div class="barras">${svg}</div>
</div>`;

  return {
    id: "boleto-itau",
    titulo: "Boleto de cobrança (banco 341) — Recibo do Pagador + Ficha de Compensação",
    exercita: [
      "linha digitável de 47 dígitos (mód. 10 nos 3 campos + DV geral mód. 11) e código de barras ITF de 44",
      "fator de vencimento do ciclo novo (1615 → 30/10/2026)",
      "Beneficiário e Pagador repetidos nas duas vias; Nº do Documento `12345/002`",
      "Data do Documento = dataEmissao; vencimento vira a única parcela; sem itens",
    ],
    pagina: "A4",
    esperado,
    html: pagina(CSS_BOLETO, corpo),
    codigos: [{ formato: "ITF", texto: bol.barras }],
    textosNoPdf: [bol.linhaFormatada, fmtCnpj(CNPJ_EMITENTE), moeda(valor), dataBr(vencimento), numDoc],
    foto: { angulo: 1.2, desfoque: 0.5, sombra: 0.3, direcaoSombra: 160, cisalhamento: 0.01, qualidade: 70, fundo: "#4e5a4a" },
  };
}

/** Boleto da especificação (§9.5): Itaú, carteira/campo livre fictícios. */
function montarBoleto_(vencimento: string, valorCents: number) {
  return montarBoleto("341", vencimento, valorCents, "1091234567821234567890000");
}

// ---------------------------------------------------------------------------
// 6. DAS (Simples Nacional) — arrecadação, linha de 48

const CSS_DAS = `
@page{size:A4;margin:0}
body{font-family:"Liberation Sans",Arial,sans-serif}
.folha{width:210mm;height:297mm;padding:10mm 12mm;overflow:hidden}
.cab{display:flex;align-items:center;gap:5mm;border-bottom:1.4pt solid #000;padding-bottom:2mm;margin-bottom:2mm}
.cab .sn{font-size:16pt;font-weight:bold;line-height:1}
.cab .tt{font-size:12pt;font-weight:bold}
table.d{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1.6mm}
table.d td{border:0.7pt solid #000;padding:0.6mm 1.6mm 0.8mm;vertical-align:top}
.r{font-size:6.6pt;font-weight:bold;line-height:1.25}
.v{font-size:9pt;line-height:1.35;min-height:11pt}
.dir{text-align:right}
.cinza{background:#e4e4e4}
.tit{font-size:8.4pt;font-weight:bold;text-align:center;margin:3mm 0 1mm}
table.comp{width:100%;border-collapse:collapse;font-size:8pt}
table.comp th{border-bottom:0.9pt solid #000;text-align:left;padding:0.8mm 1mm;font-size:7.2pt}
table.comp td{padding:0.7mm 1mm;border-bottom:0.4pt solid #bbb}
table.comp .n{text-align:right}
table.comp tr.tot td{font-weight:bold;border-top:0.9pt solid #000;border-bottom:0}
.linha{font-size:11pt;font-weight:bold;letter-spacing:0.3pt;margin-top:8mm;text-align:center}
.barras{width:103mm;height:13mm;margin:2mm auto 0}
.obs{font-size:7pt;line-height:1.4;margin-top:4mm}
`;

async function montarDas(): Promise<DocCorpus> {
  const vencimento = "2026-10-20";
  const numero = "07.20.26291.2345678-9";
  const comp = [
    { cod: "1001", den: "IRPJ - SIMPLES NACIONAL", v: 2512 },
    { cod: "1002", den: "CSLL - SIMPLES NACIONAL", v: 1599 },
    { cod: "1004", den: "COFINS - SIMPLES NACIONAL", v: 5847 },
    { cod: "1005", den: "PIS - SIMPLES NACIONAL", v: 1267 },
    { cod: "1006", den: "INSS - SIMPLES NACIONAL", v: 19413 },
    { cod: "1010", den: "ISS - SIMPLES NACIONAL", v: 15040 },
  ];
  const total = comp.reduce((a, c) => a + c.v, 0);
  // segmento 5 (órgãos governamentais) · id 8 (valor efetivo, mód. 11) · órgão 0328 · resto fictício (§9.6)
  const arr = montarArrecadacao("5", "8", total, "03280720260912345678901234567");
  const contribuinte = { nome: "ENGENHARIA FICTICIA SERVICOS LTDA" };

  const svg = await svgCodigo(arr.barras, "ITF");

  const esperado: DocumentoLido = {
    tipo: "GUIA",
    legibilidade: "BOA",
    emitente: { nome: "Simples Nacional", documento: null, telefone: null },
    destinatario: { nome: contribuinte.nome, documento: CNPJ_EMITENTE },
    numero,
    serie: null,
    chaveAcesso: null,
    // a guia não imprime data de emissão
    dataEmissao: null,
    valorTotal: reais(total),
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "NAO_INFORMADA",
    itens: comp.map((c) => ({
      descricao: c.den,
      quantidade: null,
      unidade: null,
      valorUnitario: null,
      desconto: null,
      valorTotal: reais(c.v),
      tipo: "ENCARGO" as const,
    })),
    parcelas: [{ vencimento, valor: reais(total) }],
    observacoes: null,
  };

  const corpo = `<div class="folha">
<div class="cab"><div class="sn">Simples<br>Nacional</div><div class="tt">Documento de Arrecadação<br>do Simples Nacional</div></div>
<table class="d"><colgroup><col style="width:30%"><col style="width:70%"></colgroup><tr>
<td><div class="r">CNPJ</div><div class="v">${fmtCnpj(CNPJ_EMITENTE)}</div></td><td><div class="r">Razão Social</div><div class="v">${contribuinte.nome}</div></td></tr></table>
<table class="d"><tr>
<td><div class="r">Período de Apuração</div><div class="v">${mesAno("2026-09-01")}</div></td>
<td><div class="r">Data de Vencimento</div><div class="v">${dataBr(vencimento)}</div></td>
<td><div class="r">Número do Documento</div><div class="v">${numero}</div></td></tr></table>
<table class="d"><tr>
<td class="cinza"><div class="r">Pagar este documento até</div><div class="v"><b>${dataBr(vencimento)}</b></div></td>
<td class="cinza"><div class="r">Valor Total do Documento</div><div class="v dir"><b>${moeda(total)}</b></div></td></tr></table>
<div class="tit">Composição do Documento de Arrecadação</div>
<table class="comp"><tr><th>Código</th><th>Denominação</th><th class="n">Principal</th><th class="n">Multa</th><th class="n">Juros</th><th class="n">Total</th></tr>
${comp.map((c) => `<tr><td>${c.cod}</td><td>${c.den}</td><td class="n">${moeda(c.v)}</td><td class="n">-</td><td class="n">-</td><td class="n">${moeda(c.v)}</td></tr>`).join("\n")}
<tr class="tot"><td></td><td>Totais</td><td class="n">${moeda(total)}</td><td class="n">-</td><td class="n">-</td><td class="n">${moeda(total)}</td></tr></table>
<div class="linha">${arr.linhaFormatada}</div>
<div class="barras">${svg}</div>
<div class="obs">Este documento deve ser pago até a data indicada em "Pagar este documento até". Após essa data, gere um novo DAS no PGDAS-D com os acréscimos legais.<br>
Documento gerado pelo PGDAS-D 2018 - versão fictícia para testes.</div>
</div>`;

  return {
    id: "das-simples",
    titulo: "DAS — Documento de Arrecadação do Simples Nacional",
    exercita: [
      "linha de arrecadação de 48 dígitos (segmento 5, id 8 → mód. 11) e ITF de 44",
      "contribuinte = destinatário (o CNPJ impresso NÃO é do emitente); emitente sem documento",
      "sem data de emissão impressa (dataEmissao null) — período de apuração por extenso (Setembro/2026)",
      "composição em 6 linhas → 6 itens ENCARGO; vencimento = parcela única",
    ],
    pagina: "A4",
    esperado,
    html: pagina(CSS_DAS, corpo),
    codigos: [{ formato: "ITF", texto: arr.barras }],
    textosNoPdf: [arr.linhaFormatada, fmtCnpj(CNPJ_EMITENTE), moeda(total), numero, "Pagar este documento até"],
    foto: { angulo: -1.8, desfoque: 0.9, sombra: 0.3, direcaoSombra: 70, cisalhamento: 0.01, qualidade: 70, fundo: "#6b5f73" },
  };
}

// ---------------------------------------------------------------------------
// 7. Recibo impresso (A5 paisagem)

const CSS_RECIBO = `
@page{size:210mm 148mm;margin:0}
body{font-family:"Liberation Serif","Times New Roman",serif}
.folha{width:210mm;height:148mm;padding:8mm 10mm}
.moldura{border:1.6pt double #000;height:100%;padding:6mm 9mm}
.top{display:flex;justify-content:space-between;align-items:baseline}
.top .t{font-size:22pt;font-weight:bold;letter-spacing:1pt}
.top .n{font-size:12pt}
.valor{text-align:right;margin-top:1mm}
.valor span{display:inline-block;border:1pt solid #000;padding:1mm 4mm;font-size:13pt;font-weight:bold}
.corpo{font-size:11.6pt;line-height:1.75;text-align:justify;margin-top:5mm}
.data{font-size:11.6pt;text-align:right;margin-top:5mm}
.ass{margin:11mm auto 0;width:92mm;text-align:center;font-size:10.6pt;line-height:1.4}
.ass .linha{border-top:0.9pt solid #000;padding-top:1mm}
`;

async function montarRecibo(): Promise<DocCorpus> {
  const data = "2026-10-10";
  const valor = 150000;
  const emitente = { nome: "JOSÉ DA SILVA PEREIRA", fone: "(11) 98888-7777" };
  const referente =
    "mão de obra de assentamento de piso cerâmico na Obra Residencial Jardim, medição de 01/10/2026 a 10/10/2026";

  const esperado: DocumentoLido = {
    tipo: "RECIBO",
    legibilidade: "BOA",
    emitente: { nome: emitente.nome, documento: CPF_PEDREIRO, telefone: emitente.fone },
    destinatario: { nome: CONSTRUTORA.nome, documento: CNPJ_CONSTRUTORA },
    numero: "042",
    serie: null,
    chaveAcesso: null,
    dataEmissao: data,
    valorTotal: reais(valor),
    valorFrete: null,
    valorOutrasDespesas: null,
    descontoGeral: null,
    formaPagamento: "PIX",
    itens: [
      { descricao: referente, quantidade: null, unidade: null, valorUnitario: null, desconto: null, valorTotal: reais(valor), tipo: "SERVICO" },
    ],
    parcelas: [],
    observacoes: null,
  };

  const corpo = `<div class="folha"><div class="moldura">
<div class="top"><div class="t">RECIBO</div><div class="n">Nº 042</div></div>
<div class="valor"><span>VALOR R$ ${moeda(valor)}</span></div>
<div class="corpo">Recebi de <b>${CONSTRUTORA.nome}</b>, CNPJ ${fmtCnpj(CNPJ_CONSTRUTORA)}, a importância de R$ ${moeda(valor)} (${reaisPorExtenso(valor)}), referente a ${referente}. Pagamento efetuado via PIX. Para maior clareza, firmo o presente recibo, dando plena e geral quitação.</div>
<div class="data">São Paulo, ${dataPorExtenso(data)}.</div>
<div class="ass"><div class="linha">${emitente.nome}</div><div>CPF ${fmtCpf(CPF_PEDREIRO)}</div><div>Fone: ${emitente.fone}</div></div>
</div></div>`;

  return {
    id: "recibo-mao-de-obra",
    titulo: "Recibo impresso de mão de obra (A5 paisagem)",
    exercita: [
      "texto corrido: `Recebi de … a importância de R$ … (extenso), referente a …`",
      "data por extenso (`São Paulo, 10 de outubro de 2026`) e datas distratoras no período da medição",
      "emitente pessoa física (CPF) abaixo da linha de assinatura; pagador com CNPJ no corpo",
      "forma de pagamento PIX no corpo; item único SERVICO",
    ],
    pagina: "A5-paisagem",
    esperado,
    html: pagina(CSS_RECIBO, corpo),
    codigos: [],
    textosNoPdf: ["RECIBO", `R$ ${moeda(valor)}`, fmtCpf(CPF_PEDREIRO), dataPorExtenso(data)],
    foto: { angulo: 3.1, desfoque: 1.0, sombra: 0.38, direcaoSombra: 250, cisalhamento: -0.014, qualidade: 70, fundo: "#8a7a63" },
  };
}

export async function montarCorpus(): Promise<DocCorpus[]> {
  return [
    await montarNfe(),
    await montarNfce(),
    await montarNfseNacional(),
    await montarNfseSp(),
    await montarDocBoleto(),
    await montarDas(),
    await montarRecibo(),
  ];
}

