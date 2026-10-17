-- CreateEnum
CREATE TYPE "AmbienteSefaz" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "filiais" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uf" TEXT NOT NULL DEFAULT 'PR',
    "capturaAtiva" BOOLEAN NOT NULL DEFAULT false,
    "ambienteSefaz" "AmbienteSefaz" NOT NULL DEFAULT 'HOMOLOGACAO',
    "certificadoCifrado" BYTEA,
    "certificadoTitular" TEXT,
    "certificadoCnpj" TEXT,
    "certificadoEmissor" TEXT,
    "certificadoValidoDesde" TIMESTAMP(3),
    "certificadoValidoAte" TIMESTAMP(3),
    "certificadoEnviadoEm" TIMESTAMP(3),
    "certificadoEnviadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);
