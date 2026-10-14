-- Gestão de acessos: permissão por obra (CAMPO), convite por link e log de auditoria.

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "todasObras" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ultimoAcessoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UsuarioObra" (
    "usuarioId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,

    CONSTRAINT "UsuarioObra_pkey" PRIMARY KEY ("usuarioId","obraId")
);

-- CreateTable
CREATE TABLE "Convite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "nome" TEXT,
    "role" "Role" NOT NULL,
    "todasObras" BOOLEAN NOT NULL DEFAULT true,
    "obraIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "usadoEm" TIMESTAMP(3),
    "usuarioId" TEXT,

    CONSTRAINT "Convite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atividade" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "obraIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valorCents" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Atividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsuarioObra_obraId_idx" ON "UsuarioObra"("obraId");

-- CreateIndex
CREATE UNIQUE INDEX "Convite_tokenHash_key" ON "Convite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Convite_usuarioId_key" ON "Convite"("usuarioId");

-- CreateIndex
CREATE INDEX "Convite_criadoEm_idx" ON "Convite"("criadoEm");

-- CreateIndex
CREATE INDEX "Atividade_usuarioId_criadoEm_idx" ON "Atividade"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "Atividade_criadoEm_idx" ON "Atividade"("criadoEm");

-- CreateIndex
CREATE INDEX "Atividade_obraIds_idx" ON "Atividade" USING GIN ("obraIds");

-- AddForeignKey
ALTER TABLE "UsuarioObra" ADD CONSTRAINT "UsuarioObra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioObra" ADD CONSTRAINT "UsuarioObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convite" ADD CONSTRAINT "Convite_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convite" ADD CONSTRAINT "Convite_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

