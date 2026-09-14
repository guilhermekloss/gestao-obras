/**
 * Importa notas fiscais, itens, rateio por lote (obra) e parcelas das duas
 * planilhas históricas reais para o banco.
 *
 * As planilhas reais (`../Gestão de Obras/*.csv`) usam um formato bem mais
 * bruto do que o esperado por `importarPlanilhas`
 * (src/services/importacao.ts): rateio manual em 6 colunas fixas por lote,
 * parcelas espalhadas numa grade mensal fev/25→jul/26, e fornecedor grafado
 * de várias formas nas duas planilhas. Este script:
 *
 *  1. Canonicaliza os nomes de fornecedor com a mesma lógica de
 *     `importar-fornecedores.ts`, aplicando o MESMO nome final às linhas das
 *     duas planilhas — necessário porque `importarPlanilhas` casa item↔nota
 *     financeira pela chave (fornecedor, NF).
 *  2. Converte cada planilha para o formato simples documentado em
 *     `src/services/importacao.ts` e chama `importarPlanilhas`, reusando
 *     toda a lógica de rateio (peso→basis points), parcelas e detecção de
 *     inconsistências já usada pela tela `/importar`.
 *  3. Grava no banco replicando a mesma transação por nota da server action
 *     `executarImportacao` (src/app/(app)/importar/actions.ts).
 *  4. Antes de gravar, remove NotaFiscal/ItemNota/RateioNota/Parcela
 *     existentes (dados de demonstração de `teste-fluxo.ts`) — não toca em
 *     Fornecedor, Obra, Etapa ou Usuario.
 *
 * Uso: npx tsx prisma/importar-dados-reais.ts [--dry-run]
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { agruparFornecedores, documentoValido, parseCsvBruto, type RegistroFornecedor } from "./lib/planilhas-utils";
import { importarPlanilhas, normalizarChave, parseValorBr, parseDataBr } from "../src/services/importacao";

const DIR_PLANILHAS = path.join(process.cwd(), "..", "Gestão de Obras");
const ARQ_QUANTITATIVO = "AI_QUANTITATIVO MATERIAL LOTE 03 E LOTE 19-DESKTOP-ULU0IHP.csv";
const ARQ_FINANCEIRO = "AI_Notas Fiscais Orçamentos finalizados-DESKTOP-ULU0IHP.csv";
const RELATORIO = path.join(process.cwd(), "prisma", "import-report.txt");
const DRY_RUN = process.argv.includes("--dry-run");

const prisma = new PrismaClient();

/** Índices (0-based) das colunas fixas na planilha de quantitativo. */
const QI = {
  fornecedor: 0,
  nf: 1,
  descricao: 2,
  lote01: 3,
  lote02: 4,
  lote20: 5,
  lote21: 6,
  lote03: 7,
  lote19: 8,
  qtde: 9,
  und: 10,
  unitario: 11,
  desconto: 12,
  data: 14,
};

/** Índices (0-based) das colunas fixas na planilha financeira. */
const FI = { fornecedor: 0, cnpj: 1, data: 2, nf: 3, valorTotal: 6, forma: 10 };

/** Só os lotes com atividade real nesse período (confirmado com o usuário). */
const OBRAS_ATIVAS = ["L03", "L19"];

/**
 * Erros de digitação confirmados manualmente (nome do fornecedor tão
 * diferente entre as duas planilhas que a canonicalização fuzzy não uniu):
 * nome bruto da planilha → nome correto usado na outra planilha.
 */
const ALIASES_FORNECEDOR: Record<string, string> = {
  "ORPECORPEC ENGENHARIA INDUSTRIA E COMERCIO AS": "ORPEC ENGENHARIA INDUSTRIA E COMERCIO S.A.",
  "VIGATTO REFRIGERAÇÃO INST AR CONDICIONADO": "VIGATTO REFRIGERAÇÃO - INSTALAÇAO AR CONDICIONADO",
};

function aliasFornecedor(nomeBruto: string): string {
  return ALIASES_FORNECEDOR[nomeBruto] ?? nomeBruto;
}

