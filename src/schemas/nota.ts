import { z } from "zod";
import { urlArquivoValida } from "@/services/arquivos";
import { centavos, dataIso, id, texto } from "./comum";

const itemNotaSchema = z.object({
  descricao: texto(500, "A descrição do item").min(1, "Descrição do item é obrigatória"),
  tipo: z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"]),
  qtde: z.number().positive("Quantidade deve ser positiva").max(1_000_000_000, "Quantidade acima do limite"),
  unidade: texto(20, "A unidade").min(1, "Unidade é obrigatória"),
  unitCents: centavos,
  descontoCents: centavos.default(0),
});

export const rateioSchema = z.object({
  obraId: id("Selecione a obra"),
  etapaId: z.string().max(64).optional(),
  fracaoBp: z.number().int().min(1).max(10000),
});

export const parcelaSchema = z.object({
  numero: z.number().int().min(1).max(360),
  valorCents: centavos,
  vencimento: dataIso("Vencimento é obrigatório"),
});

const tipoDocumentoSchema = z.enum(["NF", "RECIBO", "FOLHA", "GUIA", "OUTRO"]);

export const notaSchema = z.object({
  id: z.string().max(64).optional(), // presente na edição
  fornecedorId: id("Selecione o fornecedor"),
  /**
   * Tipo do documento do lançamento. Opcional para manter compatíveis os
   * chamadores antigos (ex.: importação de XML): ausente = NF.
   */
  tipoDocumento: tipoDocumentoSchema.optional(),
  /**
   * Obrigatório só para NF. Nos demais tipos, vazio = o servidor gera um
   * número sequencial por fornecedor (ver `gerarNumeroDocumento`).
   */
  numero: texto(60, "O número").trim(),
  dataCompra: dataIso("Data da compra é obrigatória"),
  totalCents: centavos.positive("Valor total deve ser maior que zero"),
  formaPagto: z.enum(["PIX", "CARTAO", "DEBITO", "BOLETO", "TRANSFERENCIA", "DINHEIRO"]),
  obs: texto(2000, "A observação").optional(),
  /** só arquivo enviado pelo app (`/api/fotos/<nome>`); vazio = sem anexo */
  anexoUrl: z
    .string()
    .refine((url) => url === "" || urlArquivoValida(url), "Anexo com endereço inválido")
    .optional(),
  anexoNome: texto(255, "O nome do anexo").optional(),
  /**
   * Chave de acesso lida da foto/PDF da NF-e (só na criação; a edição
   * preserva a chave gravada). Evita lançar a mesma nota duas vezes.
   */
  chaveNfe: z.string().regex(/^\d{44}$/, "Chave de acesso inválida").optional(),
  itens: z.array(itemNotaSchema).min(1, "A nota precisa de ao menos 1 item").max(500, "No máximo 500 itens por lançamento"),
  rateios: z.array(rateioSchema).min(1, "Defina o rateio entre obras").max(100),
  parcelas: z.array(parcelaSchema).min(1, "A nota precisa de ao menos 1 parcela").max(360),
  /** confirma salvamento apesar de avisos (NF duplicada, divergência itens×total) */
  forcar: z.boolean().optional(),
});
// Sem `.refine` no objeto de propósito: o Zod 4 proíbe `.extend()`/`.pick()` em
// objetos com refinamento, e o schema é reaproveitado por outros módulos. A
// regra "NF exige número" fica em `salvarNota` (via `exigeNumero`).

export type NotaInput = z.infer<typeof notaSchema>;
