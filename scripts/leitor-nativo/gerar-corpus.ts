/**
 * Gera o corpus de avaliação do leitor nativo de documentos.
 *
 *   npx tsx scripts/leitor-nativo/gerar-corpus.ts [--saida <dir>] [--fixtures] [--so id1,id2]
 *
 * Para cada documento de `documentos.ts` (dados = verdade de referência):
 *   1. confere o `esperado` (documentoLidoSchema, DVs, somas, normalizarLeitura sem erro);
 *   2. renderiza o HTML no Chromium → `<id>.pdf` (camada de texto real) e
 *      `<id>.png` (~192 dpi);
 *   3. deriva as "fotos" com sharp → `<id>.jpg` (leve: 1–4°, desfoque, sombra,
 *      JPEG ~70, lado maior ≤ 2400 px) e `<id>.foto-forte.jpg` (mais degradada);
 *   4. confere que cada código de barras/QR decodifica de volta (PNG: obrigatório;
 *      fotos: informativo) e que a camada de texto do PDF tem os trechos-chave.
 *
 * Tudo vai para `--saida` (padrão: $TMPDIR/leitor-nativo-corpus). Com `--fixtures`,
 * o conjunto curado (pdf + jpg + esperado.json) e o README são copiados para
 * `src/services/leitor-nativo/__fixtures__/`.
 *
 * Sai com código 1 se alguma conferência obrigatória falhar.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium, type Browser } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import {
  chaveAcessoValida,
  dadosDaChave,
  documentoLidoSchema,
  documentoValido,
  normalizarData,
  normalizarLeitura,
  normalizarNumeroNf,
  type DocumentoLido,
} from "@/services/leitura-documento";
import { arrecadacaoValida, boletoValido, moeda, so } from "./aritmetica";
import { lerCodigos } from "./codigos";
import { argumento, DIR_FIXTURES, DIR_SAIDA_PADRAO, HOJE, kb, temFlag } from "./comum";
import { montarCorpus, type DocCorpus } from "./documentos";
import { gerarFoto, parametrosFortes } from "./foto";

const ESCALA = 2; // 96 css px/pol × 2 = 192 dpi

const problemas: string[] = [];
const falhar = (msg: string) => problemas.push(msg);

// ---------------------------------------------------------------------------
// Conferência da verdade de referência

const c = (v: number | null | undefined) => Math.round((v ?? 0) * 100);

function conferirEsperado(e: DocumentoLido): string[] {
  const erros: string[] = [];
  const r = documentoLidoSchema.safeParse(e);
  if (!r.success) erros.push(`schema: ${r.error.message}`);

  if (e.emitente.documento && !documentoValido(e.emitente.documento)) erros.push("DV do documento do emitente");
  if (e.destinatario.documento && !documentoValido(e.destinatario.documento)) erros.push("DV do documento do destinatário");
  if (e.dataEmissao && normalizarData(e.dataEmissao) !== e.dataEmissao) erros.push("dataEmissao inválida");
  if (e.dataEmissao && e.dataEmissao > HOJE) erros.push(`dataEmissao depois de ${HOJE}`);

  if (e.chaveAcesso) {
    if (!chaveAcessoValida(e.chaveAcesso)) erros.push("DV da chave de acesso");
    const ch = dadosDaChave(e.chaveAcesso);
    if (ch.cnpj !== e.emitente.documento) erros.push("CNPJ da chave ≠ emitente");
    if (e.numero && ch.numero !== normalizarNumeroNf(e.numero)) erros.push("nNF da chave ≠ número");
    if (e.serie && ch.serie !== String(Number(e.serie))) erros.push("série da chave ≠ série");
    if (e.dataEmissao && e.chaveAcesso.slice(2, 6) !== e.dataEmissao.slice(2, 4) + e.dataEmissao.slice(5, 7)) {
      erros.push("AAMM da chave ≠ data de emissão");
    }
    const modelo = e.tipo === "NFE" ? "55" : e.tipo === "NFCE" ? "65" : "?";
    if (ch.modelo !== modelo) erros.push(`modelo da chave ${ch.modelo} ≠ ${e.tipo}`);
  }

  for (const [i, it] of e.itens.entries()) {
    if (it.quantidade !== null && it.valorUnitario !== null) {
      const bruto = Math.round(it.quantidade * it.valorUnitario * 100) - c(it.desconto);
      if (bruto !== c(it.valorTotal)) erros.push(`item ${i + 1}: qtd × unit − desc ≠ total`);
    }
  }
  if (e.itens.length > 0) {
    const soma = e.itens.reduce((a, it) => a + c(it.valorTotal), 0);
    const calculado = soma + c(e.valorFrete) + c(e.valorOutrasDespesas) - c(e.descontoGeral);
    if (calculado !== c(e.valorTotal)) {
      erros.push(`itens + frete + outras − desconto = ${calculado / 100} ≠ total ${e.valorTotal}`);
    }
  }
  if (e.parcelas.length > 0) {
    const soma = e.parcelas.reduce((a, p) => a + c(p.valor), 0);
    if (soma !== c(e.valorTotal)) erros.push(`Σ parcelas ${soma / 100} ≠ total ${e.valorTotal}`);
    for (const p of e.parcelas) if (normalizarData(p.vencimento) !== p.vencimento) erros.push("vencimento inválido");
  }

  const n = normalizarLeitura(e, HOJE);
  if (!n.ok) erros.push(`normalizarLeitura recusou: ${n.erro}`);
  else if (n.leitura.totalCents !== c(e.valorTotal)) erros.push("normalizarLeitura mudou o total");
  return erros;
}

function conferirCodigosImpressos(d: DocCorpus): string[] {
  const erros: string[] = [];
  for (const cod of d.codigos) {
    if (cod.formato === "Code128" && !chaveAcessoValida(cod.texto)) erros.push("Code-128 não é uma chave válida");
    if (cod.formato === "ITF") {
      const b = cod.texto;
      if (b.length !== 44) erros.push("ITF sem 44 dígitos");
      if (b[0] === "8") {
        const linha = [0, 1, 2, 3].map((i) => b.slice(i * 11, i * 11 + 11)).join("");
        // a linha de 48 impressa é conferida pelo texto do PDF; aqui, o DV geral das barras
        const html = so(d.html.match(/8\d{10}-\d \d{11}-\d \d{11}-\d \d{11}-\d/)?.[0] ?? "");
        if (!arrecadacaoValida(html)) erros.push("linha de arrecadação impressa inválida");
        if (html && [0, 1, 2, 3].map((i) => html.slice(i * 12, i * 12 + 11)).join("") !== linha) {
          erros.push("linha de arrecadação ≠ barras");
        }
      } else {
        const impressa = d.html.match(/\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}/)?.[0] ?? "";
        if (!boletoValido(impressa)) erros.push("linha digitável impressa inválida");
      }
    }
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Renderização

function fontesDisponiveis(): Set<string> {
  try {
    const saida = execFileSync("fc-list", [":", "family"], { encoding: "utf8" });
    return new Set(saida.split("\n").flatMap((l) => l.split(",").map((f) => f.trim())));
  } catch {
    return new Set();
  }
}

async function abrirChromium(): Promise<Browser> {
  const caminho = process.env.CHROMIUM_PATH;
  if (caminho) return chromium.launch({ executablePath: caminho });
  try {
    return await chromium.launch();
  } catch (e) {
    // versão do Playwright diferente do Chromium instalado: usa o binário disponível
    for (const alt of ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
      if (existsSync(alt)) return chromium.launch({ executablePath: alt });
    }
    throw e;
  }
}

const VIEWPORT: Record<DocCorpus["pagina"], { width: number; height: number }> = {
  A4: { width: 794, height: 1123 },
  "A5-paisagem": { width: 794, height: 560 },
  "cupom-80mm": { width: 303, height: 800 },
};

async function renderizar(browser: Browser, d: DocCorpus): Promise<{ pdf: Buffer; png: Buffer }> {
  const page = await browser.newPage({ viewport: VIEWPORT[d.pagina], deviceScaleFactor: ESCALA });
  try {
    await page.setContent(d.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    let pdf: Buffer;
    if (d.pagina === "cupom-80mm") {
      const altura = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      pdf = await page.pdf({ width: "80mm", height: `${altura + 2}px`, printBackground: true, pageRanges: "1" });
    } else {
      pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, pageRanges: "1" });
    }
    const png = await page.screenshot({ fullPage: true, type: "png" });
    return { pdf, png };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Conferências sobre os arquivos gerados

async function textoDoPdf(pdf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  await doc.cleanup?.();
  return text.replace(/\s+/g, " ");
}

async function conferirCodigos(d: DocCorpus, imagem: Buffer): Promise<{ ok: number; total: number; faltando: string[] }> {
  if (d.codigos.length === 0) return { ok: 0, total: 0, faltando: [] };
  const lidos = await lerCodigos(new Uint8Array(imagem));
  const faltando = d.codigos.filter((cod) => !lidos.some((l) => l.texto === cod.texto)).map((cod) => cod.formato);
  return { ok: d.codigos.length - faltando.length, total: d.codigos.length, faltando };
}

// ---------------------------------------------------------------------------
// README dos fixtures

function readme(docs: DocCorpus[], tamanhos: Map<string, number>, codigosFoto: Map<string, string>): string {
  const linhas = docs.map((d) => {
    const e = d.esperado;
    const arquivos = [".pdf", ".jpg", ".esperado.json"]
      .map((ext) => `\`${d.id}${ext}\` (${kb(tamanhos.get(d.id + ext) ?? 0)})`)
      .join(", ");
    return `### \`${d.id}\` — ${d.titulo}

Arquivos: ${arquivos}

- tipo **${e.tipo}**, total R$ ${moeda(c(e.valorTotal))}, ${e.itens.length} ite${e.itens.length === 1 ? "m" : "ns"}, ${e.parcelas.length} parcela(s), forma ${e.formaPagamento}
${d.exercita.map((x) => `- ${x}`).join("\n")}
- foto: ${d.foto.angulo > 0 ? "+" : ""}${d.foto.angulo}°, desfoque σ ${d.foto.desfoque}, sombra ${Math.round(d.foto.sombra * 100)}%, JPEG q${d.foto.qualidade}${d.codigos.length ? `; ${d.codigos.map((x) => x.formato).join("+")} na foto: ${codigosFoto.get(d.id)}` : ""}`;
  });
  const total = [...tamanhos.values()].reduce((a, b) => a + b, 0);
  return `# Fixtures do leitor nativo de documentos

Corpus sintético (dados **fictícios**, DVs calculados) para medir o leitor nativo
(extração → interpretação → \`normalizarLeitura\`) sem LLM. **Gerado** por
\`scripts/leitor-nativo/gerar-corpus.ts\` — não edite à mão; mude os dados em
\`scripts/leitor-nativo/documentos.ts\` e gere de novo.

Para cada documento:

- \`<id>.pdf\` — PDF digital renderizado pelo Chromium (camada de texto real);
- \`<id>.jpg\` — "foto": render a ~192 dpi, papel sobre uma mesa, rotação de 1–4°,
  cisalhamento leve, sombra/vinheta, desfoque gaussiano, pretos acinzentados,
  JPEG q≈70, lado maior ≤ 2400 px (o cliente do app já reduz a 2400 px);
- \`<id>.esperado.json\` — a verdade de referência no formato \`DocumentoLido\`
  (\`src/services/leitura-documento.ts\`), validada contra \`documentoLidoSchema\`,
  com somas conferidas (itens + frete + outras − desconto = total; Σ parcelas = total)
  e aceita por \`normalizarLeitura\`. \`null\` = o documento não imprime o campo.

Total: ${kb(total)}.

## Convenções da verdade de referência

- \`numero\` como impresso (\`000.012.345\`, \`00004567\`); o avaliador compara NF/NFC-e/NFS-e sem zeros à esquerda.
- \`chaveAcesso\` só para a chave de 44 (NF-e/NFC-e). A chave de 50 da NFS-e nacional **não** entra (fica \`null\`).
- \`valorTotal\` da NFS-e = valor bruto do serviço; líquido e retenções vão em \`observacoes\` (não comparado).
- Guia (DAS): \`emitente\` = "Simples Nacional" sem documento; o CNPJ impresso é do **contribuinte** (\`destinatario\`); sem data de emissão impressa (\`null\`).
- Itens sem quantidade impressa (NFS-e, recibo, composição do DAS) têm \`quantidade: null\` — o avaliador aceita \`null\` ou 1.
- Boleto: sem itens; vencimento + valor = a parcela única.
- \`legibilidade\` é sempre \`BOA\` (é a verdade do conteúdo, não da foto) e não é comparada.

## Códigos de barras nas fotos

Todos os códigos decodificam (zxing-wasm) do render limpo. Nas fotos, um código
linear de página A4 inteira reduzida a 2400 px fica com ~2 px por módulo: o
Code-128 da chave do DANFE e o ITF do DAS **não** decodificam (de propósito, é o
caso real — o leitor precisa do texto OCR da chave/linha digitável), o ITF do
boleto (foto mais nítida) decodifica, e os QR Codes decodificam.

## Documentos

${linhas.join("\n\n")}

## Como usar

\`\`\`bash
# avaliar extração + interpretação sobre estes fixtures (pdf e jpg)
npx tsx scripts/leitor-nativo/avaliar.ts [--motor local|vision] [--json resultado.json]

# regenerar (variantes extras — png limpo e foto-forte — ficam em --saida, fora do repo)
npx tsx scripts/leitor-nativo/gerar-corpus.ts --saida /tmp/leitor-nativo-corpus --fixtures
npx tsx scripts/leitor-nativo/avaliar.ts --dir /tmp/leitor-nativo-corpus
\`\`\`
`;
}

// ---------------------------------------------------------------------------

async function main() {
  const saida = path.resolve(argumento("--saida") ?? DIR_SAIDA_PADRAO);
  const copiarFixtures = temFlag("--fixtures");
  const so_ = argumento("--so")?.split(",");
  mkdirSync(saida, { recursive: true });

  const fontes = fontesDisponiveis();
  for (const f of ["Liberation Sans", "Liberation Serif", "DejaVu Sans Mono"]) {
    if (fontes.size && !fontes.has(f)) console.warn(`aviso: fonte "${f}" não encontrada no fc-list — o Chromium vai substituir`);
  }

  let docs = await montarCorpus();
  if (so_) docs = docs.filter((d) => so_.includes(d.id));

  console.log("Conferindo a verdade de referência...");
  for (const d of docs) {
    const erros = [...conferirEsperado(d.esperado), ...conferirCodigosImpressos(d)];
    for (const e of erros) falhar(`${d.id}: ${e}`);
    const n = normalizarLeitura(d.esperado, HOJE);
    const avisos = n.ok ? n.leitura.avisos : [n.erro];
    console.log(`  ${d.id.padEnd(20)} ${erros.length ? `✗ ${erros.join("; ")}` : "✓"}  avisos de referência: ${avisos.length}${avisos.length ? ` (${avisos.join(" | ")})` : ""}`);
  }

  const browser = await abrirChromium();
  const tamanhos = new Map<string, number>();
  const codigosFoto = new Map<string, string>();
  const linhas: string[][] = [];
  try {
    for (const d of docs) {
      const t0 = Date.now();
      const { pdf, png } = await renderizar(browser, d);
      const jpg = await gerarFoto(png, d.foto);
      const forte = await gerarFoto(png, parametrosFortes(d.foto), 1800);

      const arq = (ext: string) => path.join(saida, `${d.id}${ext}`);
      writeFileSync(arq(".html"), d.html);
      writeFileSync(arq(".pdf"), pdf);
      writeFileSync(arq(".png"), png);
      writeFileSync(arq(".jpg"), jpg);
      writeFileSync(arq(".foto-forte.jpg"), forte);
      writeFileSync(arq(".esperado.json"), `${JSON.stringify(d.esperado, null, 2)}\n`);

      // códigos: PNG limpo é obrigatório; fotos são informativas
      const cPng = await conferirCodigos(d, png);
      if (cPng.faltando.length) falhar(`${d.id}: código não decodifica do PNG (${cPng.faltando.join(", ")})`);
      const cJpg = await conferirCodigos(d, jpg);
      const cForte = await conferirCodigos(d, forte);
      codigosFoto.set(d.id, cJpg.faltando.length ? "não decodifica" : "decodifica");

      // camada de texto do PDF
      const texto = await textoDoPdf(pdf);
      const ausentes = d.textosNoPdf.filter((t) => !texto.includes(t));
      if (ausentes.length) falhar(`${d.id}: PDF sem os trechos ${JSON.stringify(ausentes)}`);

      const pngMeta = await sharp(png).metadata();
      const jpgMeta = await sharp(jpg).metadata();
      const fmt = (x: { ok: number; total: number }) => (x.total ? `${x.ok}/${x.total}` : "—");
      linhas.push([
        d.id,
        kb(pdf.length),
        `${pngMeta.width}×${pngMeta.height}`,
        `${kb(jpg.length)} ${jpgMeta.width}×${jpgMeta.height}`,
        kb(forte.length),
        fmt(cPng),
        fmt(cJpg),
        fmt(cForte),
        ausentes.length ? `✗ ${ausentes.length}` : "✓",
        `${Date.now() - t0} ms`,
      ]);

      if (copiarFixtures) {
        mkdirSync(DIR_FIXTURES, { recursive: true });
        for (const ext of [".pdf", ".jpg", ".esperado.json"]) {
          copyFileSync(arq(ext), path.join(DIR_FIXTURES, `${d.id}${ext}`));
          tamanhos.set(d.id + ext, statSync(arq(ext)).size);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const cab = ["documento", "pdf", "png (192 dpi)", "foto jpg", "foto-forte", "cód. png", "cód. foto", "cód. forte", "texto pdf", "tempo"];
  const larg = cab.map((h, i) => Math.max(h.length, ...linhas.map((l) => l[i].length)));
  console.log("\n" + cab.map((h, i) => h.padEnd(larg[i])).join("  "));
  for (const l of linhas) console.log(l.map((x, i) => x.padEnd(larg[i])).join("  "));
  console.log(`\nSaída: ${saida}`);

  if (copiarFixtures) {
    const todos = await montarCorpus();
    writeFileSync(path.join(DIR_FIXTURES, "README.md"), readme(todos.filter((d) => tamanhos.has(`${d.id}.pdf`)), tamanhos, codigosFoto));
    const total = [...tamanhos.values()].reduce((a, b) => a + b, 0);
    console.log(`Fixtures copiados para ${DIR_FIXTURES} (${kb(total)})`);
  }

  if (problemas.length) {
    console.error(`\n${problemas.length} problema(s):\n  - ${problemas.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nTodas as conferências obrigatórias passaram.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
