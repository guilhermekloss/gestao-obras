-- AlterTable
ALTER TABLE "TentativaLogin" ADD COLUMN     "dispositivo" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "bloqueioAvisadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TentativaLogin_dispositivo_criadoEm_idx" ON "TentativaLogin"("dispositivo", "criadoEm");
