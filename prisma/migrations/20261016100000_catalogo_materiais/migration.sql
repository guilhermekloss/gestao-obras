-- AlterTable
ALTER TABLE "ItemNota" ADD COLUMN     "materialId" TEXT;

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "tipo" "TipoItem" NOT NULL DEFAULT 'MATERIAL',
    "categoria" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialApelido" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "descricaoOriginal" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "codigoProduto" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialApelido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_nome_key" ON "Material"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialApelido_chave_key" ON "MaterialApelido"("chave");

-- CreateIndex
CREATE INDEX "MaterialApelido_materialId_idx" ON "MaterialApelido"("materialId");

-- CreateIndex
CREATE INDEX "MaterialApelido_fornecedorId_codigoProduto_idx" ON "MaterialApelido"("fornecedorId", "codigoProduto");

-- CreateIndex
CREATE INDEX "ItemNota_materialId_idx" ON "ItemNota"("materialId");

-- AddForeignKey
ALTER TABLE "ItemNota" ADD CONSTRAINT "ItemNota_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApelido" ADD CONSTRAINT "MaterialApelido_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApelido" ADD CONSTRAINT "MaterialApelido_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

