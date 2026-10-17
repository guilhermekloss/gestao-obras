-- CNO só em dígitos: a busca da obra pelo CNO da nota é por igualdade.
-- O que não fecha 12 dígitos fica como está (não casa com nota; o cadastro pede correção ao editar).
UPDATE "Obra"
SET "cno" = regexp_replace("cno", '\D', '', 'g')
WHERE "cno" IS NOT NULL AND length(regexp_replace("cno", '\D', '', 'g')) = 12;

UPDATE "Obra" SET "cno" = NULL WHERE "cno" IS NOT NULL AND btrim("cno") = '';

-- CreateIndex
CREATE INDEX "Obra_cno_idx" ON "Obra"("cno");

-- AlterTable
ALTER TABLE "DocumentoSefaz" ADD COLUMN     "cno" TEXT;
