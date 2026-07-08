/**
 * Importa fornecedores e prestadores de serviço das duas planilhas reais (CSV).
 *
 * Trata os problemas encontrados na análise:
 * - quantitativo em Windows-1252 (lido como latin1)
 * - cabeçalhos com quebra de linha dentro de aspas
 * - mesmo fornecedor grafado de várias formas ("EMERSON FARIA (02/25)", "NOVAMIX (SEGUNDA CARGA)")
 *   → agrupado por CNPJ/CPF, nome canônico = variante mais curta sem sufixos de controle
 * - CNPJs digitados para empresas diferentes → CNPJ fica com o nome mais frequente,
 *   o outro entra sem CNPJ (conflito reportado para correção manual)
 * - coluna CNPJ com lixo ("SEM NF") → ignorado
 *
 * Uso: DATABASE_URL=... npx tsx prisma/importar-fornecedores.ts [--dry-run]
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const DIR_PLANILHAS = path.join(process.cwd(), "..", "Gestão de Obras");
const ARQ_QUANTITATIVO = "AI_QUANTITATIVO MATERIAL LOTE 03 E LOTE 19-DESKTOP-ULU0IHP.csv";
const ARQ_FINANCEIRO = "AI_Notas Fiscais Orçamentos finalizados-DESKTOP-ULU0IHP.csv";
const DRY_RUN = process.argv.includes("--dry-run");

const prisma = new PrismaClient();

/** Split CSV por ; respeitando aspas, inclusive quebras de linha dentro de campos. */
function parseCsv(texto: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let campo = "";
  let aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') {
      if (aspas && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === ";" && !aspas) {
      row.push(campo.trim());
      campo = "";
    } else if ((ch === "\n" || ch === "\r") && !aspas) {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(campo.trim());
      campo = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else campo += ch;
  }
  row.push(campo.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove sufixos de controle que a planilha usava para separar lançamentos
 * do mesmo fornecedor: "(02/25)", "(Ref ao mês 03/26)", "(SEGUNDA CARGA)",
 * "- valor da nota R$...", "LOTE 03", "REF 05/25", parêntese final.
 */
function nomeCanonico(nome: string): string {
  let n = nome.replace(/\s+/g, " ").trim();
  if (n.includes("(") && !n.includes(")")) n += ")"; // paren não fechado na planilha
  let anterior = "";
  while (anterior !== n) {
    anterior = n;
    n = n
      .replace(/\s*-?\s*valor da nota\s*R?\$?[\d.,]*\s*$/i, "")
      .replace(/\s*\([^()]*\)\s*$/, "") // qualquer parêntese no fim
      .replace(/\s*\([^)]*$/, "") // fragmento de parêntese sem fechar (paren duplo digitado)
      .replace(/\s*REF\.?\s*(AO\s+M[EÊ]S\s*)?\d{2}\/\d{2,4}\s*$/i, "")
      .replace(/\s*LOTE\s*\d{2}\s*$/i, "")
      .replace(/\s*CPF\s*$/i, "")
      .replace(/\s*[\d.]{2,}\/?\d{0,4}-?\d{0,2}\s*$/, "") // CNPJ/CPF digitado no nome
      .replace(/[-–,\s]+$/, "")
      .trim();
  }
  return n || nome.trim();
}

/**
 * Chave de agrupamento tolerante: ignora acentos, sufixos societários
 * (LTDA, S.A., ME...) e conectivos (DE/DA/DO), para juntar grafias como
 * "NICHELE MATERIAIS" × "NICHELE MATERIAIS LTDA" e "JARDIM DE PEDRA" × "JARDIM PEDRA".
 */
function chaveNome(nome: string): string {
  return normalizar(nomeCanonico(nome))
    .replace(/\b(LTDA|EIRELI|EPP|ME|S\.?A\.?|S\/A)\b\.?/g, " ")
    .replace(/\b(DE|DA|DO|DAS|DOS|E)\b/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}

/** CNPJ (14 dígitos) ou CPF (11) formatado; null para qualquer outra coisa. */
function documentoValido(s: string | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return null;
}

type Registro = { nome: string; doc: string | null; ocorrencias: number };

async function main() {
  const finTexto = readFileSync(path.join(DIR_PLANILHAS, ARQ_FINANCEIRO), "utf8");
  const quantTexto = readFileSync(path.join(DIR_PLANILHAS, ARQ_QUANTITATIVO), "latin1");

  const fin = parseCsv(finTexto).slice(1).filter((r) => r[0]?.trim() && r[3]?.trim());
  const quant = parseCsv(quantTexto).slice(1).filter((r) => r[0]?.trim() && r[1]?.trim());

  // 1) Coleta variantes: financeiro tem CNPJ (col 1); quantitativo só nome (col 0)
  const variantes: Registro[] = [];
  for (const r of fin) variantes.push({ nome: r[0].trim(), doc: documentoValido(r[1]), ocorrencias: 1 });
  for (const r of quant) variantes.push({ nome: r[0].trim(), doc: null, ocorrencias: 1 });

  // 2) Agrupa: primeiro por documento, depois por nome canônico normalizado
  const grupos = new Map<string, { nomes: Map<string, number>; doc: string | null }>();
  const docDoNome = new Map<string, string>(); // nome canônico → doc (para casar quantitativo)

  for (const v of variantes.filter((x) => x.doc)) {
    const chave = chaveNome(v.nome);
    if (!docDoNome.has(chave)) docDoNome.set(chave, v.doc!);
  }
  for (const v of variantes) {
    const canon = nomeCanonico(v.nome);
    const doc = v.doc ?? docDoNome.get(chaveNome(v.nome)) ?? null;
    const chave = doc ?? `nome:${chaveNome(v.nome)}`;
    const g = grupos.get(chave) ?? { nomes: new Map(), doc };
    g.nomes.set(canon, (g.nomes.get(canon) ?? 0) + 1);
    if (!g.doc && doc) g.doc = doc;
    grupos.set(chave, g);
  }

  // 3) Nome final do grupo = variante mais frequente (desempate: mais curta)
  type Final = { nome: string; doc: string | null; ocorrencias: number };
  const finais: Final[] = [...grupos.values()].map((g) => {
    const [nome, ocorrencias] = [...g.nomes.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].length - b[0].length,
    )[0];
    const total = [...g.nomes.values()].reduce((a, b) => a + b, 0);
    return { nome, doc: g.doc, ocorrencias: total > ocorrencias ? total : ocorrencias };
  });

  // 4) Documento repetido em grupos diferentes (erro de digitação na planilha):
  //    fica com o grupo mais frequente; os demais entram sem documento
  const porDoc = new Map<string, Final[]>();
  for (const f of finais.filter((x) => x.doc)) {
    porDoc.set(f.doc!, [...(porDoc.get(f.doc!) ?? []), f]);
  }
  const conflitos: string[] = [];
  for (const [doc, fs] of porDoc) {
    if (fs.length <= 1) continue;
    fs.sort((a, b) => b.ocorrencias - a.ocorrencias);
    for (const perdedor of fs.slice(1)) {
      conflitos.push(`${doc} mantido em "${fs[0].nome}"; "${perdedor.nome}" ficou sem CNPJ — confirme o CNPJ correto`);
      perdedor.doc = null;
    }
  }

  // dedup final por chave de nome (grupos sem doc que colidem com grupo com doc)
  const porNome = new Map<string, Final>();
  for (const f of finais) {
    const chave = chaveNome(f.nome);
    const existente = porNome.get(chave);
    if (!existente) porNome.set(chave, f);
    else if (!existente.doc && f.doc) porNome.set(chave, { ...f, ocorrencias: existente.ocorrencias + f.ocorrencias });
  }
  const lista = [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome));

  console.log(`Fornecedores/prestadores únicos identificados: ${lista.length}`);
  console.log(`  com CNPJ/CPF: ${lista.filter((f) => f.doc).length}`);
  console.log(`  conflitos de documento resolvidos: ${conflitos.length}`);
  conflitos.forEach((c) => console.log(`  ⚠ ${c}`));

  if (DRY_RUN) {
    lista.forEach((f) => console.log(`  - ${f.nome}${f.doc ? ` [${f.doc}]` : ""}`));
    return;
  }

  // 5) Envia ao banco (pula os que já existem por documento ou nome)
  const existentes = await prisma.fornecedor.findMany();
  const docsDb = new Set(existentes.map((e) => e.cnpj).filter(Boolean));
  const nomesDb = new Set(existentes.map((e) => normalizar(e.nome)));

  let criados = 0;
  let pulados = 0;
  for (const f of lista) {
    if ((f.doc && docsDb.has(f.doc)) || nomesDb.has(normalizar(f.nome))) {
      pulados++;
      continue;
    }
    await prisma.fornecedor.create({
      data: { nome: f.nome, cnpj: f.doc, obs: "Importado das planilhas" },
    });
    criados++;
  }
  console.log(`\nEnviado ao banco: ${criados} criados · ${pulados} já existiam`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
