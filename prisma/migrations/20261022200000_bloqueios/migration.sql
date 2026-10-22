-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "liberadoEm" TIMESTAMP(3),
    "liberadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bloqueio_chave_criadoEm_idx" ON "Bloqueio"("chave", "criadoEm");

-- CreateIndex
CREATE INDEX "Bloqueio_ate_idx" ON "Bloqueio"("ate");

-- CreateIndex
CREATE INDEX "Bloqueio_criadoEm_idx" ON "Bloqueio"("criadoEm");

-- CreateIndex
CREATE INDEX "Bloqueio_liberadoPorId_idx" ON "Bloqueio"("liberadoPorId");

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_liberadoPorId_fkey" FOREIGN KEY ("liberadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
