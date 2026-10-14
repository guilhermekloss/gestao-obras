import { z } from "zod";

export const itemNotaSchema = z.object({
  descricao: z.string().min(1, "Descrição do item é obrigatória"),
  tipo: z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"]),
  qtde: z.number().positive("Quantidade deve ser positiva"),
  unidade: z.string().min(1, "Unidade é obrigatória"),
  unitCents: z.number().int().min(0),
  descontoCents: z.number().int().min(0).default(0),
});

export const rateioSchema = z.object({
  obraId: z.string().min(1, "Selecione a obra"),
  etapaId: z.string().optional(),
  fracaoBp: z.number().int().min(1).max(10000),
});

export const parcelaSchema = z.object({
  numero: z.number().int().min(1),
  valorCents: z.number().int().min(0),
  vencimento: z.string().min(1, "Vencimento é obrigatório"), // yyyy-mm-dd
});

export const tipoDocumentoSchema = z.enum(["NF", "RECIBO", "FOLHA", "GUIA", "OUTRO"]);

export const notaSchema = z.object({
  id: z.string().optional(), // presente na edição
  fornecedorId: z.string().min(1, "Selecione o fornecedor"),
  /**
   * Tipo do documento do lançamento. Opcional para manter compatíveis os
   * chamadores antigos (ex.: importação de XML): ausente = NF.
   */
  tipoDocumento: tipoDocumentoSchema.optional(),
  /**
   * Obrigatório só para NF. Nos demais tipos, vazio = o servidor gera um
   * número sequencial por fornecedor (ver `gerarNumeroDocumento`).
   */
  numero: z.string().trim(),
  dataCompra: z.string().min(1, "Data da compra é obrigatória"),
  totalCents: z.number().int().positive("Valor total deve ser maior que zero"),
  formaPagto: z.enum(["PIX", "CARTAO", "DEBITO", "BOLETO", "TRANSFERENCIA", "DINHEIRO"]),
  obs: z.string().optional(),
  anexoUrl: z.string().optional(),
  anexoNome: z.string().optional(),
  /**
   * Chave de acesso lida da foto/PDF da NF-e (só na criação; a edição
   * preserva a chave gravada). Evita lançar a mesma nota duas vezes.
   */
  chaveNfe: z.string().regex(/^\d{44}$/, "Chave de acesso inválida").optional(),
  itens: z.array(itemNotaSchema).min(1, "A nota precisa de ao menos 1 item"),
  rateios: z.array(rateioSchema).min(1, "Defina o rateio entre obras"),
  parcelas: z.array(parcelaSchema).min(1, "A nota precisa de ao menos 1 parcela"),
  /** confirma salvamento apesar de avisos (NF duplicada, divergência itens×total) */
  forcar: z.boolean().optional(),
});
// Sem `.refine` no objeto de propósito: o Zod 4 proíbe `.extend()`/`.pick()` em
// objetos com refinamento, e o schema é reaproveitado por outros módulos. A
// regra "NF exige número" fica em `salvarNota` (via `exigeNumero`).

export type NotaInput = z.infer<typeof notaSchema>;
export type ItemNotaInput = z.infer<typeof itemNotaSchema>;
