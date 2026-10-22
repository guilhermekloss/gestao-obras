-- CreateTable
CREATE TABLE "Infracao" (
    "id" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Infracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Infracao_regra_chave_criadoEm_idx" ON "Infracao"("regra", "chave", "criadoEm");

-- CreateIndex
CREATE INDEX "Infracao_criadoEm_idx" ON "Infracao"("criadoEm");
