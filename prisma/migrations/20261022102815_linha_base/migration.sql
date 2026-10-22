-- CreateTable
CREATE TABLE "LinhaBase" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "oficial" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorId" TEXT,

    CONSTRAINT "LinhaBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaBaseEtapa" (
    "id" TEXT NOT NULL,
    "linhaBaseId" TEXT NOT NULL,
    "etapaId" TEXT,
    "nome" TEXT NOT NULL,
    "inicio" DATE,
    "fim" DATE,
    "orcamentoCents" INTEGER NOT NULL,

    CONSTRAINT "LinhaBaseEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinhaBase_obraId_oficial_idx" ON "LinhaBase"("obraId", "oficial");

-- CreateIndex
CREATE INDEX "LinhaBaseEtapa_linhaBaseId_idx" ON "LinhaBaseEtapa"("linhaBaseId");

-- CreateIndex
CREATE INDEX "LinhaBaseEtapa_etapaId_idx" ON "LinhaBaseEtapa"("etapaId");

-- AddForeignKey
ALTER TABLE "LinhaBase" ADD CONSTRAINT "LinhaBase_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaBase" ADD CONSTRAINT "LinhaBase_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaBaseEtapa" ADD CONSTRAINT "LinhaBaseEtapa_linhaBaseId_fkey" FOREIGN KEY ("linhaBaseId") REFERENCES "LinhaBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaBaseEtapa" ADD CONSTRAINT "LinhaBaseEtapa_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
