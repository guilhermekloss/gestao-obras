-- Reforma tributária (IBS/CBS): regime da empresa, NFS-e, tributação por item da nota e tabelas oficiais da Receita.
-- Só cria tipo, colunas opcionais (ou com padrão) e tabelas novas: a versão no ar continua funcionando.

-- CreateEnum
CREATE TYPE "RegimeIbsCbs" AS ENUM ('NAO_INFORMADO', 'REGULAR', 'SIMPLES_NACIONAL');

-- AlterEnum
ALTER TYPE "TipoDocumento" ADD VALUE 'NFSE';

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "regimeIbsCbs" "RegimeIbsCbs" NOT NULL DEFAULT 'NAO_INFORMADO';

-- AlterTable
ALTER TABLE "ItemNota" ADD COLUMN     "cClassTrib" TEXT,
ADD COLUMN     "cCredPres" TEXT,
ADD COLUMN     "cbsCents" INTEGER,
ADD COLUMN     "credPresCents" INTEGER,
ADD COLUMN     "cst" TEXT,
ADD COLUMN     "ibsCbsBaseCents" INTEGER,
ADD COLUMN     "ibsCbsDiferidoCents" INTEGER,
ADD COLUMN     "ibsMunCents" INTEGER,
ADD COLUMN     "ibsUfCents" INTEGER,
ADD COLUMN     "nbs" TEXT,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "pCbs" DECIMAL(7,4),
ADD COLUMN     "pIbsMun" DECIMAL(7,4),
ADD COLUMN     "pIbsUf" DECIMAL(7,4),
ADD COLUMN     "pRedCbs" DECIMAL(7,4),
ADD COLUMN     "pRedIbs" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "crtEmitente" TEXT;

-- CreateTable
CREATE TABLE "ClassificacaoTributaria" (
    "codigo" TEXT NOT NULL,
    "inicioVigencia" DATE NOT NULL,
    "fimVigencia" DATE,
    "cst" TEXT NOT NULL,
    "descricaoCst" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipoAliquota" TEXT NOT NULL,
    "nomenclatura" TEXT,
    "pRedCbs" DECIMAL(7,4),
    "pRedIbs" DECIMAL(7,4),
    "apropriaCreditoCbs" BOOLEAN NOT NULL,
    "apropriaCreditoIbs" BOOLEAN NOT NULL,
    "creditoPresumidoAdquirente" BOOLEAN NOT NULL,
    "creditoPresumidoFornecedor" BOOLEAN NOT NULL,
    "indEstornoCredito" BOOLEAN NOT NULL,
    "indCreditoPresumidoOperacao" BOOLEAN NOT NULL,
    "creditoOperacaoAntecedente" TEXT,
    "indReducao" BOOLEAN NOT NULL,
    "indDiferimento" BOOLEAN NOT NULL,

    CONSTRAINT "ClassificacaoTributaria_pkey" PRIMARY KEY ("codigo","inicioVigencia")
);

-- CreateTable
CREATE TABLE "ClassificacaoNomenclatura" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cClassTrib" TEXT NOT NULL,
    "excecao" BOOLEAN NOT NULL DEFAULT false,
    "itemLc116" TEXT,
    "cIndOp" TEXT,
    "inicioVigencia" DATE NOT NULL,
    "fimVigencia" DATE,

    CONSTRAINT "ClassificacaoNomenclatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassificacaoTributaria_cst_idx" ON "ClassificacaoTributaria"("cst");

-- CreateIndex
CREATE INDEX "ClassificacaoNomenclatura_tipo_codigo_idx" ON "ClassificacaoNomenclatura"("tipo", "codigo");

-- CreateIndex
CREATE INDEX "ClassificacaoNomenclatura_cClassTrib_idx" ON "ClassificacaoNomenclatura"("cClassTrib");

