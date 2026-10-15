// Uso: npx tsx scripts/leitor-nativo/avaliar.ts [--dir <dir>] [--motor local|vision] [--json <arq>] [--so id1,id2]
//   [--origem pdf|foto|imagem] [--timeout <ms>] [--extracao <mód>] [--interpretacao <mód>] [--stub (autoteste, não mede o leitor)]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { documentoLidoSchema, normalizarLeitura, type DocumentoLido } from "@/services/leitura-documento";
import type { MidiaDocumento, TextoExtraido } from "@/services/leitor-nativo/tipos";
import { argumento, DIR_FIXTURES, HOJE, listarCorpus, midiaDoArquivo, origemDoArquivo, temFlag, type Origem } from "./comum";
import { CAMPOS, compararDocumento, type Campo, type ResultadoCampo } from "./comparar";

type ModuloExtracao = {
  extrairTexto: (arquivo: Buffer, midia: MidiaDocumento) => Promise<TextoExtraido>;
  encerrarMotores?: () => unknown;
};
type ModuloInterpretacao = {
  interpretarDocumento: (texto: TextoExtraido) => DocumentoLido | Promise<DocumentoLido>;
};

type ResultadoArquivo = {
  id: string;
  arquivo: string;
  origem: Origem;
  bytes: number;
  origemTexto: string | null;
  confiancaMedia: number | null;
  linhas: number;
  codigos: { formato: string; texto: string }[];
  msExtracao: number | null;
  msInterpretacao: number | null;
  msTotal: number | null;
  rssDepoisMb: number;
  erro: string | null;
  schema: string | null;
  campos: ResultadoCampo[];
  acertos: number;
  total: number;
  avisos: string[] | null;
  avisosReferencia: number;
  erroNormalizacao: string | null;
  lido: DocumentoLido | null;
};

const curto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mb = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10;

function comTimeout<T>(p: Promise<T>, ms: number, oque: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`${oque}: tempo esgotado (${ms} ms)`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

function criarStub(): { ext: ModuloExtracao; interp: ModuloInterpretacao; definir: (e: DocumentoLido) => void } {
  let atual: DocumentoLido | null = null;
  let midiaAtual: MidiaDocumento = "application/pdf";
  return {
    definir: (e) => (atual = e),
    ext: {
      async extrairTexto(_arquivo, midia) {
        midiaAtual = midia;
        return {
          origem: midia === "application/pdf" ? "pdf-texto" : "ocr-local",
          paginas: [],
          codigos: [],
          confiancaMedia: midia === "application/pdf" ? null : 0.8,
        };
      },
      encerrarMotores() {},
    },
    interp: {
      interpretarDocumento() {
        const e = structuredClone(atual!);
        if (midiaAtual === "application/pdf") return e;
        if (e.valorTotal !== null) e.valorTotal = Math.round(e.valorTotal * 100 + 1) / 100;
        if (e.itens.length > 1) e.itens.pop();
        if (e.emitente.nome) e.emitente.nome = e.emitente.nome.replace(/O/g, "0");
        e.legibilidade = "PARCIAL";
        return e;
      },
    },
  };
}

function tabela(cab: string[], linhas: string[][], alinharDireita: number[] = []): string {
  const larg = cab.map((h, i) => Math.max(h.length, ...linhas.map((l) => (l[i] ?? "").length)));
  const fmt = (l: string[]) =>
    l.map((x, i) => (alinharDireita.includes(i) ? (x ?? "").padStart(larg[i]) : (x ?? "").padEnd(larg[i]))).join("  ");
  return [fmt(cab), larg.map((n) => "─".repeat(n)).join("  "), ...linhas.map(fmt)].join("\n");
}

const pct = (a: number, t: number) => (t ? `${a}/${t} ${((100 * a) / t).toFixed(0).padStart(3)}%` : "—");

function estat(xs: number[]) {
  if (!xs.length) return null;
  const ord = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    media: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
    mediana: ord[Math.floor(ord.length / 2)],
    max: ord[ord.length - 1],
  };
}

