-- Índices pela regra ESR (igualdade, ordenação, intervalo), cruzados com as queries reais: ver docs/auditoria-indices.md.
-- Tabelas pequenas: CREATE INDEX simples (CONCURRENTLY não roda dentro da migração) cabe no lock_timeout de 5 s.

-- DropIndex
DROP INDEX "NotaFiscal_fornecedorId_idx";

-- DropIndex
DROP INDEX "Parcela_vencimento_status_idx";

-- DropIndex
DROP INDEX "Parcela_notaId_idx";

-- DropIndex
DROP INDEX "Medicao_etapaId_idx";

-- DropIndex
DROP INDEX "DiarioObra_obraId_data_idx";

-- DropIndex
DROP INDEX "DocumentoSefaz_status_situacao_idx";

-- CreateIndex
CREATE INDEX "Etapa_obraId_ordem_idx" ON "Etapa"("obraId", "ordem");

-- CreateIndex
CREATE INDEX "NotaFiscal_fornecedorId_dataCompra_idx" ON "NotaFiscal"("fornecedorId", "dataCompra");

-- CreateIndex
CREATE INDEX "Parcela_status_vencimento_idx" ON "Parcela"("status", "vencimento");

-- CreateIndex
CREATE INDEX "Medicao_etapaId_data_idx" ON "Medicao"("etapaId", "data");

-- CreateIndex
CREATE INDEX "Foto_diarioId_idx" ON "Foto"("diarioId");

-- CreateIndex
CREATE INDEX "DocumentoSefaz_status_situacao_dataEmissao_idx" ON "DocumentoSefaz"("status", "situacao", "dataEmissao" DESC);

-- CreateIndex
CREATE INDEX "DocumentoSefaz_recebidoEm_idx" ON "DocumentoSefaz"("recebidoEm");

