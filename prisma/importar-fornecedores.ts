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
import { agruparFornecedores, documentoValido, normalizar, parseCsvBruto, type RegistroFornecedor } from "./lib/planilhas-utils";

const DIR_PLANILHAS = path.join(process.cwd(), "..", "Gestão de Obras");
const ARQ_QUANTITATIVO = "AI_QUANTITATIVO MATERIAL LOTE 03 E LOTE 19-DESKTOP-ULU0IHP.csv";
const ARQ_FINANCEIRO = "AI_Notas Fiscais Orçamentos finalizados-DESKTOP-ULU0IHP.csv";
const DRY_RUN = process.argv.includes("--dry-run");

const prisma = new PrismaClient();

async function main() {
  const finTexto = readFileSync(path.join(DIR_PLANILHAS, ARQ_FINANCEIRO), "utf8");
  const quantTexto = readFileSync(path.join(DIR_PLANILHAS, ARQ_QUANTITATIVO), "latin1");

  const fin = parseCsvBruto(finTexto).slice(1).filter((r) => r[0]?.trim() && r[3]?.trim());
  const quant = parseCsvBruto(quantTexto).slice(1).filter((r) => r[0]?.trim() && r[1]?.trim());

  // Coleta variantes: financeiro tem CNPJ (col 1); quantitativo só nome (col 0)
  const variantes: RegistroFornecedor[] = [];
  for (const r of fin) variantes.push({ nome: r[0].trim(), doc: documentoValido(r[1]), ocorrencias: 1 });
  for (const r of quant) variantes.push({ nome: r[0].trim(), doc: null, ocorrencias: 1 });

  const { finais: lista, conflitos } = agruparFornecedores(variantes);

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
