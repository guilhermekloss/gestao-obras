-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Arquivo" (
    "nome" TEXT NOT NULL,
    "enviadoPorId" TEXT,
    "tamanhoBytes" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("nome")
);

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "sucesso" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Arquivo_enviadoPorId_idx" ON "Arquivo"("enviadoPorId");

-- CreateIndex
CREATE INDEX "TentativaLogin_email_criadoEm_idx" ON "TentativaLogin"("email", "criadoEm");

-- CreateIndex
CREATE INDEX "TentativaLogin_ip_criadoEm_idx" ON "TentativaLogin"("ip", "criadoEm");

-- CreateIndex
CREATE INDEX "TentativaLogin_criadoEm_idx" ON "TentativaLogin"("criadoEm");

-- CreateIndex
CREATE INDEX "Foto_url_idx" ON "Foto"("url");

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