/**
 * Normaliza o número da NF para casar a mesma nota entre as duas planilhas
 * mesmo quando a formatação difere (pontos, espaços, hífen, prefixo
 * "NFS-e nº"...): mantém só os dígitos. Quando não há dígito nenhum (nota
 * sem número real: "S/NF", "SEM NF", "X"...) mantém o texto original — essas
 * continuam sem casar entre as planilhas, mas ao menos não ficam vazias.
 */
function normalizarNf(s: string): string {
  const digitos = s.replace(/\D/g, "");
  return digitos || s.trim().toUpperCase();
}

/** Pares [valor, data pagamento] mensais, em ordem cronológica (fev/25 → jul/26). */
const MESES_PARCELA: { idxValor: number; idxData: number; mes: number; ano: number }[] = [
  { idxValor: 12, idxData: 13, mes: 2, ano: 2025 },
  { idxValor: 14, idxData: 15, mes: 3, ano: 2025 },
  { idxValor: 16, idxData: 17, mes: 4, ano: 2025 },
  { idxValor: 18, idxData: 19, mes: 5, ano: 2025 },
  { idxValor: 20, idxData: 21, mes: 6, ano: 2025 },
  { idxValor: 22, idxData: 23, mes: 7, ano: 2025 },
  { idxValor: 24, idxData: 25, mes: 8, ano: 2025 },
  { idxValor: 26, idxData: 27, mes: 9, ano: 2025 },
  { idxValor: 28, idxData: 29, mes: 10, ano: 2025 },
  { idxValor: 30, idxData: 31, mes: 11, ano: 2025 },
  { idxValor: 32, idxData: 33, mes: 12, ano: 2025 },
  { idxValor: 34, idxData: 35, mes: 1, ano: 2026 },
  { idxValor: 36, idxData: 37, mes: 2, ano: 2026 },
  { idxValor: 38, idxData: 39, mes: 3, ano: 2026 },
  { idxValor: 40, idxData: 41, mes: 4, ano: 2026 },
  { idxValor: 42, idxData: 43, mes: 5, ano: 2026 },
  { idxValor: 44, idxData: 45, mes: 6, ano: 2026 },
  { idxValor: 46, idxData: 47, mes: 7, ano: 2026 },
];

