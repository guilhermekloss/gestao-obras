-- CreateEnum
CREATE TYPE "OrigemExecucaoSefaz" AS ENUM ('AGENDADA', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatusExecucaoSefaz" AS ENUM ('SUCESSO', 'SEM_NOVIDADES', 'PULADA', 'ERRO', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "SituacaoDocumentoSefaz" AS ENUM ('RESUMO', 'COMPLETO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ManifestacaoSefaz" AS ENUM ('PENDENTE', 'CIENCIA_ENVIADA', 'ERRO', 'DISPENSADA');

-- CreateEnum
CREATE TYPE "StatusDocumentoSefaz" AS ENUM ('NOVA', 'LANCADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "CursorSefaz" (
    "cnpj" TEXT NOT NULL,
    "ultNsu" TEXT NOT NULL DEFAULT '000000000000000',
    "maxNsu" TEXT NOT NULL DEFAULT '000000000000000',
    "proximaConsultaEm" TIMESTAMP(3),
    "bloqueadoAte" TIMESTAMP(3),
    "travadoAte" TIMESTAMP(3),
    "ultimoCStat" TEXT,
    "ultimoMotivo" TEXT,
    "ultimaConsultaEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CursorSefaz_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "ExecucaoSefaz" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "origem" "OrigemExecucaoSefaz" NOT NULL,
    "status" "StatusExecucaoSefaz" NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "nsuInicial" TEXT,
    "nsuFinal" TEXT,
    "lotes" INTEGER NOT NULL DEFAULT 0,
    "docsRecebidos" INTEGER NOT NULL DEFAULT 0,
    "ciencias" INTEGER NOT NULL DEFAULT 0,
    "cStat" TEXT,
    "mensagem" TEXT,
    "duracaoMs" INTEGER,
    "disparadaPorId" TEXT,

    CONSTRAINT "ExecucaoSefaz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoSefaz" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "cnpjDestinatario" TEXT NOT NULL,
    "emitenteDoc" TEXT NOT NULL,
    "emitenteNome" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "situacao" "SituacaoDocumentoSefaz" NOT NULL,
    "manifestacao" "ManifestacaoSefaz" NOT NULL DEFAULT 'PENDENTE',
    "manifestacaoErro" TEXT,
    "manifestadoEm" TIMESTAMP(3),
    "xmlUrl" TEXT,
    "status" "StatusDocumentoSefaz" NOT NULL DEFAULT 'NOVA',
    "notaFiscalId" TEXT,
    "descartadoPorId" TEXT,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoSefaz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecucaoSefaz_iniciadaEm_idx" ON "ExecucaoSefaz"("iniciadaEm");

-- CreateIndex
CREATE INDEX "ExecucaoSefaz_cnpj_iniciadaEm_idx" ON "ExecucaoSefaz"("cnpj", "iniciadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoSefaz_chave_key" ON "DocumentoSefaz"("chave");

-- CreateIndex
CREATE INDEX "DocumentoSefaz_status_situacao_idx" ON "DocumentoSefaz"("status", "situacao");

-- CreateIndex
CREATE INDEX "DocumentoSefaz_dataEmissao_idx" ON "DocumentoSefaz"("dataEmissao");

-- CreateIndex
CREATE INDEX "DocumentoSefaz_manifestacao_idx" ON "DocumentoSefaz"("manifestacao");

-- CreateIndex
CREATE INDEX "DocumentoSefaz_notaFiscalId_idx" ON "DocumentoSefaz"("notaFiscalId");

-- AddForeignKey
ALTER TABLE "DocumentoSefaz" ADD CONSTRAINT "DocumentoSefaz_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
