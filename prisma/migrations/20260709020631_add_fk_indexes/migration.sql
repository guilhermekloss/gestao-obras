-- Índices em colunas de FK que já existiam no banco de dev mas não tinham
-- migração registrada (reconstituída a partir do drift detectado).
CREATE INDEX "ItemNota_notaId_idx" ON "ItemNota"("notaId");
CREATE INDEX "Medicao_etapaId_idx" ON "Medicao"("etapaId");
CREATE INDEX "NotaFiscal_fornecedorId_idx" ON "NotaFiscal"("fornecedorId");
CREATE INDEX "Parcela_notaId_idx" ON "Parcela"("notaId");
CREATE INDEX "RateioItem_itemId_idx" ON "RateioItem"("itemId");
