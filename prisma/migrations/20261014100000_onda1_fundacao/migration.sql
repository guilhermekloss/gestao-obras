-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('NF', 'RECIBO', 'FOLHA', 'GUIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "CondicaoTrabalho" AS ENUM ('PRATICAVEL', 'PARCIAL', 'IMPRATICAVEL');

ALTER TYPE "FormaPagto" ADD VALUE 'TRANSFERENCIA';
ALTER TYPE "FormaPagto" ADD VALUE 'DINHEIRO';

-- AlterTable
ALTER TABLE "DiarioObra" ADD COLUMN     "climaManha" TEXT,
ADD COLUMN     "climaTarde" TEXT,
ADD COLUMN     "condicao" "CondicaoTrabalho",
ADD COLUMN     "equipamentos" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Etapa" ADD COLUMN     "fimPrevisto" DATE,
ADD COLUMN     "inicioPrevisto" DATE;

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "chaveNfe" TEXT,
ADD COLUMN     "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'NF';

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_chaveNfe_key" ON "NotaFiscal"("chaveNfe");

