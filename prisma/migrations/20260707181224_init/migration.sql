-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ESCRITORIO', 'CAMPO');

-- CreateEnum
CREATE TYPE "StatusObra" AS ENUM ('PLANEJAMENTO', 'ANDAMENTO', 'CONCLUIDA', 'PAUSADA');

-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('MATERIAL', 'SERVICO', 'FRETE', 'ENCARGO');

-- CreateEnum
CREATE TYPE "FormaPagto" AS ENUM ('PIX', 'CARTAO', 'DEBITO', 'BOLETO');

-- CreateEnum
CREATE TYPE "StatusParcela" AS ENUM ('ABERTA', 'PAGA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ESCRITORIO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cno" TEXT,
    "endereco" TEXT,
    "status" "StatusObra" NOT NULL DEFAULT 'ANDAMENTO',
    "inicioEm" TIMESTAMP(3),

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etapa" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "orcamentoCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "fone" TEXT,
    "obs" TEXT,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "dataCompra" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "formaPagto" "FormaPagto" NOT NULL,
    "obs" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemNota" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoItem" NOT NULL DEFAULT 'MATERIAL',
    "qtde" DECIMAL(12,3) NOT NULL,
    "unidade" TEXT NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "descontoCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "ItemNota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateioItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "etapaId" TEXT,
    "fracaoBp" INTEGER NOT NULL,

    CONSTRAINT "RateioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcela" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pagaEm" TIMESTAMP(3),
    "status" "StatusParcela" NOT NULL DEFAULT 'ABERTA',

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicao" (
    "id" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "percentBp" INTEGER NOT NULL,
    "obs" TEXT,
    "autorId" TEXT,

    CONSTRAINT "Medicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiarioObra" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "clima" TEXT,
    "efetivo" JSONB,
    "atividades" TEXT NOT NULL,
    "ocorrencias" TEXT,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiarioObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" TEXT NOT NULL,
    "diarioId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "legenda" TEXT,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Obra_codigo_key" ON "Obra"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cnpj_key" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE INDEX "NotaFiscal_dataCompra_idx" ON "NotaFiscal"("dataCompra");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_fornecedorId_numero_key" ON "NotaFiscal"("fornecedorId", "numero");

-- CreateIndex
CREATE INDEX "RateioItem_obraId_idx" ON "RateioItem"("obraId");

-- CreateIndex
CREATE UNIQUE INDEX "RateioItem_itemId_obraId_key" ON "RateioItem"("itemId", "obraId");

-- CreateIndex
CREATE INDEX "Parcela_vencimento_status_idx" ON "Parcela"("vencimento", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Parcela_notaId_numero_key" ON "Parcela"("notaId", "numero");

-- CreateIndex
CREATE INDEX "DiarioObra_obraId_data_idx" ON "DiarioObra"("obraId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "DiarioObra_obraId_data_key" ON "DiarioObra"("obraId", "data");

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemNota" ADD CONSTRAINT "ItemNota_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioItem" ADD CONSTRAINT "RateioItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemNota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioItem" ADD CONSTRAINT "RateioItem_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioItem" ADD CONSTRAINT "RateioItem_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicao" ADD CONSTRAINT "Medicao_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicao" ADD CONSTRAINT "Medicao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiarioObra" ADD CONSTRAINT "DiarioObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiarioObra" ADD CONSTRAINT "DiarioObra_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_diarioId_fkey" FOREIGN KEY ("diarioId") REFERENCES "DiarioObra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
