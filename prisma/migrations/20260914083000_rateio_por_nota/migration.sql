-- Rateio passa a pertencer à nota fiscal inteira, não a cada item.
-- Antes: RateioItem (itemId -> ItemNota). Agora: RateioNota (notaId -> NotaFiscal).
-- O formulário e a importação sempre aplicaram o mesmo rateio a todos os
-- itens de uma nota; este passo só move o dado para onde ele já vivia
-- conceitualmente (ver README §Pendências conscientes).

-- DropForeignKey
ALTER TABLE "RateioItem" DROP CONSTRAINT "RateioItem_itemId_fkey";
ALTER TABLE "RateioItem" DROP CONSTRAINT "RateioItem_obraId_fkey";
ALTER TABLE "RateioItem" DROP CONSTRAINT "RateioItem_etapaId_fkey";

-- DropTable
DROP TABLE "RateioItem";

-- CreateTable
CREATE TABLE "RateioNota" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "etapaId" TEXT,
    "fracaoBp" INTEGER NOT NULL,

    CONSTRAINT "RateioNota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateioNota_obraId_idx" ON "RateioNota"("obraId");

-- CreateIndex
CREATE UNIQUE INDEX "RateioNota_notaId_obraId_key" ON "RateioNota"("notaId", "obraId");

-- AddForeignKey
ALTER TABLE "RateioNota" ADD CONSTRAINT "RateioNota_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioNota" ADD CONSTRAINT "RateioNota_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioNota" ADD CONSTRAINT "RateioNota_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
