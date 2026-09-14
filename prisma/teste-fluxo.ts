/**
 * Script de verificação end-to-end do fluxo de dados (sem UI):
 * cria fornecedor + NF com itens, rateio 60/40 e 3 parcelas de cartão,
 * exatamente como a server action salvarNota faz.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fornecedor = await prisma.fornecedor.upsert({
    where: { cnpj: "12.345.678/0001-90" },
    update: {},
    create: { nome: "Aço Forte Distribuidora", cnpj: "12.345.678/0001-90" },
  });

  const [l03, l19] = await Promise.all([
    prisma.obra.findUniqueOrThrow({ where: { codigo: "L03" } }),
    prisma.obra.findUniqueOrThrow({ where: { codigo: "L19" } }),
  ]);

  const existente = await prisma.notaFiscal.findUnique({
    where: { fornecedorId_numero: { fornecedorId: fornecedor.id, numero: "TESTE-001" } },
  });
  if (existente) {
    console.log("NF de teste já existe — ok");
    return;
  }

  // Itens: 100 barras CA50 × R$ 45,90 + frete R$ 350,00 = R$ 4.940,00
  const itens = [
    { descricao: "CA50 8,00MM RETO 12,0M", tipo: "MATERIAL" as const, qtde: 100, unidade: "BR", unitCents: 4590, descontoCents: 0, totalCents: 459000 },
    { descricao: "FRETE", tipo: "FRETE" as const, qtde: 1, unidade: "FRETE", unitCents: 35000, descontoCents: 0, totalCents: 35000 },
  ];
  const totalCents = 494000;
  const rateios = [
    { obraId: l03.id, fracaoBp: 6000 },
    { obraId: l19.id, fracaoBp: 4000 },
  ];
  // 3x cartão: 164.668 + 164.666 + 164.666 = 494.000 ✓
  const parcelas = [
    { numero: 1, valorCents: 164668, vencimento: new Date(2026, 7, 20) },
    { numero: 2, valorCents: 164666, vencimento: new Date(2026, 8, 20) },
    { numero: 3, valorCents: 164666, vencimento: new Date(2026, 9, 20) },
  ];

  await prisma.$transaction(async (tx) => {
    const nota = await tx.notaFiscal.create({
      data: {
        fornecedorId: fornecedor.id,
        numero: "TESTE-001",
        dataCompra: new Date(2026, 6, 1),
        totalCents,
        formaPagto: "CARTAO",
      },
    });
    await tx.itemNota.createMany({
      data: itens.map((item) => ({ notaId: nota.id, ...item })),
    });
    await tx.rateioNota.createMany({
      data: rateios.map((r) => ({ notaId: nota.id, ...r })),
    });
    await tx.parcela.createMany({
      data: parcelas.map((p) => ({ notaId: nota.id, ...p })),
    });
  });

  console.log("NF de teste criada: R$ 4.940,00 · rateio L03 60% / L19 40% · 3x cartão");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
