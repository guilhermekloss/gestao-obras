-- CreateEnum
CREATE TYPE "FrequenciaCaptura" AS ENUM ('UMA_VEZ_DIA', 'DUAS_VEZES_DIA');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "frequenciaCaptura" "FrequenciaCaptura" NOT NULL DEFAULT 'UMA_VEZ_DIA';