async function main() {
  const dir = path.resolve(argumento("--dir") ?? DIR_FIXTURES);
  const motor = argumento("--motor");
  const saidaJson = argumento("--json");
  const so = argumento("--so")?.split(",");
  const soOrigem = argumento("--origem");
  const timeout = Number(argumento("--timeout") ?? 180_000);
  const usarStub = temFlag("--stub");

  if (motor) {
    if (motor !== "local" && motor !== "vision") throw new Error("--motor deve ser local ou vision");
    process.env.OCR_MOTOR = motor;
  }

  let ext: ModuloExtracao;
  let interp: ModuloInterpretacao;
  let definirStub: ((e: DocumentoLido) => void) | null = null;
  if (usarStub) {
    const s = criarStub();
    ext = s.ext;
    interp = s.interp;
    definirStub = s.definir;
    console.log("⚠ MODO STUB: autoteste do avaliador — os números abaixo NÃO medem o leitor.\n");
  } else {
    // import dinâmico: OCR_MOTOR precisa estar definido antes de o módulo carregar
    const modExt = argumento("--extracao") ?? "@/services/leitor-nativo/extracao";
    const modInterp = argumento("--interpretacao") ?? "@/services/leitor-nativo/interpretacao";
    const resolver = (m: string) => (m.startsWith(".") || m.startsWith("/") ? path.resolve(m) : m);
    const carregar = async (m: string) => {
      try {
        return await import(resolver(m));
      } catch (e) {
        throw new Error(`não foi possível importar ${m} (${e instanceof Error ? e.message.split("\n")[0] : e}) — use --stub para testar o avaliador`);
      }
    };
    ext = (await carregar(modExt)) as ModuloExtracao;
    interp = (await carregar(modInterp)) as ModuloInterpretacao;
    if (typeof ext.extrairTexto !== "function") throw new Error(`${modExt} não exporta extrairTexto`);
    if (typeof interp.interpretarDocumento !== "function") throw new Error(`${modInterp} não exporta interpretarDocumento`);
  }

  let corpus = listarCorpus(dir);
  if (so) corpus = corpus.filter((c) => so.includes(c.id));
  console.log(`Corpus: ${dir} (${corpus.length} documentos) · OCR_MOTOR=${process.env.OCR_MOTOR ?? "(padrão)"} · hoje=${HOJE}\n`);

  const resultados: ResultadoArquivo[] = [];
  let picoRss = process.memoryUsage().rss;
  const inicio = Date.now();

  for (const entrada of corpus) {
    const esperado = documentoLidoSchema.parse(JSON.parse(readFileSync(entrada.esperado, "utf8")));
    const ref = normalizarLeitura(esperado, HOJE);
    const avisosReferencia = ref.ok ? ref.leitura.avisos.length : 0;

    for (const arquivo of entrada.arquivos) {
      const origem = origemDoArquivo(arquivo);
      if (soOrigem && origem !== soOrigem) continue;
      const midia = midiaDoArquivo(arquivo)!;
      const buffer = readFileSync(arquivo);
      definirStub?.(esperado);

      const r: ResultadoArquivo = {
        id: entrada.id,
        arquivo: path.basename(arquivo),
        origem,
        bytes: buffer.length,
        origemTexto: null,
        confiancaMedia: null,
        linhas: 0,
        codigos: [],
        msExtracao: null,
        msInterpretacao: null,
        msTotal: null,
        rssDepoisMb: 0,
        erro: null,
        schema: null,
        campos: [],
        acertos: 0,
        total: 0,
        avisos: null,
        avisosReferencia,
        erroNormalizacao: null,
        lido: null,
      };

      try {
        const t0 = performance.now();
        const texto = await comTimeout(ext.extrairTexto(buffer, midia), timeout, "extrairTexto");
        const t1 = performance.now();
        const lido = await comTimeout(Promise.resolve(interp.interpretarDocumento(texto)), timeout, "interpretarDocumento");
        const t2 = performance.now();
        r.msExtracao = Math.round(t1 - t0);
        r.msInterpretacao = Math.round(t2 - t1);
        r.msTotal = Math.round(t2 - t0);
        r.origemTexto = texto.origem;
        r.confiancaMedia = texto.confiancaMedia;
        r.linhas = texto.paginas.reduce((a, p) => a + p.linhas.length, 0);
        r.codigos = texto.codigos.map((c) => ({ formato: c.formato, texto: c.texto }));

        const v = documentoLidoSchema.safeParse(lido);
        if (!v.success) r.schema = v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        r.lido = lido;
        const n = normalizarLeitura(v.success ? v.data : lido, HOJE);
        if (n.ok) r.avisos = n.leitura.avisos;
        else r.erroNormalizacao = n.erro;
      } catch (e) {
        r.erro = e instanceof Error ? e.message : String(e);
      }

      try {
        r.campos = compararDocumento(esperado, r.lido);
      } catch (e) {
        r.erro = `${r.erro ? `${r.erro}; ` : ""}comparação: ${e instanceof Error ? e.message : String(e)}`;
        r.campos = compararDocumento(esperado, null);
      }
      r.acertos = r.campos.reduce((a, c) => a + c.acertos, 0);
      r.total = r.campos.reduce((a, c) => a + c.total, 0);

      const rss = process.memoryUsage().rss;
      picoRss = Math.max(picoRss, rss);
      r.rssDepoisMb = mb(rss);
      resultados.push(r);
      process.stdout.write(`  ${r.arquivo.padEnd(34)} ${r.erro ? `ERRO ${r.erro}` : `${pct(r.acertos, r.total)} · ${r.msTotal} ms`}\n`);
    }
  }

  if (typeof ext.encerrarMotores === "function") {
    try {
      await ext.encerrarMotores();
    } catch (e) {
      console.warn("encerrarMotores falhou:", e);
    }
  }
  const duracao = Date.now() - inicio;
  const maxRssKb = process.resourceUsage().maxRSS;

  console.log("\nPor arquivo\n");
  console.log(
    tabela(
      ["arquivo", "origem", "texto", "conf", "linhas", "cód.", "tipo", "campos", "itens L/E", "avisos L(ref)", "ms extr", "ms interp", "erro / campos errados"],
      resultados.map((r) => {
        const errados = r.campos.filter((c) => c.acertos < c.total).map((c) => c.campo);
        const itensL = r.lido ? r.lido.itens.length : "—";
        const itensE = r.campos.find((c) => c.campo === "itens.contagem")?.esperado ?? "?";
        return [
          r.arquivo,
          r.origem,
          r.origemTexto ?? "—",
          r.confiancaMedia === null ? "—" : r.confiancaMedia.toFixed(2),
          String(r.linhas),
          String(r.codigos.length),
          r.lido?.tipo ?? "—",
          pct(r.acertos, r.total),
          `${itensL}/${itensE}`,
          r.avisos ? `${r.avisos.length}(${r.avisosReferencia})` : r.erroNormalizacao ? "recusado" : "—",
          r.msExtracao === null ? "—" : String(r.msExtracao),
          r.msInterpretacao === null ? "—" : String(r.msInterpretacao),
          curto(r.erro ? `ERRO: ${r.erro}` : [r.schema ? "SCHEMA" : "", ...errados].filter(Boolean).join(", "), 110),
        ];
      }),
      [3, 4, 5, 10, 11],
    ),
  );

  const origens = (["pdf", "foto", "imagem"] as Origem[]).filter((o) => resultados.some((r) => r.origem === o));
  const porCampo: Record<string, Record<string, { acertos: number; total: number }>> = {};
  for (const campo of CAMPOS) {
    porCampo[campo] = {};
    for (const o of [...origens, "todos"]) {
      const rs = resultados.filter((r) => o === "todos" || r.origem === o);
      const cs = rs.flatMap((r) => r.campos.filter((c) => c.campo === (campo as Campo)));
      porCampo[campo][o] = { acertos: cs.reduce((a, c) => a + c.acertos, 0), total: cs.reduce((a, c) => a + c.total, 0) };
    }
  }
  console.log("\nAcurácia por campo\n");
  const linhaGeral = [...origens, "todos"].map((o) => {
    const rs = resultados.filter((r) => o === "todos" || r.origem === o);
    return pct(rs.reduce((a, r) => a + r.acertos, 0), rs.reduce((a, r) => a + r.total, 0));
  });
  console.log(
    tabela(
      ["campo", ...origens, "todos"],
      [
        ...CAMPOS.map((campo) => [campo, ...[...origens, "todos"].map((o) => pct(porCampo[campo][o].acertos, porCampo[campo][o].total))]),
        ["TODOS OS CAMPOS", ...linhaGeral],
        [
          "documentos 100%",
          ...[...origens, "todos"].map((o) => {
            const rs = resultados.filter((r) => o === "todos" || r.origem === o);
            return pct(rs.filter((r) => r.total > 0 && r.acertos === r.total).length, rs.length);
          }),
        ],
        [
          "avisos (lido / ref.)",
          ...[...origens, "todos"].map((o) => {
            const rs = resultados.filter((r) => o === "todos" || r.origem === o);
            return `${rs.reduce((a, r) => a + (r.avisos?.length ?? 0), 0)} / ${rs.reduce((a, r) => a + r.avisosReferencia, 0)}`;
          }),
        ],
      ],
      [1, 2, 3, 4],
    ),
  );

  const latencia: Record<string, unknown> = {};
  console.log("\nLatência por arquivo (ms)\n");
  const linhasLat: string[][] = [];
  for (const o of [...origens, "todos"]) {
    const rs = resultados.filter((r) => (o === "todos" || r.origem === o) && r.msTotal !== null);
    const tot = estat(rs.map((r) => r.msTotal!));
    const ex = estat(rs.map((r) => r.msExtracao!));
    const it = estat(rs.map((r) => r.msInterpretacao!));
    latencia[o] = { total: tot, extracao: ex, interpretacao: it };
    if (tot) {
      linhasLat.push([o, String(tot.n), String(tot.media), String(tot.mediana), String(tot.max), String(ex!.media), String(ex!.max), String(it!.media), String(it!.max)]);
    }
  }
  console.log(
    tabela(["origem", "n", "média", "mediana", "máx", "extr. média", "extr. máx", "interp. média", "interp. máx"], linhasLat, [1, 2, 3, 4, 5, 6, 7, 8]),
  );
  console.log(
    `\n(o 1º arquivo inclui o aquecimento dos motores) · duração total ${(duracao / 1000).toFixed(1)} s` +
      `\nMemória: pico de RSS ${mb(maxRssKb * 1024)} MB (resourceUsage.maxRSS) · maior amostra ${mb(picoRss)} MB` +
      ` · heap agora ${mb(process.memoryUsage().heapUsed)} MB` +
      `\n(processos-filho não entram no RSS; workers em thread entram)`,
  );

  if (saidaJson) {
    writeFileSync(
      saidaJson,
      `${JSON.stringify(
        {
          geradoEm: new Date().toISOString(),
          dir,
          motor: process.env.OCR_MOTOR ?? null,
          stub: usarStub,
          hoje: HOJE,
          porCampo,
          latencia,
          memoria: { picoRssMb: mb(maxRssKb * 1024), maiorAmostraRssMb: mb(picoRss) },
          duracaoMs: duracao,
          arquivos: resultados,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nResultados gravados em ${saidaJson}`);
  }
}

main()
  .catch((e) => {
    console.error("avaliar: falha geral:", e instanceof Error ? e.message : e);
  })
  .finally(() => {
    // Sai explicitamente (sempre 0, é medição) para não pendurar nos workers de OCR.
    process.exit(0);
  });