function campoCsv(v: string): string {
  const s = v ?? "";
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function linhaCsv(campos: string[]): string {
  return campos.map(campoCsv).join(";");
}

/**
 * Constrói as até 6 parcelas (valor, vencimento, data de pagamento) de uma
 * linha do financeiro. O vencimento é o dia 20 do mês da própria coluna
 * (regra observada nos dados: cartão vence dia 20 do mês seguinte); a data
 * de pagamento vem da coluna "DATA PAGAMENTO" pareada, quando válida.
 */
function parcelasDaLinha(row: string[]): string[] {
  const slots: string[] = [];
  for (const m of MESES_PARCELA) {
    const rawValor = (row[m.idxValor] ?? "").trim();
    if (parseValorBr(rawValor) === 0) continue;
    const rawPagoem = (row[m.idxData] ?? "").trim();
    const pagoem = parseDataBr(rawPagoem) ? rawPagoem : "";
    const venc = `20/${String(m.mes).padStart(2, "0")}/${m.ano}`;
    slots.push(rawValor, venc, pagoem);
    if (slots.length === 18) break; // 6 parcelas × 3 campos
  }
  while (slots.length < 18) slots.push("");
  return slots;
}

async function main() {
  const quantTexto = readFileSync(path.join(DIR_PLANILHAS, ARQ_QUANTITATIVO), "latin1");
  const finTexto = readFileSync(path.join(DIR_PLANILHAS, ARQ_FINANCEIRO), "utf8");
  const quantRows = parseCsvBruto(quantTexto).slice(1);
  const finRows = parseCsvBruto(finTexto).slice(1);

  // 1) Canonicaliza fornecedores das duas planilhas com a mesma lógica usada
  // para popular o cadastro (garante que a chave fornecedor+NF case entre os
  // dois arquivos, mesmo com grafias diferentes em cada um).
  const variantes: RegistroFornecedor[] = [];
  for (const r of finRows) {
    if (r[FI.fornecedor]?.trim()) {
      variantes.push({ nome: aliasFornecedor(r[FI.fornecedor].trim()), doc: documentoValido(r[FI.cnpj]), ocorrencias: 1 });
    }
  }
  for (const r of quantRows) {
    if (r[QI.fornecedor]?.trim()) {
      variantes.push({ nome: aliasFornecedor(r[QI.fornecedor].trim()), doc: null, ocorrencias: 1 });
    }
  }
  const { resolver } = agruparFornecedores(variantes);

  // 2) Monta os CSVs intermediários no formato esperado por importarPlanilhas.
  const headerItens = [
    "fornecedor", "cnpj", "nf", "data", "descricao", "tipo", "qtde", "unidade", "unitario", "desconto",
    "L01", "L02", "L03", "L19", "L20", "L21",
  ];
  const linhasItens = quantRows
    .filter((r) => r[QI.fornecedor]?.trim() && r[QI.nf]?.trim())
    .map((r) => {
      const f = resolver(aliasFornecedor(r[QI.fornecedor].trim()), null);
      // A coluna UND também indica itens não-materiais (MO, INSS, FRETE) —
      // usada tanto como unidade quanto para inferir o tipo do item.
      const und = (r[QI.und] ?? "").trim();
      return linhaCsv([
        f.nome,
        f.doc ?? "",
        normalizarNf(r[QI.nf].trim()),
        (r[QI.data] ?? "").trim(),
        (r[QI.descricao] ?? "").replace(/[\r\n]+/g, " ").trim(),
        und,
        (r[QI.qtde] ?? "").trim(),
        und,
        (r[QI.unitario] ?? "").trim(),
        (r[QI.desconto] ?? "").trim(),
        (r[QI.lote01] ?? "").trim(),
        (r[QI.lote02] ?? "").trim(),
        (r[QI.lote03] ?? "").trim(),
        (r[QI.lote19] ?? "").trim(),
        (r[QI.lote20] ?? "").trim(),
        (r[QI.lote21] ?? "").trim(),
      ]);
    });
  const csvItens = [linhaCsv(headerItens), ...linhasItens].join("\n");

  const headerFin = ["fornecedor", "cnpj", "nf", "data", "valor_total", "forma"];
  for (let n = 1; n <= 6; n++) headerFin.push(`parcela${n}_valor`, `parcela${n}_venc`, `parcela${n}_pagoem`);
  const linhasFin = finRows
    .filter((r) => r[FI.fornecedor]?.trim() && r[FI.nf]?.trim())
    .map((r) => {
      const f = resolver(aliasFornecedor(r[FI.fornecedor].trim()), documentoValido(r[FI.cnpj]));
      return linhaCsv([
        f.nome,
        f.doc ?? "",
        normalizarNf(r[FI.nf].trim()),
        (r[FI.data] ?? "").trim(),
        (r[FI.valorTotal] ?? "").trim(),
        (r[FI.forma] ?? "").trim(),
        ...parcelasDaLinha(r),
      ]);
    });
  const csvFinanceiro = [linhaCsv(headerFin), ...linhasFin].join("\n");

  // 3) Delega toda a lógica de negócio (rateio, parcelas, inconsistências)
  // ao importador que a aplicação já usa na tela /importar.
  const obras = await prisma.obra.findMany({ select: { id: true, codigo: true } });
  if (obras.length === 0) {
    console.error("Nenhuma obra cadastrada — rode `npm run db:seed` antes de importar.");
    process.exit(1);
  }
  const { notas, inconsistencias } = importarPlanilhas(csvItens, csvFinanceiro, OBRAS_ATIVAS);

  const totalItens = notas.reduce((a, n) => a + n.itens.length, 0);
  const totalParcelas = notas.reduce((a, n) => a + n.parcelas.length, 0);
  const totalRateios = notas.reduce((a, n) => a + n.rateios.length, 0);
  const valorTotal = notas.reduce((a, n) => a + n.totalCents, 0);
  console.log(`Notas reconhecidas: ${notas.length}`);
  console.log(`Itens: ${totalItens} · Parcelas: ${totalParcelas} · Rateios: ${totalRateios}`);
  console.log(`Valor total: R$ ${(valorTotal / 100).toFixed(2)}`);
  console.log(`Inconsistências: ${inconsistencias.length} (lista completa em prisma/import-report.txt)`);
  writeFileSync(RELATORIO, inconsistencias.join("\n") + "\n", "utf8");

  if (DRY_RUN) {
    console.log("\n--dry-run: nada foi gravado no banco.");
    return;
  }

  const obraPorCodigo = new Map(obras.map((o) => [normalizarChave(o.codigo), o.id]));

  // 4) Limpa dados de demonstração antes de gravar os reais — NotaFiscal em
  // cascata já cobre ItemNota/RateioNota/Parcela (onDelete: Cascade no schema).
  const apagadas = await prisma.notaFiscal.deleteMany({});
  console.log(`\nNotas de demonstração removidas: ${apagadas.count}`);

  const admin = await prisma.usuario.findFirst({ where: { role: "ADMIN" } });

  const fornecedoresDb = await prisma.fornecedor.findMany();
  const porCnpj = new Map(fornecedoresDb.filter((f) => f.cnpj).map((f) => [f.cnpj!, f.id]));
  const porNome = new Map(fornecedoresDb.map((f) => [normalizarChave(f.nome), f.id]));

  let importadas = 0;
  let fornecedoresCriados = 0;
  for (const n of notas) {
    await prisma.$transaction(async (tx) => {
      let fornecedorId =
        (n.cnpj ? porCnpj.get(n.cnpj) : undefined) ?? porNome.get(normalizarChave(n.fornecedor));
      if (!fornecedorId) {
        const f = await tx.fornecedor.create({
          data: { nome: n.fornecedor, cnpj: n.cnpj, obs: "Importado das planilhas reais" },
        });
        fornecedorId = f.id;
        fornecedoresCriados++;
        if (n.cnpj) porCnpj.set(n.cnpj, f.id);
        porNome.set(normalizarChave(n.fornecedor), f.id);
      }

      const nota = await tx.notaFiscal.create({
        data: {
          fornecedorId,
          numero: n.numero,
          dataCompra: n.dataCompra,
          totalCents: n.totalCents,
          formaPagto: n.formaPagto,
          obs: "Importado das planilhas reais",
          createdBy: admin?.id,
        },
      });

      if (n.itens.length > 0) {
        await tx.itemNota.createMany({
          data: n.itens.map((item) => ({
            notaId: nota.id,
            descricao: item.descricao,
            tipo: item.tipo,
            qtde: item.qtde,
            unidade: item.unidade,
            unitCents: item.unitCents,
            descontoCents: item.descontoCents,
            totalCents: item.totalCents,
          })),
        });
      }

      const rateiosValidos = n.rateios.filter((r) => obraPorCodigo.has(normalizarChave(r.codigoObra)));
      if (rateiosValidos.length > 0) {
        await tx.rateioNota.createMany({
          data: rateiosValidos.map((r) => ({
            notaId: nota.id,
            obraId: obraPorCodigo.get(normalizarChave(r.codigoObra))!,
            fracaoBp: r.fracaoBp,
          })),
        });
      }

      if (n.parcelas.length > 0) {
        await tx.parcela.createMany({
          data: n.parcelas.map((p) => ({
            notaId: nota.id,
            numero: p.numero,
            valorCents: p.valorCents,
            vencimento: p.vencimento,
            pagaEm: p.pagaEm,
            status: p.pagaEm ? ("PAGA" as const) : ("ABERTA" as const),
          })),
        });
      }
    });
    importadas++;
  }

  console.log(`Notas importadas: ${importadas} · Fornecedores novos: ${fornecedoresCriados}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
